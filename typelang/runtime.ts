// typelang/runtime.ts
// Effect handler runtime with composable handler stacks.

import { AnyInstr, AwaitedReturn, CancellationContext } from "./types.ts";

type Halt = Readonly<{ type: typeof HALT; effect: string; value: unknown }>;

type FinalizerResult = Readonly<{ value: unknown; halt: Halt | null }>;
type Finalizer = (value: unknown, halt: Halt | null) => unknown | Promise<unknown>;

type Next = (override?: AnyInstr) => Promise<unknown>;
type HandlerFn = (
  instr: AnyInstr,
  next: Next,
  ctx: CancellationContext,
) => unknown | Promise<unknown>;

export type Handler = Readonly<{
  name: string;
  handles: Readonly<Record<string, HandlerFn>>;
  finalize?: Finalizer;
}>;

type Dispatch = <I extends AnyInstr>(instr: I) => Promise<AwaitedReturn<I["__ret"]>>;

type RuntimeInstance = Readonly<{
  handlers: readonly Handler[];
  dispatch: Dispatch;
  controllerStack: AbortController[];
  cleanupStacks: Map<AbortController, Array<() => void | Promise<void>>>;
}>;

const HALT = Symbol("typelang.halt");

const runtimeStack: RuntimeInstance[] = [];

const isInstr = (value: unknown): value is AnyInstr =>
  Boolean(value) &&
  typeof value === "object" &&
  value !== null &&
  typeof (value as AnyInstr)._tag === "string" &&
  typeof (value as AnyInstr).kind === "string" &&
  Array.isArray((value as AnyInstr).args);

const isPromiseLike = <T>(value: unknown): value is PromiseLike<T> =>
  Boolean(value) && typeof (value as PromiseLike<T>).then === "function";

const isHalt = (value: unknown): value is Halt =>
  Boolean(value) && typeof value === "object" && (value as Halt).type === HALT;

const makeHalt = (effect: string, value: unknown): Halt => ({ type: HALT, effect, value });

const defaultFinalizeResult = (value: unknown, halt: Halt | null): FinalizerResult => ({
  value,
  halt,
});

const ensureFinalizerResult = (raw: unknown, prev: FinalizerResult): FinalizerResult => {
  if (
    raw && typeof raw === "object" && "value" in (raw as Record<string, unknown>) &&
    "halt" in (raw as Record<string, unknown>)
  ) {
    const candidate = raw as { value: unknown; halt: unknown };
    if (candidate.halt === null || isHalt(candidate.halt)) {
      return { value: candidate.value, halt: candidate.halt as Halt | null };
    }
  }
  return { value: raw, halt: prev.halt };
};

const resolveWithRuntime = async (
  value: unknown,
  runtime: RuntimeInstance | undefined,
): Promise<unknown> => {
  if (isPromiseLike(value)) {
    return await resolveWithRuntime(await value, runtime);
  }
  if (isInstr(value)) {
    if (!runtime) {
      const availableStacks = runtimeStack.length > 0
        ? runtimeStack.map((r) => `[${r.handlers.map((h) => h.name).join(", ")}]`).join(" -> ")
        : "none";
      throw new Error(
        `Effect ${value._tag}.${value.kind} used outside of a runtime stack\n` +
          `Available runtime stacks: ${availableStacks}\n` +
          `Hint: Wrap your code in stack(...handlers).run(() => ...)`,
      );
    }
    const dispatched = await runtime.dispatch(value);
    return await resolveWithRuntime(dispatched, runtime);
  }
  return value;
};

const runCleanups = async (
  runtime: RuntimeInstance,
  controller: AbortController,
  timeoutMs = 5000,
): Promise<void> => {
  const cleanups = runtime.cleanupStacks.get(controller);
  if (!cleanups || cleanups.length === 0) return;

  // Execute in LIFO order (reverse of registration) with timeout
  const reversed = [...cleanups].reverse();

  const cleanupPromise = (async () => {
    for (const cleanup of reversed) {
      try {
        await cleanup();
      } catch (error) {
        // Fail-safe: log but don't propagate cleanup errors
        console.error("Cleanup error:", error);
      }
    }
  })();

  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<void>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(`Cleanup timeout exceeded (${timeoutMs}ms) - forcing continuation`);
      resolve();
    }, timeoutMs);
  });

  try {
    await Promise.race([cleanupPromise, timeoutPromise]);
  } finally {
    // Always clear the timeout to prevent resource leak
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
};

