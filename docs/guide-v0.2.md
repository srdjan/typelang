# typelang v0.2.0 Language Guide

_A functional TypeScript subset with algebraic effects_

---

## Table of Contents

1. Introduction
2. Quick Start
3. Subset Rules (enforced in Deno)
4. Core Semantics & Types
5. Effects: Declaring, Using, Handling
6. Sequencing (`seq`) and Parallelism (`par`)
7. Pattern Matching & Pipelines
8. Standard Library (Overview)
9. Built-in Effects & Stock Handlers
10. Testing & Observability
11. Transpilation / Runtime Modes
12. Best Practices
13. Complete Example

---

## 1) Introduction

**typelang** is a disciplined profile of TypeScript for pure-FP application code with explicit,
algebraic effects. It is **100% valid TypeScript**—no custom syntax, no decorators—and ships a tiny
runtime to interpret effects via **handlers**.

> 💡 **Interactive tour:** run `deno task dev` and open `http://localhost:8080` to explore the new
> typelang showcase. Each card executes a real algebraic-effect program (Console, State, Exception,
> Async) using the Light FP subset described in this guide.

**DX goals**

- **Zero new syntax:** Everything compiles with `tsc`/Deno.
- **Explicit effects:** Function types carry a phantom `Eff<A,E>` so the compiler tracks
  capabilities.
- **Great ergonomics:** Write linear code with `seq()`, run concurrency with `par()`. No generators
  in app code.
- **Strict subset:** We ban classes, mutation, loops, `if`/`else`, etc., and **enforce** it with
  Deno lint + a lightweight lexical subset check.

---

## 2) Quick Start

```ts
// deno.jsonc (minimal)
{
  "tasks": { "dev": "deno run -A main.ts", "lint": "deno lint && deno run -A scripts/lint_subset.ts" }
}
```

```ts
// main.ts
import { Console, defineEffect, Exception, match, par, pipe, seq, State } from "./typelang/mod.ts";

// Program: increments state, logs, and returns next
type App =
  & ReturnType<typeof State.spec<{ n: number }>>
  & typeof Console.spec
  & typeof Exception.spec;

const tick = () =>
  seq()
    .let(() => State.get<{ n: number }>()) // ctx.v1
    .then((s) => ({ n: s.n + 1 }))
    .tap((next) => State.put(next))
    .tap((next) => Console.log(`n=${next.n}`))
    .then((next) => next.n)
    .value();

// Parallel: run two ticks concurrently
const both = () =>
  par.all({
    a: () => tick(),
    b: () => tick(),
  });

console.log(await runApp(both)); // see runApp in §9
```

---

## 3) Subset Rules (enforced in Deno)

**Disallowed:** classes/`this`/`new`, `if`/`else`, ternary `?:`, `var`/`let`, loops
(`for/while/do`), mutation (`++`, `--`, assignment expressions), enums, namespaces, decorators.

**How it’s enforced**

- `deno lint` baseline + formatting.
- A tiny `scripts/lint_subset.ts` (lexical scanner) fails CI on forbidden syntax.
- You get a single `deno task lint` that enforces the subset project-wide.

> Result → The _guide’s subset_ is not just documentation; it is **tool-enforced**.

---

## 4) Core Semantics & Types

### 4.1 `Eff<A, E>` (phantom effect set)

```ts
// The value A with a phantom effect requirement E (erased at runtime).
export type Eff<A, E> = A & { readonly __eff?: (e: E) => E };
export type Pure<A> = Eff<A, {}>;
export type With<E, A> = Eff<A, E>;
export type Combine<E1, E2> = E1 & E2;
```

- Use `Eff<Return, EffectSet>` in function signatures.
- The compiler propagates E across combinators; runtime is effect-free unless you interpret it via
  handlers.

### 4.2 Data

- Immutable by default. Prefer `readonly` everywhere.
- Algebraic data via tagged unions:

```ts
type Option<T> = { tag: "Some"; value: T } | { tag: "None" };
```

---

## 5) Effects: Declaring, Using, Handling

### 5.1 Declare effects once with `defineEffect`

```ts
// Console
export interface ConsoleSpec {
  log(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}
export const Console = defineEffect<"Console", ConsoleSpec>("Console");

// Exception
export interface ExceptionSpec {
  fail<E>(e: E): never;
}
export const Exception = defineEffect<"Exception", ExceptionSpec>("Exception");

// State
export interface StateSpec<S> {
  get(): S;
  put(s: S): void;
  modify(f: (s: S) => S): void;
}
export const State = {
  spec: <S>() => defineEffect<"State", StateSpec<S>>("State"),
  // generic helpers (optional):
  get: <S>() => State.spec<S>().op.get(),
  put: <S>(s: S) => State.spec<S>().op.put(s),
  modify: <S>(f: (s: S) => S) => State.spec<S>().op.modify(f),
};
```

