// typelang/runtime.ts
// Effect handler runtime with composable handler stacks.

import { AnyInstr, AwaitedReturn } from "./types.ts";

type Halt = Readonly<{ type: typeof HALT; effect: string; value: unknown }>;

type FinalizerResult = Readonly<{ value: unknown; halt: Halt | null }>;
type Finalizer = (value: unknown, halt: Halt | null) => unknown | Promise<unknown>;

type Next = (override?: AnyInstr) => Promise<unknown>;
type HandlerFn = (instr: AnyInstr, next: Next) => unknown | Promise<unknown>;

export type Handler = Readonly<{
  name: string;
  handles: Readonly<Record<string, HandlerFn>>;
  finalize?: Finalizer;
}>;

type Dispatch = <I extends AnyInstr>(instr: I) => Promise<AwaitedReturn<I["__ret"]>>;

type RuntimeInstance = Readonly<{
  handlers: readonly Handler[];
  dispatch: Dispatch;
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
      throw new Error(`Effect ${value._tag}.${value.kind} used outside of a runtime stack`);
    }
    const dispatched = await runtime.dispatch(value);
    return await resolveWithRuntime(dispatched, runtime);
  }
  return value;
};

const createRuntime = (handlers: readonly Handler[]): RuntimeInstance => {
  const runHandler = (index: number, instr: AnyInstr): unknown | Promise<unknown> => {
    if (index < 0) throw new Error(`Unhandled effect ${instr._tag}.${instr.kind}`);
    const handler = handlers[index];
    if (handler.name === instr._tag) {
      const fn = handler.handles[instr.kind];
      if (fn) {
        const nextDispatch: Next = (override) =>
          Promise.resolve(runHandler(index - 1, override ?? instr));
        return fn(instr, nextDispatch);
      }
    }
    return runHandler(index - 1, instr);
  };

  let runtime: RuntimeInstance;
  const dispatch: Dispatch = async (instr) => {
    const result = await runHandler(handlers.length - 1, instr);
    return await resolveWithRuntime(result, runtime) as AwaitedReturn<typeof instr["__ret"]>;
  };
  runtime = { handlers, dispatch };
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
    runtimeStack.push(runtime);
    let value: unknown;
    let halted: Halt | null = null;
    try {
      value = await resolveWithRuntime(thunk(), runtime);
    } catch (error) {
      if (isHalt(error)) {
        halted = error;
        value = undefined;
      } else {
        runtimeStack.pop();
        throw error;
      }
    }

    const finalized = await applyFinalizers(runtime, defaultFinalizeResult(value, halted));
    runtimeStack.pop();

    if (finalized.halt) {
      throw new Error(`Unhandled effect ${finalized.halt.effect}`);
    }
    return finalized.value as A;
  },
});

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
      log: (instr) => {
        const [msg] = instr.args;
        logs.push(String(msg));
      },
      warn: (instr) => {
        const [msg] = instr.args;
        warns.push(String(msg));
      },
      error: (instr) => {
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
    log: (instr, next) => {
      sink.log?.(...instr.args);
      return next(instr);
    },
    warn: (instr, next) => {
      sink.warn?.(...instr.args);
      return next(instr);
    },
    error: (instr, next) => {
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
      fail: (instr) => {
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
      get: () => state,
      put: (instr) => {
        const [next] = instr.args as [S];
        state = next;
      },
      modify: (instr) => {
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
    sleep: (instr) =>
      new Promise((resolve) => {
        const [ms] = instr.args as [number];
        setTimeout(resolve, ms);
      }),
    await: async (instr) => {
      const [p] = instr.args as [Promise<unknown>];
      return await p;
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
} as const;