const createCancellationContext = (runtime: RuntimeInstance): CancellationContext => {
  // Dynamically resolve the current controller from the top of the stack
  const getCurrentController = (): AbortController => {
    const stack = runtime.controllerStack;
    if (stack.length === 0) {
      throw new Error("No controller in stack - this should never happen");
    }
    return stack[stack.length - 1];
  };

  return {
    get signal(): AbortSignal {
      return getCurrentController().signal;
    },
    onCancel: (cleanup: () => void | Promise<void>): void => {
      const controller = getCurrentController();

      // If already aborted, run cleanup immediately
      if (controller.signal.aborted) {
        Promise.resolve(cleanup()).catch((error) => {
          console.error("Immediate cleanup error:", error);
        });
        return;
      }

      // Otherwise, register for later execution
      let cleanups = runtime.cleanupStacks.get(controller);
      if (!cleanups) {
        cleanups = [];
        runtime.cleanupStacks.set(controller, cleanups);
      }
      cleanups.push(cleanup);
    },
  };
};

const createRuntime = (handlers: readonly Handler[]): RuntimeInstance => {
  let runtime: RuntimeInstance;

  const runHandler = (index: number, instr: AnyInstr): unknown | Promise<unknown> => {
    if (index < 0) {
      const availableHandlers = handlers.map((h) => h.name).join(", ");
      throw new Error(
        `Unhandled effect ${instr._tag}.${instr.kind}\n` +
          `Available handlers: [${availableHandlers}]\n` +
          `Missing handler for: ${instr._tag}\n` +
          `Hint: Add handlers.${instr._tag}.<variant>() to your stack`,
      );
    }
    const handler = handlers[index];
    if (handler.name === instr._tag) {
      const fn = handler.handles[instr.kind];
      if (fn) {
        const nextDispatch: Next = (override) =>
          Promise.resolve(runHandler(index - 1, override ?? instr));
        const ctx = createCancellationContext(runtime);
        return fn(instr, nextDispatch, ctx);
      }
    }
    return runHandler(index - 1, instr);
  };

  const dispatch: Dispatch = async (instr) => {
    const result = await runHandler(handlers.length - 1, instr);
    return await resolveWithRuntime(result, runtime) as AwaitedReturn<typeof instr["__ret"]>;
  };

  runtime = {
    handlers,
    dispatch,
    controllerStack: [],
    cleanupStacks: new Map(),
  };
  return runtime;
};

const applyFinalizers = async (
  runtime: RuntimeInstance,
  initial: FinalizerResult,
): Promise<FinalizerResult> => {
  let acc = initial;
  for (let i = runtime.handlers.length - 1; i >= 0; i--) {
    const finalizer = runtime.handlers[i].finalize;
    if (!finalizer) continue;
    const raw = await resolveWithRuntime(finalizer(acc.value, acc.halt), runtime);
    acc = ensureFinalizerResult(raw, acc);
  }
  return acc;
};

export const halt = (effect: string, value: unknown): never => {
  throw makeHalt(effect, value);
};

export const resolveEff = async <T>(value: T): Promise<AwaitedReturn<T>> => {
  const runtime = runtimeStack[runtimeStack.length - 1];
  return await resolveWithRuntime(value, runtime) as AwaitedReturn<T>;
};