`defineEffect` returns typed **ops** (effect instructions). Application code never sees generators;
it uses builders (`seq`, `par`) that **yield ops internally**.

### 5.2 Handlers (one uniform shape)

A **handler** implements some (or all) operations of an effect:

- receives `(args)`,
- decides what to do,
- **resumes** the continuation with a result (or never, for `fail`).

The runtime composes handlers in a **stack** (inner wins for conflicts).

---

## 6) Sequencing (`seq`) and Parallelism (`par`)

### 6.1 `seq()` — linear composition, iterator-free

```ts
const addTodo = (
  text: string,
): Eff<string, Combine<ReturnType<typeof State.spec<AppState>>, typeof Exception.spec>> =>
  seq()
    .tap(() => guard(text.trim() !== "", () => Exception.op.fail({ tag: "InvalidInput" })))
    .let(() => State.get<AppState>()) // ctx.v1 (previous state)
    .then((s) => `todo-${s.nextId}`)
    .let((id) => id) // ctx.v2 (id)
    .then((id) => ({ id, text, completed: false } as Todo))
    .do((todo, ctx) =>
      State.put<AppState>({
        nextId: (ctx!["v1"] as AppState).nextId + 1,
        todos: [
          ...(ctx!["v1"] as AppState).todos,
          todo,
        ],
      })
    )
    .tap((_, ctx) => Console.log(`added ${(ctx!["v2"] as string)}`))
    .return((_, ctx) => ctx!["v2"] as string);
```

**Primitives**

- `.let(effOrPure)` auto-named binding (stores in context as `vN` and becomes last value)
- `.then(f)` chains transformation on last value (like Promise.then)
- `.tap(f)` performs side effect with last value, preserves last
- `.do(f)` performs action with (last, ctx), preserves last
- `.value()` returns the last value directly
- `.return(f)` closes the builder with `f(last, ctx?)`

### 6.2 `par` — structured concurrency

**Goal:** Run independent steps concurrently and join results, still within the effect discipline.

**Surface**

```ts
// Run a record of tasks concurrently; returns same shape with results
par.all({ a: () => Eff<X,E>, b: () => Eff<Y,E2> }): Eff<{ a: X; b: Y }, Combine<E,E2>>

// Run an array concurrently, collect results
par.map<T, U, E>(xs: readonly T[], f: (t: T) => Eff<U,E>): Eff<readonly U[], E>

// Race: first successful result wins (others canceled if supported)
par.race<T, E>(thunks: readonly Array<() => Eff<T,E>>): Eff<T, E>

// Any: first Ok in a Result wins; else Err aggregate
par.any<T, E>(thunks: readonly Array<() => Eff<Result<T,E>, {}>>): Eff<Result<T, readonly E[]>, {}>
```

**Builder form (optional, mirrors `seq`)**

```ts
par.group()
  .task("user", () => fetchUser(id))
  .task("orders", () => fetchOrders(id))
  .return(({ user, orders }) => ({ user, orders }));
```

**Semantics**

- **Error propagation** (default): if any task performs `Exception.fail`, the whole `par` fails;
  remaining tasks are **asked to cancel** (see §9.5).
- **Determinism**: result shapes are deterministic; internal scheduling is not.
- **Handlers** decide actual concurrency: a default Async handler uses `Promise.all`; a
  deterministic Random handler doesn’t care.

---

## 7) Pattern Matching & Pipelines

### 7.1 `match` (exhaustive, plain TS)

```ts
type CaseOf<T> = T extends { tag: infer K } ? K & string : never;

export function match<T extends { tag: string }, R>(
  value: T,
  cases: { [K in CaseOf<T>]: (v: Extract<T, { tag: K }>) => R },
): R {
  const f = (cases as any)[value.tag];
  if (f) return f(value as any);
  const _: never = value as never; // exhaustiveness
  throw new Error("Non-exhaustive match");
}
```

### 7.2 `pipe` (left-to-right dataflow)

```ts
export const pipe = <A>(a: A, ...fns: Array<(x: any) => any>) => fns.reduce((x, f) => f(x), a);
```

---

## 8) Standard Library (Overview)

All functions are pure and return `readonly` where applicable. Eff-aware variants return `Eff<_,E>`.

