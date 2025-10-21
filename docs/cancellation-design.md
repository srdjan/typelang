# Automatic Cancellation & Disposal for typelang

**Version:** 1.0
**Date:** 2025-10-20
**Status:** Design Proposal

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Background & Motivation](#background--motivation)
3. [Effection Research Summary](#effection-research-summary)
4. [Design Goals & Principles](#design-goals--principles)
5. [Proposed Architecture](#proposed-architecture)
6. [Type System Changes](#type-system-changes)
7. [Runtime Implementation](#runtime-implementation)
8. [Handler API Extensions](#handler-api-extensions)
9. [Effect-Specific Designs](#effect-specific-designs)
10. [Combinator Integration](#combinator-integration)
11. [Signal Handling Integration](#signal-handling-integration)
12. [Migration Guide](#migration-guide)
13. [Code Examples](#code-examples)
14. [Implementation Checklist](#implementation-checklist)
15. [Trade-offs & Limitations](#trade-offs--limitations)
16. [Future Enhancements](#future-enhancements)
17. [References](#references)

---

## Executive Summary

### Problem Statement

typelang's current effect system lacks automatic resource cleanup and cancellation mechanisms. Users must manually wire `AbortSignal` through effect chains, leading to:

- **Boilerplate**: Manual signal threading through every async operation
- **Resource leaks**: No automatic cleanup when operations are interrupted (Ctrl-C, exceptions, timeouts)
- **Unsafe concurrency**: `par.race()` doesn't cancel losing branches, `par.all()` doesn't cancel siblings on failure
- **Poor developer experience**: Users must think about cancellation explicitly instead of getting it automatically

**Current state (problematic):**
```typescript
// User must manually thread AbortController
const controller = new AbortController();

const fetchUser = (id: string, signal: AbortSignal) =>
  seq()
    .let(() => Http.op.get(`/users/${id}`, signal))  // ← Manual signal passing
    .then((res) => res.json())
    .value();

// No automatic cleanup on Ctrl-C
await stack(httpHandler()).run(() => fetchUser("123", controller.signal));
```

### Solution Overview

Inspired by **Effection's automatic disposal mechanism**, this design proposes:

1. **Zero user-facing cancellation API** - Users never see or pass `AbortSignal`
2. **Automatic cleanup** - Handlers register cleanup callbacks via `ctx.onCancel()`
3. **Structured concurrency** - Parent cancellation propagates to children automatically
4. **Signal handling** - SIGINT/SIGTERM automatically trigger cleanup without user code
5. **LIFO cleanup order** - Cleanup callbacks run in reverse order of registration

**Desired state (after implementation):**
```typescript
// No AbortSignal, no manual wiring
const fetchUser = (id: string) =>
  seq()
    .let(() => Http.op.get(`/users/${id}`))  // ← Clean API
    .then((res) => res.json())
    .value();

// Ctrl-C automatically cancels fetch and runs cleanup
await stack(httpHandler()).run(() => fetchUser("123"));
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Expose AbortSignal to users?** | **No** - Hidden in runtime | Matches Effection's philosophy; cleaner API |
| **Handler signature change?** | **Breaking change** - Add required `ctx` param | Clean break enables better future evolution |
| **Cleanup order?** | **LIFO** (stack-based) | Matches resource acquisition order |
| **External cancellation API?** | **No** - Purely automatic | Keeps API surface minimal |

---

## Background & Motivation

### Why Automatic Cancellation Matters

Modern applications perform async operations (HTTP, timers, file I/O) that may need interruption:

1. **User interruption** - Ctrl-C during long-running process
2. **Timeouts** - Operation exceeds deadline
3. **Race conditions** - First-to-complete cancels others
4. **Failure propagation** - Sibling task fails, cancel all siblings
5. **Resource cleanup** - File handles, network connections, timers must be released

**Without automatic cancellation:**
- Resources leak (timers keep running, connections stay open)
- Ctrl-C leaves processes in inconsistent state
- Race operations waste CPU on losing branches
- Manual signal wiring creates boilerplate and bugs

**With automatic cancellation:**
- Resources cleaned up deterministically
- Ctrl-C triggers graceful shutdown
- Race automatically cancels losers
- Zero boilerplate - "it just works"

### Current typelang Limitations

#### 1. No Cleanup Mechanism

Handlers have `finalize()` but it only runs **after** the program completes successfully or fails. There's no way to interrupt in-flight operations:

```typescript
// Current: timer keeps running even if program is interrupted
const asyncHandler = (): Handler => ({
  name: "Async",
  handles: {
    sleep: (instr, next) => {
      const [ms] = instr.args;
      setTimeout(() => next(), ms);  // ← No way to cancel this timer
    }
  }
});
```

#### 2. Unsafe Parallel Combinators

`par.race()` doesn't cancel losing branches:
```typescript
// Losing branch keeps running, wasting resources
par.race([
  () => Http.op.get("/fast"),   // Completes in 10ms
  () => Http.op.get("/slow"),   // ← Still runs for 5 seconds!
])
```

`par.all()` doesn't cancel siblings on failure:
```typescript
// If users fails, posts keeps running
par.all({
  users: () => Http.op.get("/users"),  // ← Fails immediately
  posts: () => Http.op.get("/posts"),  // ← Wastes 10 seconds
})
```

#### 3. No Signal Handling

Ctrl-C during an HTTP request leaves the connection open:
```typescript
// User hits Ctrl-C, fetch keeps running
await stack(httpHandler()).run(() => Http.op.get("http://slow-api.com/data"));
// ↑ Process exits, but connection isn't aborted
```

---

## Effection Research Summary

**Source:** Effection v4.0.0-beta.2 (https://github.com/thefrontside/effection)

### Core Insights

#### 1. Automatic Disposal via Operation Encoding

**Key Quote:** "Every Effection operation contains the information on how to dispose of itself, and so the actual act of cancellation can be automated."

Effection operations use **try/finally patterns** to encode cleanup:
```typescript
// Effection pattern (simplified)
function* createWebSocket(url) {
  const socket = new WebSocket(url);
  try {
    yield* provide(socket);  // Suspends until caller completes
  } finally {
    socket.close();  // Cleanup runs automatically
    yield* until(() => socket.onclose);
  }
}
```

**Insight for typelang:** Handlers should register cleanup callbacks that the runtime executes automatically.

#### 2. Scope-Based Lifecycle Coupling

Resources are tied to caller lifecycle via **parent-child scope relationships**:
- Child task created with `owner: caller.scope`
- When caller completes, child scope closes
- Finally blocks execute during scope closure

**Insight for typelang:** Runtime should track active operations and propagate cancellation through the handler stack.

#### 3. Signal-Free API

Users never see or wire signals. The framework intercepts SIGINT/SIGTERM:

**Key Quote:** "If you run the above code in NodeJS and hit CTRL-C while the request is still in progress, it will properly cancel the in-flight request as a well-behaved HTTP client should, all without you ever having to think about it."

**Insight for typelang:** `stack().run()` should install signal handlers automatically and trigger cleanup on interrupt.

#### 4. Structured Concurrency

Cancellation propagates through composition:
- `race()` cancels losing branches
- `all()` cancels siblings on first failure
- Parent cancellation cascades to children

**Insight for typelang:** `par` and `seq` combinators should propagate cancellation automatically.

### Effection's Task Lifecycle

From source code analysis:

1. **Task creation** - `createTask()` establishes scope with parent linkage
2. **Cleanup registration** - `finally` blocks and `group.delete(task)` in finalization
3. **Cancellation trigger** - `halt()` closes delimiter, triggering cleanup
4. **Delimiter-based control** - `yield* top.close()` terminates operation
5. **Parent-child propagation** - Error boundaries and scopes cascade cancellation

**Key Pattern:**
```typescript
// Simplified Effection task pattern
const task = createTask(owner, operation);
group.add(task);
try {
  return await execute(operation);
} finally {
  group.delete(task);  // Cleanup on any exit path
}
```

---

## Design Goals & Principles

### Primary Goals

1. **Zero user-facing complexity** - Users never mention `AbortSignal` in effect code
2. **Automatic cleanup** - Resources cleaned up deterministically on any exit path
3. **Structured concurrency** - Cancellation propagates through combinators automatically
4. **Graceful shutdown** - SIGINT/SIGTERM trigger cleanup without explicit handling
5. **Type safety** - Cancellation context provided by runtime, enforced by types

### Non-Goals

1. **External cancellation API** - No `stack().run(program, { signal })` option
2. **Partial compatibility** - This is a breaking change (acceptable for v0.x)
3. **Instruction-level cancellation** - Cancellation at handler level, not per-instruction
4. **Nested scopes** - Single cancellation scope per `run()` (future enhancement)

### Design Principles

1. **Implicit over explicit** - Cancellation wired by runtime, not user code
2. **Safe by default** - Operations cancelable unless handler opts out
3. **Cleanup over errors** - Prefer cleanup to exception propagation
4. **LIFO cleanup** - Reverse order of acquisition (stack discipline)
5. **Fail-safe** - Cleanup errors logged, not thrown (prevent cleanup cascades)

---

## Proposed Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│  User Code (Effect Definitions & Usage)                     │
│  - No AbortSignal mentioned                                 │
│  - Clean effect APIs: Http.op.get(url)                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  typelang Runtime (stack().run())                           │
│  - Creates AbortController per run()                        │
│  - Installs SIGINT/SIGTERM handlers                         │
│  - Tracks cleanup callback stack (LIFO)                     │
│  - Executes cleanups on abort/exception/completion          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Handlers (Effect Interpreters)                             │
│  - Receive CancellationContext from runtime                 │
│  - Register cleanup: ctx.onCancel(() => clearTimeout(...))  │
│  - Use ctx.signal internally (fetch(url, { signal }))      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Side Effects (I/O, Timers, Network)                        │
│  - Aborted via native AbortSignal                           │
│  - Cleanup callbacks executed on cancellation               │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Cancellation Role |
|-----------|----------------|-------------------|
| **User Code** | Define effects, compose programs | None - transparent |
| **Runtime** | Manage AbortController, cleanup stack, signals | Create/trigger cancellation |
| **Handlers** | Register cleanup, use ctx.signal | Respond to cancellation |
| **Combinators** | Propagate cancellation to children | Coordinate multi-branch cancel |
| **Side Effects** | Accept AbortSignal, respond to abort | Execute actual cleanup |

---

## Type System Changes

### New Types (typelang/types.ts)

```typescript
/**
 * CancellationContext - Provided by runtime to handler functions.
 * Never exposed to user code.
 */
export type CancellationContext = Readonly<{
  /**
   * AbortSignal for this execution scope.
   * Handlers can pass this to native APIs (fetch, setTimeout via AbortController, etc.)
   */
  signal: AbortSignal;

  /**
   * Register a cleanup callback to run on cancellation.
   * Callbacks execute in LIFO order (last registered runs first).
   *
   * @example
   * ctx.onCancel(() => clearTimeout(timerId));
   */
  onCancel: (cleanup: () => void | Promise<void>) => void;
}>;
```

### Updated Types (typelang/runtime.ts)

```typescript
// BEFORE
type Next = (override?: AnyInstr) => Promise<unknown>;
type HandlerFn = (instr: AnyInstr, next: Next) => unknown | Promise<unknown>;

// AFTER (BREAKING CHANGE)
type Next = (override?: AnyInstr) => Promise<unknown>;
type HandlerFn = (
  instr: AnyInstr,
  next: Next,
  ctx: CancellationContext  // ← NEW: Required third parameter
) => unknown | Promise<unknown>;

export type Handler = Readonly<{
  name: string;
  handles: Readonly<Record<string, HandlerFn>>;
  finalize?: Finalizer;
  // No new fields - ctx passed per-invocation, not per-handler
}>;
```

### No Changes to Eff Type

```typescript
// Eff type signature UNCHANGED - users still see clean API
export type Eff<A, Caps> = A & { readonly __eff?: (e: Caps) => Caps };

// Effect definitions UNCHANGED - no signal parameters
const Http = defineEffect<"Http", {
  get: (url: string) => Response;  // ← No signal parameter
  post: (url: string, body: unknown) => Response;
}>("Http");
```

---

## Runtime Implementation

### Runtime State Extensions

```typescript
type RuntimeInstance = Readonly<{
  handlers: readonly Handler[];
  dispatch: Dispatch;
  controllerStack: AbortController[];    // ← NEW: Stack of scoped controllers
  cleanupStacks: Map<AbortController, Array<() => void | Promise<void>>>;  // ← NEW: Per-scope cleanup stacks
}>;

// Helper to get current (topmost) controller
const getCurrentController = (runtime: RuntimeInstance): AbortController =>
  runtime.controllerStack[runtime.controllerStack.length - 1];

// Helper to get cleanup stack for current controller
const getCurrentCleanups = (runtime: RuntimeInstance): Array<() => void | Promise<void>> => {
  const controller = getCurrentController(runtime);
  let cleanups = runtime.cleanupStacks.get(controller);
  if (!cleanups) {
    cleanups = [];
    runtime.cleanupStacks.set(controller, cleanups);
  }
  return cleanups;
};
```

### AbortController Lifecycle

```typescript
export const stack = (...handlers: readonly Handler[]) => ({
  run: async <A>(thunk: () => A): Promise<A> => {
    const rootController = new AbortController();  // ← NEW: Root controller
    const runtime = createRuntime(handlers, rootController);

    // NEW: Install signal handlers
    const signalHandler = () => {
      console.log("\nReceived interrupt signal, cleaning up...");
      rootController.abort();  // Abort root (propagates to all children)
    };
    Deno.addSignalListener("SIGINT", signalHandler);
    Deno.addSignalListener("SIGTERM", signalHandler);

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
        // NEW: Abort on exception, trigger cleanup
        rootController.abort();
        await runAllCleanups(runtime);
        Deno.removeSignalListener("SIGINT", signalHandler);
        Deno.removeSignalListener("SIGTERM", signalHandler);
        runtimeStack.pop();
        throw error;
      }
    }

    // NEW: Run cleanups on normal completion or abort
    if (rootController.signal.aborted) {
      await runAllCleanups(runtime);
    }

    const finalized = await applyFinalizers(runtime, defaultFinalizeResult(value, halted));

    // NEW: Cleanup signal handlers
    Deno.removeSignalListener("SIGINT", signalHandler);
    Deno.removeSignalListener("SIGTERM", signalHandler);
    runtimeStack.pop();

    if (finalized.halt) {
      throw new Error(`Unhandled effect ${finalized.halt.effect}`);
    }
    return finalized.value as A;
  },
});
```

### Cleanup Execution (LIFO)

```typescript
/**
 * Run cleanup callbacks for a specific controller scope in LIFO order.
 * Errors during cleanup are logged but don't propagate (fail-safe).
 */
const runCleanups = async (
  runtime: RuntimeInstance,
  controller: AbortController,
): Promise<void> => {
  const cleanups = runtime.cleanupStacks.get(controller);
  if (!cleanups || cleanups.length === 0) return;

  const reversed = [...cleanups].reverse();  // LIFO order

  for (const cleanup of reversed) {
    try {
      await cleanup();
    } catch (error) {
      // Fail-safe: log cleanup errors, don't throw
      console.error("Error during cleanup:", error);
    }
  }

  // Clear this scope's cleanup stack after execution
  runtime.cleanupStacks.delete(controller);
};

/**
 * Run ALL cleanup callbacks across all scopes (used on abort/error).
 * Executes scopes in LIFO order (innermost to outermost).
 */
const runAllCleanups = async (runtime: RuntimeInstance): Promise<void> => {
  // Process controller stack in reverse order (LIFO)
  const controllers = [...runtime.controllerStack].reverse();

  for (const controller of controllers) {
    await runCleanups(runtime, controller);
  }
};
```

### CancellationContext Creation

```typescript
const createCancellationContext = (runtime: RuntimeInstance): CancellationContext => {
  const controller = getCurrentController(runtime);
  const cleanups = getCurrentCleanups(runtime);

  return {
    signal: controller.signal,  // ← Returns current scope's signal

    onCancel: (cleanup) => {
      // Register cleanup in current scope's LIFO stack
      cleanups.push(cleanup);

      // If already aborted, run cleanup immediately
      if (controller.signal.aborted) {
        cleanup().catch((error) => {
          console.error("Error during immediate cleanup:", error);
        });
      }
    },
  };
};
```

### Handler Dispatch with Context

```typescript
const createRuntime = (
  handlers: readonly Handler[],
  rootController: AbortController,
): RuntimeInstance => {
  const controllerStack = [rootController];  // Initialize with root controller
  const cleanupStacks = new Map<AbortController, Array<() => void | Promise<void>>>();

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

        // NEW: Create context for this handler invocation
        // Returns current scope's controller signal
        const ctx = createCancellationContext(runtime);

        // NEW: Pass context as third parameter
        return fn(instr, nextDispatch, ctx);
      }
    }
    return runHandler(index - 1, instr);
  };

  let runtime: RuntimeInstance;
  const dispatch: Dispatch = async (instr) => {
    const result = await runHandler(handlers.length - 1, instr);
    return await resolveWithRuntime(result, runtime) as AwaitedReturn<typeof instr["__ret"]>;
  };

  runtime = { handlers, dispatch, controllerStack, cleanupStacks };
  return runtime;
};
```

---

## Handler API Extensions

### Handler Function Signature

**BREAKING CHANGE:** All handler functions must accept a third parameter `ctx: CancellationContext`.

```typescript
// OLD (v0.2.x)
type HandlerFn = (instr: AnyInstr, next: Next) => unknown | Promise<unknown>;

// NEW (v0.3.x)
type HandlerFn = (instr: AnyInstr, next: Next, ctx: CancellationContext) => unknown | Promise<unknown>;
```

### Using ctx in Handlers

#### Pattern 1: Register Cleanup Callback

```typescript
const handler = (): Handler => ({
  name: "Async",
  handles: {
    sleep: (instr, next, ctx) => {
      const [ms] = instr.args;

      return new Promise((resolve) => {
        const timerId = setTimeout(resolve, ms);

        // Register cleanup - clearTimeout on cancellation
        ctx.onCancel(() => {
          clearTimeout(timerId);
          console.log(`Canceled sleep(${ms}ms)`);
        });
      });
    },
  },
});
```

#### Pattern 2: Pass ctx.signal to Native APIs

```typescript
const handler = (): Handler => ({
  name: "Http",
  handles: {
    get: async (instr, next, ctx) => {
      const [url] = instr.args;

      // Pass signal to fetch - automatic abort on cancellation
      const response = await fetch(url, { signal: ctx.signal });
      return response;
    },
  },
});
```

#### Pattern 3: Ignore ctx (Synchronous Operations)

```typescript
const handler = (): Handler => ({
  name: "Console",
  handles: {
    log: (instr, next, ctx) => {  // ctx present but unused
      const [message] = instr.args;
      console.log(message);
      return next();
    },
  },
});
```

---

## Effect-Specific Designs

### Async Effect

#### sleep() - Cancelable Timers

**Current implementation (no cancellation):**
```typescript
const asyncDefault = (): Handler => ({
  name: "Async",
  handles: {
    sleep: (instr, next) => {
      const [ms] = instr.args;
      return new Promise((resolve) => {
        setTimeout(resolve, ms);  // ← Can't cancel
      });
    },
  },
});
```

**New implementation (with cancellation):**
```typescript
const asyncDefault = (): Handler => ({
  name: "Async",
  handles: {
    sleep: (instr, next, ctx) => {  // ← ctx added
      const [ms] = instr.args;

      return new Promise((resolve, reject) => {
        const timerId = setTimeout(resolve, ms);

        // Register cleanup callback
        ctx.onCancel(() => {
          clearTimeout(timerId);
          reject(new Error(`sleep(${ms}ms) canceled`));
        });
      });
    },

    await: async (instr, next, ctx) => {  // ← ctx added (unused here)
      const [promise] = instr.args;
      return await promise;  // Promise already cancelable via AbortController if passed
    },
  },
});
```

**User-facing API (unchanged):**
```typescript
// User code - no signal parameter
await Async.op.sleep(1000);
```

**Behavior:**
- Ctrl-C during sleep cancels timer and rejects promise
- Cleanup callback clears timeout to prevent memory leak
- Error message indicates cancellation (vs. normal completion)

---

### Http Effect (New)

#### Effect Definition

```typescript
// typelang/effects.ts
export interface HttpSpec {
  get(url: string): Response;
  post(url: string, body: unknown): Response;
  put(url: string, body: unknown): Response;
  delete(url: string): Response;
}

export const Http = defineEffect<"Http", HttpSpec>("Http");
```

**User-facing API:**
```typescript
// Clean API - no signal parameter
const response = await Http.op.get("https://api.example.com/users");
const data = await response.json();
```

#### Handler Implementation

```typescript
// typelang/runtime.ts (or separate http_handler.ts)
const httpDefault = (): Handler => ({
  name: "Http",
  handles: {
    get: async (instr, next, ctx) => {
      const [url] = instr.args;

      // Pass ctx.signal to fetch - automatic cancellation
      const response = await fetch(url, {
        signal: ctx.signal,  // ← Abort on cancellation
      });

      return response;
    },

    post: async (instr, next, ctx) => {
      const [url, body] = instr.args;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctx.signal,  // ← Abort on cancellation
      });

      return response;
    },

    put: async (instr, next, ctx) => {
      const [url, body] = instr.args;

      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctx.signal,
      });

      return response;
    },

    delete: async (instr, next, ctx) => {
      const [url] = instr.args;

      const response = await fetch(url, {
        method: "DELETE",
        signal: ctx.signal,
      });

      return response;
    },
  },
});

// Export in handlers object
export const handlers = {
  Console: { capture: consoleCapture, live: consoleLive },
  Exception: { tryCatch: exceptionTryCatch },
  State: { with: stateWith },
  Async: { default: asyncDefault },
  Http: { default: httpDefault },  // ← NEW
} as const;
```

**Behavior:**
- Ctrl-C during fetch aborts request via native AbortSignal
- Connection closed gracefully by browser/Deno runtime
- Fetch throws `AbortError` which propagates through effect stack
- No manual cleanup needed - fetch handles abort internally

---

### Console Effect

**Current implementation:**
```typescript
const consoleLive = (sink: ConsoleRecord = console): Handler => ({
  name: "Console",
  handles: {
    log: (instr, next) => {
      sink.log?.(...instr.args);
      return next();
    },
  },
});
```

**New implementation (ctx added but unused):**
```typescript
const consoleLive = (sink: ConsoleRecord = console): Handler => ({
  name: "Console",
  handles: {
    log: (instr, next, ctx) => {  // ← ctx added for signature compatibility
      sink.log?.(...instr.args);
      return next();
    },
    warn: (instr, next, ctx) => {
      sink.warn?.(...instr.args);
      return next();
    },
    error: (instr, next, ctx) => {
      sink.error?.(...instr.args);
      return next();
    },
  },
});
```

**Rationale:** Console operations are synchronous and don't need cancellation, but must accept `ctx` for type compatibility.

---

### State Effect

**Current implementation:**
```typescript
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
```

**New implementation (ctx added but unused):**
```typescript
const stateWith = <S>(initial: S): Handler => {
  let state = initial;
  return {
    name: "State",
    handles: {
      get: (instr, next, ctx) => state,  // ← ctx added
      put: (instr, next, ctx) => {
        const [next] = instr.args as [S];
        state = next;
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
```

**Rationale:** State is synchronous, no cancellation needed, but signature must match.

---

### Exception Effect

**Current implementation:**
```typescript
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
```

**New implementation (ctx added, used for abort on fail):**
```typescript
const exceptionTryCatch = (): Handler => {
  let failure: unknown = null;
  return {
    name: "Exception",
    handles: {
      fail: (instr, next, ctx) => {  // ← ctx added
        const [error] = instr.args;
        failure = error;

        // NEW: Abort controller on exception (triggers cleanup)
        ctx.onCancel(() => {
          console.log("Exception triggered cleanup");
        });

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
```

**Rationale:** Exception.fail() could trigger cleanup of in-flight operations before halting.

---

## Module Boundary Refactoring

### Problem Statement

The proposed cancellation mechanism requires combinators (`par.all`, `par.race`, etc. in `typelang/mod.ts`) to access the current runtime's `AbortController` to create properly-linked child controllers. However, `runtimeStack` is a **private module variable** in `typelang/runtime.ts`, creating an architectural conflict:

**Current clean boundary:**
```typescript
// typelang/runtime.ts
const runtimeStack: RuntimeInstance[] = [];  // ← Private, not exported

export { resolveEff, stack, handlers };  // ← Clean public API
```

```typescript
// typelang/mod.ts
import { resolveEff } from "./runtime.ts";  // ← Uses only public API

export const par = {
  all(tasks) {
    // Currently no access to runtime internals ✓
    return resolveEff(...);
  }
};
```

**Problematic approach (shown in sections below):**
```typescript
// typelang/mod.ts
export const par = {
  all(tasks) {
    const runtime = runtimeStack[runtimeStack.length - 1];  // ✗ Breaks encapsulation!
    return resolveEff(...);
  }
};
```

### Solution: Export Cancellation Helper Functions

Instead of exposing `runtimeStack`, **export helper functions** from `runtime.ts` that encapsulate controller management:

**New runtime.ts exports:**
```typescript
// typelang/runtime.ts

/**
 * Create a child AbortController linked to the current runtime's controller.
 * Pushes the child onto the controller stack, making it the current scope.
 * Returns null if called outside a runtime context.
 *
 * IMPORTANT: Must be paired with popControllerScope() to maintain stack integrity.
 */
export const pushControllerScope = (): AbortController | null => {
  const runtime = runtimeStack[runtimeStack.length - 1];
  if (!runtime) return null;

  const parentController = getCurrentController(runtime);
  const childController = new AbortController();

  // Link to parent - abort child when parent aborts
  if (parentController.signal.aborted) {
    childController.abort();
  } else {
    parentController.signal.addEventListener("abort", () => {
      childController.abort();
    });
  }

  // Push child onto stack - now becomes current scope
  runtime.controllerStack.push(childController);

  return childController;
};

/**
 * Remove the current controller scope from the stack.
 * Restores parent scope as current.
 * Runs cleanup callbacks for the popped scope.
 */
export const popControllerScope = async (): Promise<void> => {
  const runtime = runtimeStack[runtimeStack.length - 1];
  if (!runtime) {
    throw new Error("popControllerScope called outside runtime context");
  }

  if (runtime.controllerStack.length <= 1) {
    throw new Error("Cannot pop root controller scope");
  }

  const controller = runtime.controllerStack.pop()!;

  // Run cleanup callbacks for this scope
  await runCleanups(runtime, controller);
};

/**
 * Execute a thunk with a child cancellation scope.
 * Child scope is automatically:
 * - Pushed before thunk execution
 * - Popped after thunk completes (success or failure)
 * - Aborted if thunk throws
 * - Cleaned up via registered onCancel callbacks
 *
 * @returns result of thunk
 */
export const withChildScope = async <T>(
  thunk: () => Promise<T>,
): Promise<T> => {
  const controller = pushControllerScope();
  if (!controller) {
    throw new Error("withChildScope called outside runtime context");
  }

  try {
    const result = await thunk();
    return result;
  } catch (error) {
    // Abort child scope on exception
    controller.abort();
    throw error;
  } finally {
    // Always pop scope and run cleanup
    await popControllerScope();
  }
};

/**
 * Get the current AbortController for the active scope.
 * Returns null if called outside a runtime context.
 *
 * Useful for combinators that need to abort the current scope manually
 * (e.g., par.race aborting when first branch completes).
 */
export const getCurrentScopeController = (): AbortController | null => {
  const runtime = runtimeStack[runtimeStack.length - 1];
  if (!runtime) return null;
  return getCurrentController(runtime);
};

/**
 * Execute a thunk with a specific controller temporarily on the scope stack.
 * Cleanup only runs if the controller was aborted.
 *
 * This is a low-level primitive for combinators like par.race that need
 * per-branch scopes with conditional cleanup.
 *
 * @param controller - The AbortController to use for this scope
 * @param thunk - The computation to execute
 * @returns result of thunk
 */
export const withController = async <T>(
  controller: AbortController,
  thunk: () => Promise<T>,
): Promise<T> => {
  const runtime = runtimeStack[runtimeStack.length - 1];
  if (!runtime) {
    throw new Error("withController called outside runtime context");
  }

  // Push controller onto stack
  runtime.controllerStack.push(controller);

  try {
    const result = await thunk();
    return result;
  } finally {
    // Pop controller from stack
    runtime.controllerStack.pop();

    // Only run cleanup if this scope was aborted
    if (controller.signal.aborted) {
      await runCleanups(runtime, controller);
    }
  }
};
```

**Updated mod.ts imports:**
```typescript
// typelang/mod.ts
import {
  resolveEff,
  stack,
  withChildScope,
  withController,
  getCurrentScopeController,
} from "./runtime.ts";

export { stack };  // Re-export public API

// Note: pushControllerScope/popControllerScope not imported directly
// Use withChildScope (always runs cleanup) or withController (conditional cleanup)
```

### Benefits of This Approach

✅ **Encapsulation preserved** - `runtimeStack` and `controllerStack` remain private
✅ **Explicit scope management** - Push/pop pattern is clear and verifiable
✅ **Type-safe** - Functions throw outside runtime context
✅ **Testable** - Helper functions can be unit tested independently
✅ **Automatic cleanup** - `withChildScope` ensures cleanup runs
✅ **Future-proof** - Can change internal runtime representation

### Critical: Scope Stack Integrity

The controller stack must maintain integrity:
1. **Push before entering scope** - `pushControllerScope()` at combinator entry
2. **Pop after exiting scope** - `popControllerScope()` in finally block (or use `withChildScope`)
3. **Never orphan scopes** - Every push must have matching pop
4. **Handlers see current scope** - `createCancellationContext` returns top of stack

### Critical: Cleanup Only Runs on Cancellation

**Problem:** Shared scopes cause cleanup for successful operations.

If multiple concurrent operations share a scope, aborting the scope runs cleanup for ALL operations, including ones that completed successfully:

```typescript
// ❌ BROKEN: Shared scope
withChildScope(async () => {
  const controller = getCurrentScopeController()!;

  const [branchA, branchB] = await Promise.all([
    Http.op.get("/fast"),  // Completes successfully
    Http.op.get("/slow"),  // Still running
  ]);

  controller.abort();  // Abort to cancel branchB
  // ← Scope pop runs cleanup for BOTH A and B!
  // ← Branch A's cleanup runs even though it succeeded!
});
```

**Solution:** Each concurrent operation needs its own scope.

```typescript
// ✓ CORRECT: Per-operation scopes
const branchControllers = [new AbortController(), new AbortController()];

const [resultA, resultB] = await Promise.all([
  withController(branchControllers[0], () => Http.op.get("/fast")),
  withController(branchControllers[1], () => Http.op.get("/slow")),
]);

branchControllers[1].abort();  // Only aborted branch runs cleanup ✓
```

**Key:** `withController` only runs cleanup if `controller.signal.aborted === true`.

**Flow diagram:**
```
stack().run() starts
├─ controllerStack = [rootController]
├─ User code executes
│  ├─ Http.op.get(...) → ctx.signal = rootController.signal ✓
│  ├─ par.race() enters
│  │  ├─ pushControllerScope() → controllerStack = [root, child1]
│  │  ├─ Branch 1: Http.op.get(...) → ctx.signal = child1.signal ✓
│  │  ├─ Branch 2: Http.op.get(...) → ctx.signal = child1.signal ✓
│  │  ├─ Branch 1 wins → child1.abort()
│  │  ├─ Branch 2's fetch sees abort via ctx.signal ✓
│  │  └─ popControllerScope() → controllerStack = [root]
│  └─ Continues...
└─ stack().run() ends → runAllCleanups()
```

### Updated Combinator Patterns

With scope management, combinators create child scopes:

```typescript
// typelang/mod.ts

export const par = {
  all<T>(tasks: T) {
    return resolveEff(
      withChildScope(async () => {
        // Within child scope - handlers see child controller
        const entries = Object.entries(tasks);
        return await executeParallelWithCancellation(entries);
      }),
    ) as Eff<...>;
  },

  race<T>(thunks: T[]) {
    return resolveEff(
      withChildScope(async () => {
        // Within child scope
        const controller = getCurrentScopeController()!;  // Child controller
        const promises = thunks.map(t => resolveEff(t()));

        try {
          const result = await Promise.race(promises);
          controller.abort();  // Cancel losers - they see abort via ctx.signal!
          return result;
        } catch (error) {
          controller.abort();  // Cancel all on error
          throw error;
        }
      }),
    ) as Eff<...>;
  },
};
```

**Key insight:** Because handlers call `createCancellationContext` which returns the **top of the controller stack**, handlers executing within `par.race` branches automatically receive the child controller's signal, not the root controller's signal.

---

## Combinator Integration

### par.all() - Cancel All on First Failure

**Current implementation (no cancellation):**
```typescript
export const par = {
  all<T extends Record<string, () => Eff<unknown, unknown>>>(tasks: T) {
    const entries = Object.entries(tasks);
    return resolveEff(
      (async () => await mapEntries(entries))(),
    ) as unknown as Eff<
      { readonly [K in keyof T]: AwaitedReturn<ReturnType<T[K]>> },
      unknown
    >;
  },
};

const mapEntries = async (
  entries: readonly [string, () => Eff<unknown, unknown>][],
): Promise<Readonly<Record<string, unknown>>> => {
  const results = await Promise.all(entries.map(([_, task]) => resolveEff(task())));
  return Object.freeze(
    Object.fromEntries(entries.map(([key], index) => [key, results[index]])),
  );
};
```

**Problem:** If one task fails, others keep running.

**New implementation (with per-branch scopes to avoid cleanup on success):**
```typescript
export const par = {
  all<T extends Record<string, () => Eff<unknown, unknown>>>(tasks: T) {
    const entries = Object.entries(tasks);

    return resolveEff(
      (async () => {
        // Create a controller per branch
        const parentController = getCurrentScopeController();
        const branchControllers = entries.map(() => {
          const controller = new AbortController();
          // Link to parent
          if (parentController) {
            if (parentController.signal.aborted) {
              controller.abort();
            } else {
              parentController.signal.addEventListener("abort", () => {
                controller.abort();
              });
            }
          }
          return controller;
        });

        // Execute each branch with its own controller scope
        const promises = entries.map(async ([key, task], index) =>
          withController(branchControllers[index], async () => {
            const result = await resolveEff(task());
            return [key, result] as const;
          })
        );

        try {
          const results = await Promise.all(promises);
          return Object.freeze(Object.fromEntries(results));
        } catch (error) {
          // On failure, abort all branches
          // withController will run cleanup ONLY for aborted branches
          branchControllers.forEach((c) => c.abort());
          throw error;
        }
      })(),
    ) as unknown as Eff<
      { readonly [K in keyof T]: AwaitedReturn<ReturnType<T[K]>> },
      unknown
    >;
  },
};
```

**Key difference from race:** If all branches succeed, none are aborted, so no cleanup runs (correct).
If one branch fails, all are aborted, so all run cleanup (also correct - failure is cancellation).

**Behavior:**
```typescript
// If users fails, posts is automatically canceled
par.all({
  users: () => Http.op.get("/users"),  // ← Fails after 100ms
  posts: () => Http.op.get("/posts"),  // ← Aborted immediately
})
```

---

### par.race() - Cancel Losers

**Current implementation (no cancellation):**
```typescript
race<T, E>(thunks: readonly (() => Eff<T, E>)[]) {
  return resolveEff(Promise.race(thunks.map((t) => resolveEff(t())))) as unknown as Eff<
    AwaitedReturn<T>,
    E
  >;
}
```

**Problem:** Losing branches keep running.

**New implementation (with cancellation and per-branch scopes):**
```typescript
race<T, E>(thunks: readonly (() => Eff<T, E>)[]) {
  return resolveEff(
    (async () => {
      // Each branch gets its own scope for independent cleanup
      const branchPromises = thunks.map((thunk, index) =>
        withChildScope(async () => {
          const result = await resolveEff(thunk());
          return { index, result } as const;
        })
      );

      try {
        // Race the scoped branches
        const winner = await Promise.race(branchPromises);

        // Winner's scope already completed successfully (cleanup ran if needed)
        // Losers' scopes are still running - abort them via parent
        // This will cause their withChildScope to abort and run cleanup

        // Get parent controller and abort it to cascade to all child scopes
        const parentController = getCurrentScopeController();
        if (parentController) {
          // Aborting parent cascades to all children still running
          parentController.abort();
        }

        return winner.result;
      } catch (error) {
        // On error, abort all branches via parent
        const parentController = getCurrentScopeController();
        parentController?.abort();
        throw error;
      }
    })(),
  ) as unknown as Eff<AwaitedReturn<T>, E>;
}
```

**Problem with above approach:** Winner's scope completes before we can abort losers!

**Correct approach - per-branch scopes with conditional cleanup:**
```typescript
race<T, E>(thunks: readonly (() => Eff<T, E>)[]) {
  return resolveEff(
    (async () => {
      // Create a controller per branch
      const parentController = getCurrentScopeController();
      const branchControllers = thunks.map(() => {
        const controller = new AbortController();
        // Link to parent for propagation
        if (parentController) {
          if (parentController.signal.aborted) {
            controller.abort();
          } else {
            parentController.signal.addEventListener("abort", () => {
              controller.abort();
            });
          }
        }
        return controller;
      });

      // Execute each branch with its own controller scope
      const branchPromises = thunks.map(async (thunk, index) =>
        withController(branchControllers[index], async () => {
          const result = await resolveEff(thunk());
          return { index, result } as const;
        })
      );

      try {
        const winner = await Promise.race(branchPromises);

        // Abort all losing branches
        // withController will run cleanup ONLY for aborted branches
        branchControllers.forEach((controller, i) => {
          if (i !== winner.index) {
            controller.abort();
          }
        });

        return winner.result;
      } catch (error) {
        // Abort all branches on error
        branchControllers.forEach((c) => c.abort());
        throw error;
      }
    })(),
  ) as unknown as Eff<AwaitedReturn<T>, E>;
}
```

**Key fix:** `withController` runs cleanup ONLY if `controller.signal.aborted === true`.
Winner's branch completes without abort, so its cleanup never runs ✓
```

**Behavior:**
```typescript
// When /fast completes, /slow is automatically canceled
par.race([
  () => Http.op.get("/fast"),  // ← Completes in 10ms
  () => Http.op.get("/slow"),  // ← Aborted after 10ms
])
```

---

### par.map() - Cancel All on First Failure

**Current implementation:**
```typescript
map<T, U, E>(xs: readonly T[], f: (value: T) => Eff<U, E>) {
  return resolveEff(
    (async () => await Promise.all(xs.map((x) => resolveEff(f(x)))))(),
  ) as unknown as Eff<readonly AwaitedReturn<U>[], E>;
}
```

**New implementation (per-item scopes for correct cleanup):**
```typescript
map<T, U, E>(xs: readonly T[], f: (value: T) => Eff<U, E>) {
  return resolveEff(
    (async () => {
      // Create a controller per item
      const parentController = getCurrentScopeController();
      const itemControllers = xs.map(() => {
        const controller = new AbortController();
        // Link to parent
        if (parentController) {
          if (parentController.signal.aborted) {
            controller.abort();
          } else {
            parentController.signal.addEventListener("abort", () => {
              controller.abort();
            });
          }
        }
        return controller;
      });

      // Execute each item with its own controller scope
      const promises = xs.map(async (x, index) =>
        withController(itemControllers[index], async () => {
          return await resolveEff(f(x));
        })
      );

      try {
        return await Promise.all(promises);
      } catch (error) {
        // On failure, abort all items
        itemControllers.forEach((c) => c.abort());
        throw error;
      }
    })(),
  ) as unknown as Eff<readonly AwaitedReturn<U>[], E>;
}
```

---

### seq() - Propagate to Current Step

**Current implementation:**
```typescript
export function seq() {
  return buildSeq<{}, void>([]);
}

const buildSeq = <C, Last>(steps: readonly StepFn[]): SeqBuilder<C, Last> => ({
  then<A, E>(f: (last: Last) => Eff<A, E>) {
    const next: StepFn = async (state) => {
      const value = await resolveEff(f(state.last as Last));
      return { ctx: state.ctx, last: value };
    };
    return buildSeq<C, A>([...steps, next]);
  },
  // ... other methods
});
```

**New implementation (cancellation propagates automatically):**
No changes needed! Since `resolveEff` uses the current runtime's `AbortController`, cancellation propagates automatically:

```typescript
// If Ctrl-C during step 2, step 3 never runs
seq()
  .let(() => step1())       // ← Completes
  .then(() => step2())      // ← Ctrl-C here
  .then(() => step3())      // ← Never executed
  .value()
```

**Behavior:**
- AbortController abort triggers during any step
- Current step's handler receives aborted `ctx.signal`
- Subsequent steps never execute (runtime stops dispatching)
- Cleanup callbacks run in LIFO order

---

## Signal Handling Integration

### SIGINT (Ctrl-C)

**Installation:**
```typescript
export const stack = (...handlers: readonly Handler[]) => ({
  run: async <A>(thunk: () => A): Promise<A> => {
    const controller = new AbortController();
    const runtime = createRuntime(handlers, controller);

    // Install SIGINT handler
    const sigintHandler = () => {
      console.log("\n⚠️  Received SIGINT (Ctrl-C), cleaning up...");
      controller.abort();
    };
    Deno.addSignalListener("SIGINT", sigintHandler);

    try {
      // ... run program
    } finally {
      // Always remove listener
      Deno.removeSignalListener("SIGINT", sigintHandler);
    }
  },
});
```

**Behavior:**
1. User presses Ctrl-C
2. `sigintHandler` called by Deno runtime
3. `controller.abort()` triggers AbortSignal
4. All handlers with `ctx.signal` receive abort
5. Cleanup callbacks execute in LIFO order
6. Process exits gracefully

---

### SIGTERM (Graceful Shutdown)

**Installation:**
```typescript
const sigtermHandler = () => {
  console.log("\n⚠️  Received SIGTERM, shutting down gracefully...");
  controller.abort();
};
Deno.addSignalListener("SIGTERM", sigtermHandler);
```

**Behavior:** Same as SIGINT, but typically sent by process managers (systemd, Docker) instead of user.

---

### Cleanup Timeout

**Problem:** Cleanup might hang indefinitely (network timeout, deadlock).

**Solution:** Enforce cleanup timeout with hard exit fallback.

```typescript
const runCleanups = async (
  runtime: RuntimeInstance,
  timeoutMs: number = 5000,  // 5 second default
): Promise<void> => {
  const cleanups = [...runtime.cleanups].reverse();

  const cleanupPromise = (async () => {
    for (const cleanup of cleanups) {
      try {
        await cleanup();
      } catch (error) {
        console.error("Error during cleanup:", error);
      }
    }
  })();

  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(() => {
      console.error(`⚠️  Cleanup exceeded ${timeoutMs}ms timeout, forcing exit`);
      resolve();
    }, timeoutMs);
  });

  await Promise.race([cleanupPromise, timeoutPromise]);
  runtime.cleanups.length = 0;
};
```

**Configuration (future enhancement):**
```typescript
// Allow users to configure timeout
await stack(...handlers).run(program, { cleanupTimeoutMs: 10000 });
```

---

## Migration Guide

### Breaking Changes Summary

| Component | Change | Impact |
|-----------|--------|--------|
| **HandlerFn signature** | Add `ctx: CancellationContext` parameter | ALL custom handlers must update |
| **Built-in handlers** | Updated to accept `ctx` | Automatic if using `handlers.*` |
| **Runtime API** | Signal handling added | Transparent to users |
| **Combinators** | Cancellation propagation added | Transparent to users |

### Migration Steps

#### Step 1: Update Custom Handlers

**Before:**
```typescript
const myHandler = (): Handler => ({
  name: "MyEffect",
  handles: {
    doThing: (instr, next) => {
      // Implementation
    },
  },
});
```

**After:**
```typescript
const myHandler = (): Handler => ({
  name: "MyEffect",
  handles: {
    doThing: (instr, next, ctx) => {  // ← Add ctx parameter
      // Implementation (optionally use ctx.signal or ctx.onCancel)
    },
  },
});
```

#### Step 2: Add Cancellation Where Needed

**For async operations (timers):**
```typescript
// Before
sleep: (instr, next) => {
  const [ms] = instr.args;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// After
sleep: (instr, next, ctx) => {
  const [ms] = instr.args;
  return new Promise((resolve) => {
    const timerId = setTimeout(resolve, ms);
    ctx.onCancel(() => clearTimeout(timerId));  // ← Add cleanup
  });
}
```

**For network operations:**
```typescript
// Before
get: async (instr, next) => {
  const [url] = instr.args;
  return await fetch(url);
}

// After
get: async (instr, next, ctx) => {
  const [url] = instr.args;
  return await fetch(url, { signal: ctx.signal });  // ← Pass signal
}
```

**For synchronous operations:**
```typescript
// Before
log: (instr, next) => {
  console.log(...instr.args);
  return next();
}

// After (just add ctx, don't use it)
log: (instr, next, ctx) => {
  console.log(...instr.args);
  return next();
}
```

#### Step 3: Test Cancellation Scenarios

**Test Ctrl-C:**
```typescript
// Run a long-running program and press Ctrl-C
await stack(handlers.Async.default()).run(() =>
  seq()
    .do(() => Console.op.log("Starting long sleep..."))
    .do(() => Async.op.sleep(60000))  // 60 seconds
    .return(() => "Done")
);
// Press Ctrl-C during sleep - should cancel and exit gracefully
```

**Test par.race:**
```typescript
const result = await stack(handlers.Http.default()).run(() =>
  par.race([
    () => Http.op.get("https://httpbin.org/delay/10"),  // 10 second delay
    () => Http.op.get("https://httpbin.org/delay/1"),   // 1 second delay
  ])
);
// Verify first request completes, second is canceled
```

#### Step 4: Update Documentation

Update project documentation to reflect:
- Handler signature change
- Cancellation behavior
- Best practices for cleanup registration

---

### Backward Compatibility Strategy

**Decision: NO backward compatibility** (clean break for v0.x)

**Rationale:**
1. Project is pre-1.0 (currently v0.2.x)
2. Clean break enables better long-term API
3. Migration is mechanical (add `ctx` parameter)
4. Custom handlers are rare (most users use built-in handlers)

**Version bump:** v0.2.x → v0.3.0 (breaking change)

**Release notes template:**
```markdown
## v0.3.0 - Automatic Cancellation & Disposal

**BREAKING CHANGES:**

- Handler functions now require a third parameter `ctx: CancellationContext`
- All custom handlers must be updated to accept this parameter
- Built-in handlers (Console, State, Exception, Async) have been updated

**Migration:**
1. Add `ctx` parameter to all custom handler functions
2. Optionally use `ctx.signal` for cancelable operations
3. Register cleanup callbacks via `ctx.onCancel(cleanup)`

See [Migration Guide](docs/cancellation-design.md#migration-guide) for details.

**New Features:**

- Automatic cleanup on Ctrl-C (SIGINT/SIGTERM)
- `par.race()` cancels losing branches automatically
- `par.all()` cancels siblings on first failure
- Cancelable `Async.op.sleep()` via cleanup callbacks
- New `Http` effect with automatic request abortion

**Example:**

```typescript
// Ctrl-C during this sleep will cancel the timer
await stack(handlers.Async.default()).run(() =>
  Async.op.sleep(10000)
);
```
```

---

## Code Examples

### Example 1: HTTP Request with Auto-Cancel

**Scenario:** Fetch user data, cancel on Ctrl-C.

```typescript
import { stack, handlers, seq } from "./typelang/mod.ts";
import { Http, Console } from "./typelang/effects.ts";

const fetchUser = (id: string) =>
  seq()
    .do(() => Console.op.log(`Fetching user ${id}...`))
    .let(() => Http.op.get(`https://api.example.com/users/${id}`))
    .then((response) => response.json())
    .tap((user) => Console.op.log(`Got user: ${user.name}`))
    .value();

// Run with automatic cancellation
const user = await stack(
  handlers.Console.live(),
  handlers.Http.default(),
).run(() => fetchUser("123"));

// Press Ctrl-C during fetch → request aborted, cleanup runs, process exits
```

**Output (normal completion):**
```
Fetching user 123...
Got user: Alice
```

**Output (Ctrl-C during fetch):**
```
Fetching user 123...
^C
⚠️  Received SIGINT (Ctrl-C), cleaning up...
```

---

### Example 2: Multi-Step Workflow Cancellation

**Scenario:** Multi-step process, cancel propagates through all steps.

```typescript
const processOrder = (orderId: string) =>
  seq()
    .do(() => Console.op.log("Step 1: Validating order..."))
    .let(() => Http.op.get(`/orders/${orderId}`))
    .then((res) => res.json())

    .do(() => Console.op.log("Step 2: Checking inventory..."))
    .let((order) => Http.op.post("/inventory/check", { items: order.items }))
    .then((res) => res.json())

    .do(() => Console.op.log("Step 3: Processing payment..."))
    .do(() => Async.op.sleep(5000))  // Simulate payment processing
    .let(() => Http.op.post("/payments", { amount: 100 }))
    .then((res) => res.json())

    .do(() => Console.op.log("Step 4: Sending confirmation..."))
    .let(() => Http.op.post("/emails/send", { to: "customer@example.com" }))

    .return(() => "Order processed successfully");

await stack(
  handlers.Console.live(),
  handlers.Http.default(),
  handlers.Async.default(),
).run(() => processOrder("ORD-123"));

// Ctrl-C during Step 2 → all HTTP requests aborted, sleep canceled, process exits
```

**Output (Ctrl-C during Step 2):**
```
Step 1: Validating order...
Step 2: Checking inventory...
^C
⚠️  Received SIGINT (Ctrl-C), cleaning up...
```

---

### Example 3: Parallel Race with Auto-Cancel

**Scenario:** Race multiple API endpoints, cancel losers.

```typescript
const fetchFromFastestRegion = (path: string) =>
  par.race([
    () => Http.op.get(`https://us-east.api.com${path}`),
    () => Http.op.get(`https://eu-west.api.com${path}`),
    () => Http.op.get(`https://ap-south.api.com${path}`),
  ]);

const response = await stack(handlers.Http.default()).run(() =>
  fetchFromFastestRegion("/data")
);

// First region to respond wins, other two requests automatically canceled
```

**Behavior:**
- US-East responds in 50ms → EU-West and AP-South aborted
- No wasted resources on slow requests
- Automatic cleanup, no manual AbortController wiring

---

### Example 4: Parallel All with Failure Cancellation

**Scenario:** Fetch multiple resources, cancel all on first failure.

```typescript
const fetchDashboardData = () =>
  par.all({
    user: () => Http.op.get("/user/profile"),
    posts: () => Http.op.get("/user/posts"),
    comments: () => Http.op.get("/user/comments"),
    analytics: () => Http.op.get("/user/analytics"),
  });

const data = await stack(
  handlers.Http.default(),
  handlers.Exception.tryCatch(),
).run(() => fetchDashboardData());

// If /user/profile fails → /user/posts, /comments, /analytics all canceled
```

**Before (no cancellation):**
```
User profile fails after 100ms
Posts continues for 2 seconds
Comments continues for 3 seconds
Analytics continues for 5 seconds
Total wasted time: 10 seconds
```

**After (with cancellation):**
```
User profile fails after 100ms
→ All other requests aborted immediately
Total time: 100ms
```

---

### Example 5: Database Transaction Rollback

**Scenario:** Multi-step database transaction with automatic rollback on failure.

```typescript
const Db = defineEffect<"Db", {
  query<T>(sql: string): T[];
  execute(sql: string): void;
}>("Db");

const dbHandler = (connectionString: string): Handler => {
  let connection: Connection | null = null;
  let inTransaction = false;

  return {
    name: "Db",
    handles: {
      query: async (instr, next, ctx) => {
        const [sql] = instr.args;
        if (!connection) {
          connection = await connect(connectionString);
        }

        // Register rollback on cancellation
        if (inTransaction) {
          ctx.onCancel(async () => {
            console.log("Rolling back transaction...");
            await connection?.execute("ROLLBACK");
            await connection?.close();
          });
        }

        return await connection.query(sql);
      },

      execute: async (instr, next, ctx) => {
        const [sql] = instr.args;
        if (!connection) {
          connection = await connect(connectionString);
        }

        if (sql === "BEGIN") {
          inTransaction = true;
        } else if (sql === "COMMIT") {
          inTransaction = false;
        }

        // Register rollback on cancellation
        if (inTransaction) {
          ctx.onCancel(async () => {
            console.log("Rolling back transaction...");
            await connection?.execute("ROLLBACK");
            await connection?.close();
          });
        }

        return await connection.execute(sql);
      },
    },
  };
};

const transferFunds = (fromId: string, toId: string, amount: number) =>
  seq()
    .do(() => Db.op.execute("BEGIN"))
    .do(() => Db.op.execute(`UPDATE accounts SET balance = balance - ${amount} WHERE id = '${fromId}'`))
    .do(() => Async.op.sleep(2000))  // Simulate processing time
    .do(() => Db.op.execute(`UPDATE accounts SET balance = balance + ${amount} WHERE id = '${toId}'`))
    .do(() => Db.op.execute("COMMIT"))
    .return(() => "Transfer complete");

await stack(
  dbHandler("postgresql://localhost/mydb"),
  handlers.Async.default(),
).run(() => transferFunds("alice", "bob", 100));

// Ctrl-C during sleep → automatic ROLLBACK, no partial transfer
```

---

### Example 6: File Upload with Cleanup

**Scenario:** Upload file to S3, clean up temp file on cancellation.

```typescript
const File = defineEffect<"File", {
  createTemp(): string;
  write(path: string, data: Uint8Array): void;
  delete(path: string): void;
  read(path: string): Uint8Array;
}>("File");

const fileHandler = (): Handler => ({
  name: "File",
  handles: {
    createTemp: (instr, next, ctx) => {
      const tempPath = `/tmp/${crypto.randomUUID()}.tmp`;

      // Register cleanup - delete temp file on cancellation
      ctx.onCancel(async () => {
        console.log(`Deleting temp file: ${tempPath}`);
        try {
          await Deno.remove(tempPath);
        } catch (error) {
          console.error(`Failed to delete temp file: ${error}`);
        }
      });

      return tempPath;
    },

    write: async (instr, next, ctx) => {
      const [path, data] = instr.args;
      await Deno.writeFile(path, data);
    },

    delete: async (instr, next, ctx) => {
      const [path] = instr.args;
      await Deno.remove(path);
    },

    read: async (instr, next, ctx) => {
      const [path] = instr.args;
      return await Deno.readFile(path);
    },
  },
});

const uploadToS3 = (data: Uint8Array, bucket: string, key: string) =>
  seq()
    .let(() => File.op.createTemp())  // Create temp file (registers cleanup)
    .tap((tempPath) => File.op.write(tempPath, data))
    .let((tempPath) => File.op.read(tempPath))
    .let((fileData) => Http.op.put(
      `https://${bucket}.s3.amazonaws.com/${key}`,
      fileData,
    ))
    .return(() => `s3://${bucket}/${key}`);

await stack(
  fileHandler(),
  handlers.Http.default(),
).run(() => uploadToS3(myData, "my-bucket", "file.dat"));

// Ctrl-C during upload → temp file automatically deleted
```

---

## Implementation Checklist

### Phase 1: Core Runtime (Week 1)

- [ ] **Add CancellationContext type** (`typelang/types.ts`)
  - Define `signal: AbortSignal` property
  - Define `onCancel` callback registration function
  - Export type from module

- [ ] **Update HandlerFn signature** (`typelang/runtime.ts`)
  - Change from `(instr, next)` to `(instr, next, ctx)`
  - Update type definition
  - Update JSDoc comments

- [ ] **Add cleanup stack to RuntimeInstance** (`typelang/runtime.ts`)
  - Add `cleanups: Array<() => void | Promise<void>>` field
  - Add `controller: AbortController` field
  - Update `createRuntime` to initialize these fields

- [ ] **Implement LIFO cleanup execution** (`typelang/runtime.ts`)
  - Create `runCleanups(runtime)` function
  - Reverse cleanup array before execution
  - Wrap each cleanup in try/catch (fail-safe)
  - Log cleanup errors without propagating

- [ ] **Add AbortController per run()** (`typelang/runtime.ts`)
  - Create controller at start of `stack().run()`
  - Pass controller to `createRuntime`
  - Abort controller on exception
  - Run cleanups after abort

- [ ] **Create CancellationContext factory** (`typelang/runtime.ts`)
  - `createCancellationContext(runtime)` function
  - Expose `runtime.controller.signal` as `ctx.signal`
  - Implement `ctx.onCancel` to push to cleanup stack
  - Handle immediate cleanup if already aborted

- [ ] **Pass context to handler functions** (`typelang/runtime.ts`)
  - Update `runHandler` to create context per invocation
  - Pass `ctx` as third argument to handler function
  - Update error messages for new signature

- [ ] **Export scope management helpers** (`typelang/runtime.ts`)
  - Implement `pushControllerScope()` function
  - Implement `popControllerScope()` function
  - Implement `withChildScope(thunk)` - always runs cleanup
  - Implement `withController(controller, thunk)` - conditional cleanup
  - Implement `getCurrentScopeController()` function
  - Export all helpers for combinator use
  - Add unit tests for helper functions

### Phase 2: Built-in Handlers (Week 2)

- [ ] **Update Async handler** (`typelang/runtime.ts`)
  - Add `ctx` parameter to `sleep` handler
  - Register `clearTimeout` cleanup callback
  - Add `ctx` parameter to `await` handler (unused)
  - Test cancelable sleep

- [ ] **Create Http handler** (`typelang/runtime.ts` or separate file)
  - Define `HttpSpec` interface in `effects.ts`
  - Export `Http` effect via `defineEffect`
  - Implement `get` handler with `fetch(url, { signal: ctx.signal })`
  - Implement `post`, `put`, `delete` handlers
  - Add to `handlers` export object
  - Test request cancellation

- [ ] **Update Console handler** (`typelang/runtime.ts`)
  - Add `ctx` parameter to all console methods
  - No cancellation logic needed (synchronous)
  - Update tests

- [ ] **Update State handler** (`typelang/runtime.ts`)
  - Add `ctx` parameter to all state methods
  - No cancellation logic needed (synchronous)
  - Update tests

- [ ] **Update Exception handler** (`typelang/runtime.ts`)
  - Add `ctx` parameter to `fail` handler
  - Optionally trigger cleanup on exception
  - Update tests

- [ ] **Write handler cancellation tests** (`typelang/runtime_test.ts`)
  - Test `Async.sleep()` cancellation via abort
  - Test `Http.get()` cancellation via abort
  - Test cleanup callback execution order (LIFO)
  - Test cleanup error handling (fail-safe)

### Phase 3: Combinators (Week 3)

- [ ] **Import scope management helpers** (`typelang/mod.ts`)
  - Import `withController` from runtime
  - Import `getCurrentScopeController` from runtime
  - Update module exports

- [ ] **Update par.all() for cancellation** (`typelang/mod.ts`)
  - Create per-branch AbortControllers
  - Link each controller to parent for propagation
  - Use `withController` for each branch (conditional cleanup)
  - Abort all branches on failure
  - Test: successful branches don't run cleanup
  - Test: failed branches run cleanup

- [ ] **Update par.race() for cancellation** (`typelang/mod.ts`)
  - Create per-branch AbortControllers
  - Link each controller to parent for propagation
  - Use `withController` for each branch
  - Abort losing branches when first completes
  - Test: winner doesn't run cleanup
  - Test: losers run cleanup

- [ ] **Update par.map() for cancellation** (`typelang/mod.ts`)
  - Create per-item AbortControllers
  - Link each controller to parent for propagation
  - Use `withController` for each item
  - Abort all items on failure
  - Test: conditional cleanup semantics

- [ ] **Verify seq() propagation** (`typelang/mod.ts`)
  - No code changes needed (automatic via runtime)
  - Test cancellation during intermediate steps
  - Verify subsequent steps don't execute

- [ ] **Write combinator cancellation tests** (`typelang/runtime_test.ts`)
  - Test `par.all()` sibling cancellation
  - Test `par.race()` loser cancellation
  - Test `par.map()` failure propagation
  - Test `seq()` step interruption

### Phase 4: Signal Handling (Week 4)

- [ ] **Install SIGINT handler in run()** (`typelang/runtime.ts`)
  - `Deno.addSignalListener("SIGINT", handler)`
  - Handler calls `controller.abort()`
  - Log graceful shutdown message
  - Remove listener in finally block

- [ ] **Install SIGTERM handler in run()** (`typelang/runtime.ts`)
  - Same as SIGINT handler
  - Share handler function if possible

- [ ] **Add cleanup timeout mechanism** (`typelang/runtime.ts`)
  - Race cleanup promise against timeout
  - Default 5 second timeout
  - Log warning if timeout exceeded
  - Force exit if needed (future: make configurable)

- [ ] **Test Ctrl-C scenarios** (manual testing)
  - Create test program with long-running operation
  - Press Ctrl-C during execution
  - Verify cleanup runs and process exits gracefully
  - Test timeout behavior with hung cleanup

### Phase 5: Documentation & Migration (Week 5)

- [ ] **Update CLAUDE.md** (`/CLAUDE.md`)
  - Add cancellation to "Development Patterns and Conventions"
  - Update handler examples with `ctx` parameter
  - Add section on automatic cleanup best practices

- [ ] **Create migration guide** (`docs/migration-v0.3.md`)
  - Copy "Migration Guide" section from this design doc
  - Add version-specific instructions
  - Include before/after code examples
  - Link from main README

- [ ] **Update all examples** (`app/`, `docs/examples/`)
  - Update handler examples with `ctx` parameter
  - Add cancellation examples to showcase
  - Update playground examples if applicable

- [ ] **Add to learn_handlers.ts** (`app/pages/learn_handlers.ts`)
  - New concept: "Cancellation & Cleanup"
  - Explain `ctx.signal` and `ctx.onCancel`
  - Show Ctrl-C behavior
  - Link to examples

- [ ] **Write release notes** (`CHANGELOG.md` or similar)
  - Use template from migration guide
  - Highlight breaking changes
  - Include migration instructions
  - List new features

### Phase 6: Final Testing & Release (Week 6)

- [ ] **Integration testing**
  - Test all examples run correctly
  - Test Ctrl-C in various scenarios
  - Test parallel cancellation patterns
  - Verify no resource leaks

- [ ] **Performance testing**
  - Benchmark cleanup overhead
  - Verify LIFO order doesn't degrade performance
  - Test with large cleanup stacks

- [ ] **Documentation review**
  - Proofread all new documentation
  - Verify code examples compile and run
  - Check for broken links

- [ ] **Release preparation**
  - Bump version to v0.3.0
  - Update deno.json version field
  - Create git tag
  - Push to repository

### Phase 7: Post-Release Improvements (v0.4.0)

- [ ] **Implement AsyncLocalStorage for controller stack** (Open Issue #1)
  - Evaluate Deno async_hooks support stability
  - Migrate controllerStack from global to AsyncLocalStorage
  - Update withController/withChildScope implementations
  - Test concurrent branch isolation
  - Fallback to documented limitation if unavailable

- [ ] **Tighten withController error handling** (Open Issue #2)
  - Abort controller on exception
  - Register late-abort handlers
  - Always remove cleanup lists in finally
  - Add tests for edge cases (late abort, concurrent abort)

- [ ] **Document withChildScope vs withController semantics** (Open Issue #3)
  - Add usage comparison table to docs
  - Provide clear examples of when to use each
  - Document anti-patterns
  - Add to migration guide and learn_handlers.ts

---

## Trade-offs & Limitations

### Advantages

✅ **Zero user-facing complexity**
- Users never see or pass `AbortSignal`
- Effect APIs remain clean: `Http.op.get(url)` not `Http.op.get(url, signal)`
- Cancellation "just works" without manual wiring

✅ **Automatic cleanup**
- Ctrl-C triggers cleanup without explicit signal handling
- Resource leaks prevented automatically
- Cleanup runs on any exit path (success, exception, abort)

✅ **Structured concurrency**
- `par.race()` cancels losers automatically
- `par.all()` cancels siblings on failure
- Parent cancellation propagates to children

✅ **Type-safe**
- `CancellationContext` enforced by handler signature
- Runtime provides context, handlers consume it
- No escape hatches or unsafe casts

✅ **Deterministic cleanup order**
- LIFO guarantees reverse order of acquisition
- Predictable behavior for dependent resources
- Easy to reason about cleanup flow

### Disadvantages

❌ **Breaking change to HandlerFn signature**
- All custom handlers must add `ctx` parameter
- Migration required for existing codebases
- No backward compatibility (but acceptable for v0.x)

❌ **AbortSignal still exists (just hidden)**
- Not as elegant as Effection's delimiters
- Still tied to JavaScript's AbortController API
- Platform-specific limitations (e.g., setTimeout doesn't accept signal in all runtimes)

❌ **Custom handlers must opt-in**
- Handler authors must explicitly register cleanup
- No automatic cleanup for arbitrary side effects
- Documentation burden to educate handler authors

❌ **Runtime overhead**
- Cleanup stack allocation per `run()`
- LIFO reversal on cleanup execution
- Signal listener installation/removal

### Limitations vs Effection

| Feature | Effection | typelang (this design) |
|---------|-----------|------------------------|
| **Scope nesting** | Full delimiter-based scopes | Single scope per `run()` |
| **Granularity** | Per-operation cancellation | Per-handler cancellation |
| **Resource pattern** | Explicit `provide()` | Implicit via `ctx.onCancel()` |
| **Cancellation API** | Structured via generators | Runtime-managed via AbortController |
| **Composability** | Delimiters compose freely | Limited to handler stack |

**Key difference:** Effection uses **delimited continuations** (via generators) for fine-grained scope control. typelang uses **AbortController** for simpler but less flexible cancellation.

### When This Design Falls Short

1. **Nested scopes** - Can't create sub-scopes within a `run()` invocation
2. **Selective cancellation** - Can't cancel one branch of `par.all()` without canceling all
3. **Resumable operations** - Can't pause/resume like Effection's delimiters
4. **Non-AbortController APIs** - Some legacy APIs don't accept `AbortSignal`

### Acceptable Trade-offs

For typelang's current scope and goals, these trade-offs are acceptable because:

1. **Simplicity over generality** - Most use cases don't need nested scopes
2. **Pragmatic over perfect** - AbortController is widely supported and well-understood
3. **Evolution path** - Can add nested scopes later via `scope()` combinator
4. **v0.x flexibility** - Breaking changes allowed before 1.0

---

## Open Issues & Next Steps

### 1. Replace Global Controller Stack with Async-Context Mechanism

**Problem:** The current `controllerStack` is shared across all concurrent operations in the same runtime. This creates subtle bugs with promise concurrency:

```typescript
// Runtime has controllerStack = [root]
par.all({
  a: () => withController(controllerA, async () => {
    // controllerStack = [root, controllerA]
    await Async.op.sleep(10);
    // During sleep, another branch might push/pop!
    // controllerStack could be [root, controllerB] now!
    const ctrl = getCurrentScopeController();  // ← Gets controllerB! Bug!
  }),
  b: () => withController(controllerB, async () => {
    // controllerStack = [root, controllerB]
    // Race condition with branch a!
  }),
});
```

**Root cause:** JavaScript promises execute concurrently but share the same synchronous call stack. The global `controllerStack` gets corrupted by interleaved push/pop operations.

**Solution:** Use **async-context propagation** to give each promise chain its own isolated controller stack.

**Approach 1: AsyncLocalStorage (Node.js / Deno with flag)**
```typescript
// typelang/runtime.ts
import { AsyncLocalStorage } from "node:async_hooks";

const controllerStackContext = new AsyncLocalStorage<AbortController[]>();

export const getCurrentScopeController = (): AbortController | null => {
  const stack = controllerStackContext.getStore();
  if (!stack || stack.length === 0) return null;
  return stack[stack.length - 1];
};

export const withController = async <T>(
  controller: AbortController,
  thunk: () => Promise<T>,
): Promise<T> => {
  const parentStack = controllerStackContext.getStore() ?? [];
  const childStack = [...parentStack, controller];

  return await controllerStackContext.run(childStack, async () => {
    try {
      return await thunk();
    } finally {
      if (controller.signal.aborted) {
        await runCleanups(controller);
      }
    }
  });
};
```

**Approach 2: Zone.js-style context (if AsyncLocalStorage unavailable)**
```typescript
// Store controller in promise chain via continuation passing
type EffContext = { controller: AbortController };

const withEffContext = <T>(ctx: EffContext, thunk: () => Promise<T>): Promise<T> => {
  // Attach context to promise chain metadata (implementation-dependent)
  const promise = thunk();
  (promise as any).__effContext = ctx;
  return promise;
};
```

**Approach 3: Explicit context threading (current fallback)**
Keep the current approach but document the limitation: "Do not use `getCurrentScopeController()` within concurrent branches. Pass the controller explicitly instead."

**Recommendation:** Start with Approach 3 (document limitation), plan migration to Approach 1 (AsyncLocalStorage) when Deno stabilizes async_hooks support.

---

### 2. Tighten `withController` Error Handling

**Current gaps:**

1. **No abort on exception** - If thunk throws, controller isn't aborted
2. **Cleanup list not removed** - Map entry persists after scope exits
3. **Late abort handling** - If controller.abort() called after withController exits, cleanup doesn't run

**Proposed fixes:**

```typescript
export const withController = async <T>(
  controller: AbortController,
  thunk: () => Promise<T>,
): Promise<T> => {
  const runtime = runtimeStack[runtimeStack.length - 1];
  if (!runtime) {
    throw new Error("withController called outside runtime context");
  }

  // Push controller onto stack
  runtime.controllerStack.push(controller);

  // NEW: Register late-abort handler
  const lateAbortHandler = () => {
    // If abort happens after scope exits, still run cleanup
    if (!runtime.controllerStack.includes(controller)) {
      runCleanups(runtime, controller);
    }
  };
  controller.signal.addEventListener("abort", lateAbortHandler);

  try {
    const result = await thunk();
    return result;
  } catch (error) {
    // NEW: Abort controller on exception
    controller.abort();
    throw error;
  } finally {
    // Pop controller from stack
    runtime.controllerStack.pop();

    // Remove late-abort handler
    controller.signal.removeEventListener("abort", lateAbortHandler);

    // Only run cleanup if this scope was aborted
    if (controller.signal.aborted) {
      await runCleanups(runtime, controller);
    }

    // NEW: Always remove cleanup list to prevent memory leak
    runtime.cleanupStacks.delete(controller);
  }
};
```

**Benefits:**
- ✅ Exception triggers cancellation (fail-fast)
- ✅ Late aborts still run cleanup (race condition safety)
- ✅ Cleanup lists garbage-collected (no memory leaks)

---

### 3. Clarify `withChildScope` vs `withController` Semantics

**Current confusion:** When should I use `withChildScope` vs `withController`?

**Proposed documentation:**

| Helper | Cleanup Trigger | Use Case |
|--------|----------------|----------|
| `withChildScope(thunk)` | **Always** (like finally) | Resource acquisition (files, connections) |
| `withController(ctrl, thunk)` | **Only if aborted** | Concurrent operations (par.race, par.all) |

**withChildScope - "Finally-style" cleanup:**
```typescript
// Use for resources that ALWAYS need cleanup
const processFile = () =>
  withChildScope(async () => {
    const file = await openFile("/tmp/data.txt");

    // Register cleanup - runs whether we succeed or fail
    const ctx = getCurrentCancellationContext();
    ctx.onCancel(() => file.close());

    const data = await file.read();
    return process(data);

    // Cleanup ALWAYS runs here (like finally)
  });
```

**withController - "Conditional cleanup":**
```typescript
// Use for operations that only need cleanup if canceled
par.race([
  () => withController(controllerA, async () => {
    const timer = setTimeout(callback, 1000);

    ctx.onCancel(() => clearTimeout(timer));  // Only runs if canceled

    await doWork();
    // Winner doesn't run cleanup ✓
  }),
  () => withController(controllerB, async () => {
    // Loser runs cleanup ✓
  }),
]);
```

**Key principle:**
- Use `ctx.onCancel()` for **cancellation-specific** cleanup (timers, HTTP aborts)
- Use `finally` blocks for **always-needed** cleanup (file close, connection release)
- Don't use `ctx.onCancel()` inside `withChildScope` - it's redundant (cleanup always runs)

**Anti-pattern to avoid:**
```typescript
// ❌ DON'T: Using ctx.onCancel for always-needed cleanup
withChildScope(async () => {
  const db = await connect();
  ctx.onCancel(() => db.close());  // ← Misleading! Runs on success too
  // Should use finally instead
});

// ✅ DO: Use finally for always-needed cleanup
withChildScope(async () => {
  const db = await connect();
  try {
    return await db.query(...);
  } finally {
    await db.close();  // ← Clear intent: always cleanup
  }
});
```

---

## Future Enhancements

### 1. Resource Effect with Automatic Cleanup

Inspired by Effection's `resource()` pattern, provide first-class resource management:

```typescript
const Resource = defineEffect<"Resource", {
  acquire<T>(
    acquire: () => Promise<T>,
    release: (resource: T) => Promise<void>,
  ): T;
}>("Resource");

const resourceHandler = (): Handler => ({
  name: "Resource",
  handles: {
    acquire: async (instr, next, ctx) => {
      const [acquireFn, releaseFn] = instr.args;
      const resource = await acquireFn();

      // Automatically register cleanup
      ctx.onCancel(async () => {
        console.log("Releasing resource...");
        await releaseFn(resource);
      });

      return resource;
    },
  },
});

// Usage
const useDatabase = () =>
  seq()
    .let(() => Resource.op.acquire(
      () => connectToDb("postgresql://..."),
      (db) => db.close(),
    ))
    .tap((db) => db.query("SELECT * FROM users"))
    .value();

// Database automatically closed on completion, exception, or Ctrl-C
```

### 2. Nested Scopes

Allow creating sub-scopes within a `run()` invocation:

```typescript
const scope = <A, E>(thunk: () => Eff<A, E>): Eff<A, E> => {
  // Creates a child AbortController
  // Cancellation of child doesn't affect parent
  // Cancellation of parent cascades to child
};

// Usage
const processItems = (items: Item[]) =>
  seq()
    .let(() => items)
    .then((items) => par.map(items, (item) =>
      scope(() =>  // ← Nested scope per item
        processItem(item)
      )
    ))
    .value();
```

### 3. Cancellation Priorities

Allow handlers to specify cleanup priority:

```typescript
ctx.onCancel(cleanup, { priority: "high" });  // Runs before normal priority
ctx.onCancel(cleanup, { priority: "low" });   // Runs after normal priority
```

Use cases:
- High priority: Close database connections, release locks
- Normal priority: Save state, log metrics
- Low priority: Send telemetry, flush buffers

### 4. Graceful Degradation Modes

Allow handlers to distinguish between cancellation reasons:

```typescript
ctx.onCancel(async (reason: CancelReason) => {
  if (reason === "timeout") {
    // Fast shutdown, don't wait for network
  } else if (reason === "exception") {
    // Log error, attempt recovery
  } else if (reason === "signal") {
    // Graceful shutdown, save state
  }
});
```

### 5. Configurable Cleanup Timeout

Per-run configuration for cleanup timeout:

```typescript
await stack(...handlers).run(program, {
  cleanupTimeoutMs: 10000,  // 10 seconds
  onCleanupTimeout: "warn" | "error" | "force-exit",
});
```

### 6. Cleanup Observability

Hooks for observing cleanup execution:

```typescript
await stack(...handlers).run(program, {
  onCleanupStart: (count: number) => console.log(`Running ${count} cleanups...`),
  onCleanupComplete: (duration: number) => console.log(`Cleanup took ${duration}ms`),
  onCleanupError: (error: unknown, cleanup: Function) => logError(error),
});
```

### 7. Cooperative Cancellation

Allow long-running operations to check for cancellation:

```typescript
const longComputation = () =>
  seq()
    .let(() => [1, 2, 3, ...1000000])
    .then((items) => items.map((item) => {
      // Check if canceled, abort early
      if (ctx.signal.aborted) {
        throw new AbortError("Computation canceled");
      }
      return processItem(item);
    }))
    .value();
```

**Challenge:** `ctx` not directly accessible in user code. Would need:
```typescript
const Cancellation = defineEffect<"Cancellation", {
  checkAborted(): void;  // Throws if aborted
  isAborted(): boolean;
}>("Cancellation");
```

### 8. External Cancellation API (Revisited)

If users need explicit cancellation control, provide opt-in API:

```typescript
const controller = new AbortController();

const task = stack(...handlers).runWithSignal(
  () => longRunningOperation(),
  controller.signal,  // Optional external signal
);

// Cancel externally
setTimeout(() => controller.abort(), 5000);

await task;
```

**Caveat:** This contradicts design goal #3 (no external API), but might be needed for advanced use cases like testing.

---

## References

### Effection

- **Repository:** https://github.com/thefrontside/effection
- **Version:** v4.0.0-beta.2
- **Tutorial:** https://github.com/thefrontside/effection/blob/effection-v4.0.0-beta.2/docs/tutorial.mdx
- **Key Concepts:**
  - Automatic disposal via operation encoding
  - Structured concurrency via parent-child scopes
  - Signal-free API (users never see AbortController)
  - Resource management via `provide()` suspension

### Related Designs

- **ZIO (Scala):** https://zio.dev/
  - Typed effects with resource management
  - `ZIO.acquireRelease` pattern
- **Koka (Research Language):** https://koka-lang.github.io/
  - Algebraic effects with handlers
  - Delimited continuations
- **Unison:** https://www.unison-lang.org/
  - Ability-based effects
  - Automatic resource cleanup

### AbortController & AbortSignal

- **MDN Documentation:** https://developer.mozilla.org/en-US/docs/Web/API/AbortController
- **Deno Support:** https://deno.land/api@latest?s=AbortController
- **Signal Handling in Deno:** https://deno.land/api@latest?s=Deno.addSignalListener

### typelang Codebase

- **Runtime:** `typelang/runtime.ts` - Effect handler runtime
- **Types:** `typelang/types.ts` - Core type definitions
- **Effects:** `typelang/effects.ts` - Built-in effect definitions
- **Combinators:** `typelang/mod.ts` - Sequential and parallel composition
- **Tests:** `typelang/runtime_test.ts` - Runtime and handler tests

---

## Appendix A: Complete Handler Example

**File:** `examples/cancelable-file-processor.ts`

```typescript
import { defineEffect, stack, seq, par, handlers } from "../typelang/mod.ts";
import { Console, Async, Http } from "../typelang/effects.ts";

// Define File effect
const File = defineEffect<"File", {
  list(dir: string): string[];
  read(path: string): Uint8Array;
  write(path: string, data: Uint8Array): void;
  delete(path: string): void;
}>("File");

// File handler with automatic cleanup
const fileHandler = (): Handler => {
  const openFiles = new Set<string>();

  return {
    name: "File",
    handles: {
      list: async (instr, next, ctx) => {
        const [dir] = instr.args;
        const entries = [];
        for await (const entry of Deno.readDir(dir)) {
          if (ctx.signal.aborted) break;
          entries.push(entry.name);
        }
        return entries;
      },

      read: async (instr, next, ctx) => {
        const [path] = instr.args;
        openFiles.add(path);

        ctx.onCancel(() => {
          openFiles.delete(path);
          console.log(`Closed file: ${path}`);
        });

        return await Deno.readFile(path, { signal: ctx.signal });
      },

      write: async (instr, next, ctx) => {
        const [path, data] = instr.args;
        openFiles.add(path);

        ctx.onCancel(() => {
          openFiles.delete(path);
          console.log(`Aborted write to: ${path}`);
        });

        await Deno.writeFile(path, data, { signal: ctx.signal });
      },

      delete: async (instr, next, ctx) => {
        const [path] = instr.args;
        await Deno.remove(path);
      },
    },

    finalize: (value, halt) => {
      if (openFiles.size > 0) {
        console.warn(`Warning: ${openFiles.size} files still open at finalization`);
      }
      return { value, halt };
    },
  };
};

// Process images: read, transform, upload, delete originals
const processImages = (dir: string) =>
  seq()
    .do(() => Console.op.log(`Processing images in ${dir}...`))
    .let(() => File.op.list(dir))
    .tap((files) => Console.op.log(`Found ${files.length} files`))

    // Process in parallel (with automatic cancellation on failure)
    .let((files) => par.map(files, (filename) =>
      seq()
        .let(() => File.op.read(`${dir}/${filename}`))
        .tap(() => Console.op.log(`Read ${filename}`))

        // Simulate transformation (sleep)
        .do(() => Async.op.sleep(1000))

        // Upload to S3
        .let((data) => Http.op.post(
          `https://my-bucket.s3.amazonaws.com/${filename}`,
          data,
        ))
        .tap(() => Console.op.log(`Uploaded ${filename}`))

        // Delete original
        .do(() => File.op.delete(`${dir}/${filename}`))
        .tap(() => Console.op.log(`Deleted ${filename}`))

        .return(() => filename)
    ))

    .tap((processed) => Console.op.log(`Processed ${processed.length} images`))
    .return((processed) => processed);

// Run with automatic cancellation
const result = await stack(
  handlers.Console.live(),
  fileHandler(),
  handlers.Async.default(),
  handlers.Http.default(),
).run(() => processImages("./uploads"));

console.log("Done:", result);

// Press Ctrl-C during processing:
// - Current file reads aborted
// - Open files closed automatically
// - In-flight uploads canceled
// - Temp files cleaned up
// - Process exits gracefully
```

---

## Appendix B: Testing Cancellation

**File:** `typelang/cancellation_test.ts`

```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stack, handlers, seq, par } from "./mod.ts";
import { Async, Console } from "./effects.ts";

Deno.test("sleep cancellation via abort", async () => {
  const controller = new AbortController();

  // Abort after 100ms
  setTimeout(() => controller.abort(), 100);

  const start = Date.now();

  try {
    await stack(handlers.Async.default()).run(() =>
      Async.op.sleep(5000)  // 5 second sleep
    );
    throw new Error("Should have been canceled");
  } catch (error) {
    const elapsed = Date.now() - start;
    assertEquals(elapsed < 200, true, "Should cancel in < 200ms");
  }
});

Deno.test("par.race cancels losing branches", async () => {
  let slowCanceled = false;

  const customAsyncHandler = (): Handler => ({
    name: "Async",
    handles: {
      sleep: (instr, next, ctx) => {
        const [ms] = instr.args;
        return new Promise((resolve, reject) => {
          const timerId = setTimeout(resolve, ms);
          ctx.onCancel(() => {
            clearTimeout(timerId);
            if (ms === 5000) {
              slowCanceled = true;
            }
            reject(new Error("canceled"));
          });
        });
      },
    },
  });

  await stack(customAsyncHandler()).run(() =>
    par.race([
      () => Async.op.sleep(10),     // Fast
      () => Async.op.sleep(5000),   // Slow - should be canceled
    ])
  );

  assertEquals(slowCanceled, true, "Slow branch should be canceled");
});

Deno.test("cleanup executes in LIFO order", async () => {
  const order: number[] = [];

  const testHandler = (): Handler => ({
    name: "Test",
    handles: {
      register: (instr, next, ctx) => {
        const [id] = instr.args;
        ctx.onCancel(() => {
          order.push(id);
        });
        return id;
      },
    },
  });

  const controller = new AbortController();

  // Register cleanup callbacks in order 1, 2, 3
  const promise = stack(testHandler()).run(() =>
    seq()
      .do(() => Test.op.register(1))
      .do(() => Test.op.register(2))
      .do(() => Test.op.register(3))
      .return(() => "done")
  );

  // Abort immediately
  controller.abort();

  try {
    await promise;
  } catch {
    // Expected
  }

  // Cleanup should execute in reverse order: 3, 2, 1
  assertEquals(order, [3, 2, 1]);
});

Deno.test("cleanup errors don't propagate", async () => {
  const testHandler = (): Handler => ({
    name: "Test",
    handles: {
      registerFaulty: (instr, next, ctx) => {
        ctx.onCancel(() => {
          throw new Error("Cleanup failed!");
        });
      },
      registerGood: (instr, next, ctx) => {
        ctx.onCancel(() => {
          console.log("Good cleanup executed");
        });
      },
    },
  });

  const controller = new AbortController();

  const promise = stack(testHandler()).run(() =>
    seq()
      .do(() => Test.op.registerFaulty())
      .do(() => Test.op.registerGood())
      .return(() => "done")
  );

  controller.abort();

  // Should not throw despite faulty cleanup
  try {
    await promise;
  } catch (error) {
    // Abort error expected, but not cleanup error
    assertEquals(error.message.includes("Cleanup failed"), false);
  }
});
```

---

**End of Design Document**

This design provides a comprehensive blueprint for implementing automatic cancellation and disposal in typelang's effect system, inspired by Effection's structured concurrency model while maintaining typelang's functional programming principles and zero-dependency philosophy.