export const stack = (...handlers: readonly Handler[]) => ({
  run: async <A>(thunk: () => A): Promise<A> => {
    const runtime = createRuntime(handlers);
    const rootController = new AbortController();
    runtime.controllerStack.push(rootController);
    runtimeStack.push(runtime);

    // Install signal handlers for graceful shutdown
    const signalHandler = () => {
      console.log("\nReceived interrupt signal - starting graceful shutdown...");
      rootController.abort();
    };

    let signalsInstalled = false;
    try {
      Deno.addSignalListener("SIGINT", signalHandler);
      Deno.addSignalListener("SIGTERM", signalHandler);
      signalsInstalled = true;
    } catch {
      // Signal listeners not available (Windows, tests, etc.) - continue without them
    }

    let value: unknown;
    let halted: Halt | null = null;

    try {
      value = await resolveWithRuntime(thunk(), runtime);
    } catch (error) {
      if (isHalt(error)) {
        halted = error;
        value = undefined;
      } else {
        // Abort and run cleanup on exception
        rootController.abort();
        await runCleanups(runtime, rootController);
        runtime.controllerStack.pop();
        runtimeStack.pop();

        // Remove signal listeners
        if (signalsInstalled) {
          try {
            Deno.removeSignalListener("SIGINT", signalHandler);
            Deno.removeSignalListener("SIGTERM", signalHandler);
          } catch {
            // Ignore removal errors
          }
        }

        throw error;
      }
    }

    // Run cleanups before finalizers
    if (rootController.signal.aborted) {
      await runCleanups(runtime, rootController);
    }

    const finalized = await applyFinalizers(runtime, defaultFinalizeResult(value, halted));
    runtime.controllerStack.pop();
    runtimeStack.pop();

    // Remove signal listeners
    if (signalsInstalled) {
      try {
        Deno.removeSignalListener("SIGINT", signalHandler);
        Deno.removeSignalListener("SIGTERM", signalHandler);
      } catch {
        // Ignore removal errors
      }
    }

    if (finalized.halt) {
      throw new Error(`Unhandled effect ${finalized.halt.effect}`);
    }
    return finalized.value as A;
  },
});

// Scope management helpers --------------------------------------------------

/**
 * Get the current AbortController from the top of the stack.
 * Used by combinators to access the parent controller for linking child controllers.
 */
export const getCurrentScopeController = (): AbortController | null => {
  const runtime = runtimeStack[runtimeStack.length - 1];
  if (!runtime || runtime.controllerStack.length === 0) {
    return null;
  }
  return runtime.controllerStack[runtime.controllerStack.length - 1];
};

/**
 * Execute a thunk with a specific AbortController pushed to the stack.
 * Cleanup runs if the controller is aborted OR if an error occurs.
 * Use this for per-branch controllers in parallel operations.
 */
export const withController = async <T>(
  controller: AbortController,
  thunk: () => Promise<T>,
): Promise<T> => {
  const runtime = runtimeStack[runtimeStack.length - 1];
  if (!runtime) {
    throw new Error("withController called outside of runtime stack");
  }

  runtime.controllerStack.push(controller);

  let error: unknown = undefined;
  try {
    const result = await thunk();
    return result;
  } catch (e) {
    error = e;
    throw e;
  } finally {
    runtime.controllerStack.pop();

    // Run cleanup if this scope was aborted OR if an error occurred
    if (controller.signal.aborted || error !== undefined) {
      await runCleanups(runtime, controller);
    }
  }
};

/**
 * Execute a thunk with a new child AbortController.
 * The child is linked to the parent so parent cancellation propagates.
 * Cleanup always runs (like a finally block).
 */
export const withChildScope = async <T>(thunk: () => Promise<T>): Promise<T> => {
  const runtime = runtimeStack[runtimeStack.length - 1];
  if (!runtime) {
    throw new Error("withChildScope called outside of runtime stack");
  }

  const parentController = runtime.controllerStack[runtime.controllerStack.length - 1];
  const childController = new AbortController();

  // Link child to parent for propagation
  if (parentController) {
    parentController.signal.addEventListener("abort", () => {
      childController.abort();
    });
  }

  runtime.controllerStack.push(childController);

  try {
    const result = await thunk();
    return result;
  } finally {
    runtime.controllerStack.pop();
    // Always run cleanup (finally-style)
    await runCleanups(runtime, childController);
  }
};

// Built-in handlers ---------------------------------------------------------

type ConsoleRecord = {
  readonly log?: (...args: readonly unknown[]) => void;
  readonly warn?: (...args: readonly unknown[]) => void;
  readonly error?: (...args: readonly unknown[]) => void;
};