| Module | Highlights                                                   |
| ------ | ------------------------------------------------------------ |
| `Opt`  | `Some/None`, `map`, `flatMap`, `getOrElse`, `isSome`         |
| `Res`  | `Ok/Err`, `map`, `mapErr`, `flatMap`                         |
| `Arr`  | `map`, `filter`, `reduce`, `flatMap`, `find`, `head`, `tail` |
| `Lst`  | Immutable list ADT + folds/maps                              |
| `Fn`   | `pipe`, `compose`, `curry`, `memoize`                        |
| `Par`  | `all`, `map`, `race`, `any` (Eff-aware)                      |

---

## 9) Built-in Effects & Stock Handlers

### 9.1 Effects

- **Console**: `log/warn/error`
- **Exception**: `fail<E>(e: E): never`
- **State<S>**: `get/put/modify`
- **Async**: `sleep(ms)`, `await<T>(p: Promise<T>): T` _(optional, used by Http)_
- **Random**: `nextInt(max)`, `next()`
- **FileSystem**: `readFile/writeFile/exists/listDir`
- **Http**: `get/post/request`
- **Env**: `getEnv(key)`, `now()`

### 9.2 Stock handlers (test-friendly)

- `Console.capture()` → `{ result, logs }`
- `Exception.tryCatch()` → `Res.Ok/Err`
- `State.with<S>(initial)` → `{ result, state }`
- `Random.seed(seed)` → deterministic RNG
- `FS.memory()` → in-memory FS
- `Http.fake(routes)` → table-driven responses
- `Async.default()` → scheduler using `Promise` & `Promise.all` (powering `par`)

### 9.3 Composing handlers & running programs

```ts
import { handlers, stack } from "./typelang/runtime.ts";

export const runApp = async <A>(thunk: () => A) => {
  const runner = stack(
    handlers.Async.default(),
    handlers.Console.capture(),
    handlers.Exception.tryCatch(),
    handlers.State.with<{ n: number }>({ n: 0 }),
  );
  return runner.run(thunk); // returns the handler-defined result shape
};
```

### 9.4 Error & result shaping

- Compose handlers deliberately to shape the outer result (e.g., capture console, wrap exceptions).
- Want plain `A` or `Promise<A>`? Use a top-level `interpretAll` handler that resolves everything
  and returns a value (or throws).

### 9.5 Cancellation (cooperative)

- `par` asks running tasks to cancel when a sibling fails (if a **Cancel** effect is installed).
- Default: cooperative only; if a task ignores cancellation, `par` awaits it but discards result.

---

## 10) Testing & Observability

- Prefer stock handlers to make side-effects **visible** in tests.
- Example:

```ts
const { result, logs, state } = stack(
  handlers.Console.capture(),
  handlers.Exception.tryCatch(),
  handlers.State.with({ n: 5 }),
).run(() => tick());

// Assert on logs + state + result in a single value.
```

- Add a `Trace` handler (optional) that logs each op (effect name, args) for visual debugging.

---

## 11) Transpilation / Runtime Modes

1. **Run-in-place (default):**

   - You write TypeScript with `seq`/`par`/`match`/`pipe`.
   - The tiny runtime interprets ops via the composed handler stack.
   - Great for Deno/Node, tests, SSR.

2. **Direct-style codegen (optional):**

   - A codemod can lower builder chains to direct calls with continuations.
   - Keeps types; improves hot paths.

3. **CPS (advanced):**

   - Experimental backend for maximal control; not recommended for day-to-day DX.

---

## 12) Best Practices

- **Effect caps by module:** export a _capability type_ alias (e.g.,
  `type AppCaps = ConsoleSpec & ExceptionSpec & ReturnType<typeof State.spec<AppState>>;`) and use
  it in signatures.
- **Immutability first:** update via structural copies; prefer `readonly`.
- **Match exhaustively:** never leave a tag unhandled.
- **Prefer `seq` for clarity, `par` for I/O fan-out.** Keep each task small and independent.
- **Testing:** compose handlers to return rich diagnostics; avoid global singletons.
- **Lints:** keep `deno task lint` in CI; treat subset violations as build-breaking.

---

## 13) Complete Example (State + Console + Exception + Parallel)