export type HandlerFactory = () => Handler;

const consoleCapture = (): Handler => {
  const logs: string[] = [];
  const warns: string[] = [];
  const errors: string[] = [];
  return {
    name: "Console",
    handles: {
      log: (instr, next, ctx) => {
        const [msg] = instr.args;
        logs.push(String(msg));
      },
      warn: (instr, next, ctx) => {
        const [msg] = instr.args;
        warns.push(String(msg));
      },
      error: (instr, next, ctx) => {
        const [msg] = instr.args;
        errors.push(String(msg));
      },
    },
    finalize: (value, halt) => ({
      value: { result: value, logs: [...logs], warns: [...warns], errors: [...errors] },
      halt,
    }),
  };
};

const consoleLive = (sink: ConsoleRecord = console): Handler => ({
  name: "Console",
  handles: {
    log: (instr, next, ctx) => {
      sink.log?.(...instr.args);
      return next(instr);
    },
    warn: (instr, next, ctx) => {
      sink.warn?.(...instr.args);
      return next(instr);
    },
    error: (instr, next, ctx) => {
      sink.error?.(...instr.args);
      return next(instr);
    },
  },
});

const exceptionTryCatch = (): Handler => {
  let failure: unknown = null;
  return {
    name: "Exception",
    handles: {
      fail: (instr, next, ctx) => {
        const [error] = instr.args;
        failure = error;
        halt("Exception", error);
      },
    },
    finalize: (value, haltState) => {
      if (haltState && haltState.effect === "Exception") {
        return {
          value: { tag: "Err" as const, error: failure },
          halt: null,
        };
      }
      return { value: { tag: "Ok" as const, value }, halt: haltState };
    },
  };
};

const stateWith = <S>(initial: S): Handler => {
  let state = initial;
  return {
    name: "State",
    handles: {
      get: (instr, next, ctx) => state,
      put: (instr, next, ctx) => {
        const [nextState] = instr.args as [S];
        state = nextState;
      },
      modify: (instr, next, ctx) => {
        const [fn] = instr.args as [(s: S) => S];
        state = fn(state);
      },
    },
    finalize: (value, haltState) => ({
      value: { result: value, state },
      halt: haltState,
    }),
  };
};

const asyncDefault = (): Handler => ({
  name: "Async",
  handles: {
    sleep: (instr, next, ctx) =>
      new Promise((resolve) => {
        const [ms] = instr.args as [number];
        const timerId = setTimeout(resolve, ms);
        // Register cleanup to cancel the timer
        ctx.onCancel(() => clearTimeout(timerId));
      }),
    await: async (instr, next, ctx) => {
      const [p] = instr.args as [Promise<unknown>];
      return await p;
    },
  },
});

const httpDefault = (): Handler => ({
  name: "Http",
  handles: {
    get: async (instr, next, ctx) => {
      const [url, options] = instr.args as [string, RequestInit | undefined];
      return await fetch(url, { ...options, signal: ctx.signal });
    },
    post: async (instr, next, ctx) => {
      const [url, body, options] = instr.args as [string, unknown, RequestInit | undefined];
      return await fetch(url, {
        ...options,
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json", ...options?.headers },
        signal: ctx.signal,
      });
    },
    put: async (instr, next, ctx) => {
      const [url, body, options] = instr.args as [string, unknown, RequestInit | undefined];
      return await fetch(url, {
        ...options,
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json", ...options?.headers },
        signal: ctx.signal,
      });
    },
    delete: async (instr, next, ctx) => {
      const [url, options] = instr.args as [string, RequestInit | undefined];
      return await fetch(url, { ...options, method: "DELETE", signal: ctx.signal });
    },
  },
});

export const handlers = {
  Console: {
    capture: consoleCapture,
    live: consoleLive,
  },
  Exception: {
    tryCatch: exceptionTryCatch,
  },
  State: {
    with: stateWith,
  },
  Async: {
    default: asyncDefault,
  },
  Http: {
    default: httpDefault,
  },
} as const;