```ts
// types.ts
import { defineEffect, Eff, match, par, seq } from "./typelang/mod.ts";

// Effects
export interface ConsoleSpec {
  log(x: string): void;
}
export const Console = defineEffect<"Console", ConsoleSpec>("Console");

export interface ExceptionSpec {
  fail<E>(e: E): never;
}
export const Exception = defineEffect<"Exception", ExceptionSpec>("Exception");

export interface StateSpec<S> {
  get(): S;
  put(s: S): void;
  modify(f: (s: S) => S): void;
}
export const State = {
  spec: <S>() => defineEffect<"State", StateSpec<S>>("State"),
  get: <S>() => State.spec<S>().op.get(),
  put: <S>(s: S) => State.spec<S>().op.put(s),
  modify: <S>(f: (s: S) => S) => State.spec<S>().op.modify(f),
};

// Domain
export type TodoId = string;
export type Todo = { readonly id: TodoId; readonly text: string; readonly completed: boolean };
export type AppState = { readonly todos: readonly Todo[]; readonly nextId: number };

// Effects set for app
export type AppCaps = ReturnType<typeof State.spec<AppState>> & ConsoleSpec & ExceptionSpec;

// ops.ts
export const addTodo = (text: string): Eff<TodoId, AppCaps> =>
  seq()
    .tap(() => guard(text.trim() !== "", () => Exception.op.fail({ tag: "InvalidInput" as const })))
    .let("s", () => State.get<AppState>())
    .then((s) => `todo-${s.nextId}`)
    .let("id", (id) => id)
    .then((id) => ({ id, text, completed: false } as Todo))
    .let("todo", (todo) => todo)
    .do((todo, ctx) =>
      State.put<AppState>({ nextId: ctx!.s.nextId + 1, todos: [...ctx!.s.todos, todo] })
    )
    .tap((todo, ctx) => Console.log(`added ${ctx!.id}`))
    .return((todo, ctx) => ctx!.id);

export const toggleTodo = (id: TodoId): Eff<void, AppCaps> =>
  seq()
    .let("s", () => State.get<AppState>())
    .then((s) => s.todos.findIndex((t) => t.id === id))
    .let("idx", (idx) => idx)
    .tap((idx) => guard(idx >= 0, () => Exception.op.fail({ tag: "NotFound", id })))
    .do((idx, ctx) => {
      const t = ctx!.s.todos[idx];
      const upd = { ...t, completed: !t.completed };
      const todos = [...ctx!.s.todos.slice(0, idx), upd, ...ctx!.s.todos.slice(idx + 1)];
      return State.put<AppState>({ ...ctx!.s, todos });
    })
    .do(() => Console.log(`toggled ${id}`))
    .return(() => undefined);

// parallel: add many todos concurrently
export const addMany = (texts: readonly string[]) => par.map(texts, (t) => addTodo(t));

// helpers.ts
export const guard = <E>(
  cond: boolean,
  onFail: () => Eff<never, ExceptionSpec>,
): Eff<void, ExceptionSpec> => cond ? (undefined as any) : onFail();

// main.ts
import { handlers, stack } from "./typelang/runtime.ts";
import { addMany, addTodo, toggleTodo } from "./ops.ts";
import { AppState } from "./types.ts";

const run = stack(
  handlers.Async.default(),
  handlers.Console.capture(),
  handlers.Exception.tryCatch(),
  handlers.State.with<AppState>({ todos: [], nextId: 1 }),
);

const { result, logs, state } = await run.run(async () => {
  const ids = await addMany(["A", "B", "C"]);
  await toggleTodo(ids[1]);
  return ids;
});

console.log({ result, logs, state });
/*
{
  result: ["todo-1","todo-2","todo-3"],
  logs: ["added todo-1","added todo-2","added todo-3","toggled todo-2"],
  state: { nextId: 4, todos: [ {id:"todo-1",...}, {id:"todo-2", completed:true}, {id:"todo-3",...} ] }
}
*/
```

---

## Appendix A — API Cheatsheet

**Core**

- `type Eff<A,E>`; `Pure<A>`; `Combine<E1,E2>`
- `defineEffect<Name, Spec>(name)`
- `seq().let(f).then(f).tap(f).do(f).value() / .return(f)`
  - `.let(f)` - auto-named binding (adds to context as `vN` and becomes last value)
  - `.then(f)` - chain transformation on last value
  - `.tap(f)` - side effect with last value
  - `.do(f)` - action with (last, ctx)
  - `.value()` - return last value directly
  - `.return(f)` - close with f(last, ctx?)
- `par.all(record)`, `par.map(xs, f)`, `par.race(thunks)`, `par.any(thunks)`
- `match(value, cases)`, `pipe(x, ...fns)`

**Handlers (examples)**

- `stack(...handlers).run(thunk)`
- `handlers.Console.capture()`, `handlers.Exception.tryCatch()`
- `handlers.State.with<S>(initial)`, `handlers.Random.seed(n)`
- `handlers.Http.fake(routes)`, `handlers.Async.default()`

**Lint**

- `deno task lint` → Deno lint + `scripts/lint_subset.ts` (subset enforcement)

---

That’s v0.2.0: a strict, Deno-native TS subset with algebraic effects, **iterator-free app
ergonomics** (`seq`, `par`), explicit capabilities, and a tiny, composable runtime.
