---
title: First Impressions of typelang - Functional TypeScript That Actually Enforces the Rules
date: 2025-11-16
tags: [TypeScript, Functional Programming, Deno, Algebraic Effects]
excerpt: What happens when you take TypeScript, remove all the mutation, classes, and if statements, add algebraic effects, and enforce it with a custom linter? I spent a weekend with typelang to find out.
---

Here's the pitch: What if TypeScript wasn't just _capable_ of functional programming, but _enforced_
it? No escape hatches. No "I'll be disciplined this time." No classes, no mutation, no `if`/`else`,
no loops. Just pure functions, algebraic effects, and a custom linter that actually checks your
work.

To me is interesting that someone built this. So I cloned the repo, ran `deno task dev`, and spent a
weekend figuring out what happens when you take functional programming seriously enough to make the
rules non-negotiable.

## What You Get

typelang is three things in one package:

1. **A strict functional TypeScript subset** - enforced by a custom lexical linter that forbids
   classes, `this`, `new`, `if`/`else`, ternary operators, loops, mutation (`++`, `--`,
   assignments), and `let`/`var`. Only `const` declarations allowed.

2. **An algebraic effects runtime** - inspired by ZIO and Effekt, with handlers for Console, State,
   Exception, Async, Http, and Resources. Effects are explicit in your type signatures using
   record-based capabilities.

3. **A lightweight HTTP server** - zero dependencies (Deno stdlib only), with middleware composition
   and data-driven routing.

The showcase demo runs at `http://127.0.0.1:8080` and demonstrates three effect programs: workflow
sequencing with State, parallel async operations, and exception guards. Each one renders server-side
with HTMX and shows you the Console output, State snapshots, and execution timeline.

## The Sequential Builder - Or How I Learned to Stop Worrying and Love `seq()`

Look at this program from the showcase:

```typescript
type WorkflowCaps = Readonly<{
  console: typeof Console.spec;
  state: typeof State.spec;
  exception: typeof Exception.spec;
}>;

const workflow = (): Result<WorkflowSnapshot, unknown, WorkflowCaps> =>
  seq()
    .let(() => State.get<WorkflowState>()) // ctx.v1
    .then((state) => state.stage)
    .then((stage) => nextStage(stage))
    .let((next) => next) // ctx.v2
    .then((next) => ({ stage: next, note: stageNote(next) }))
    .let((event) => event) // ctx.v3
    .tap((event) => Console.log(`Stage → ${stageLabel(event.stage)}`))
    .do((event, ctx) => {
      const state = ctx!["v1"] as WorkflowState;
      const history = appendEvent(state.history, event);
      return State.put({ stage: event.stage, history });
    })
    .return((event, ctx) => {
      const state = ctx!["v1"] as WorkflowState;
      return { stage: event.stage, history: appendEvent(state.history, event) };
    });
```

Here's the cool part: `seq()` threads workflow state without mutation. Each `.let()` stores its
result in an auto-generated context key (`v1`, `v2`, `v3`...). Later steps access any prior value
through the context. No mutable variables. No reassignment. No accidental overwrites.

The type signature tells you exactly what effects this program needs: Console for logging, State for
workflow tracking, Exception for error handling. This depends of the record-based capability
pattern - instead of some opaque `Effects` union type, you get a self-documenting record where each
key names a specific capability.

When you run it, you provide handlers:

```typescript
await stack(
  handlers.Console.capture(),
  handlers.State.with(initialWorkflow),
  handlers.Exception.tryCatch(),
).run(() => workflow);
```

The runtime checks that every effect instruction has a handler. No handler? Runtime error. It's
fail-fast by design.

## Parallel Effects Without Promises

The parallel combinators surprised me. Here's the demo that runs three async tasks:

```typescript
type ParallelTaskCaps = Readonly<{
  console: typeof Console.spec;
  async: typeof Async.spec;
}>;

const runTask = (descriptor: TaskDescriptor): Result<TaskResult, never, ParallelTaskCaps> =>
  seq()
    .do(() => Console.log(`[${descriptor.label}] scheduled`))
    .do(() => Async.sleep(descriptor.delay))
    .do(() => Console.log(`[${descriptor.label}] completed`))
    .return(() =>
      ok({
        id: descriptor.id,
        label: descriptor.label,
        delay: descriptor.delay,
      })
    );

const program = () =>
  seq()
    .let(() =>
      par.all({
        console: () => runTask(consoleTask),
        state: () => runTask(stateTask),
        async: () => runTask(asyncTask),
      })
    )
    .then((results) => /* ... */)
    .value();
```

This means you can compose parallel work without touching `Promise.all()` directly. The Async
handler manages cancellation automatically - if you Ctrl-C the program or a parent scope aborts,
cleanup runs in LIFO order. No manual `AbortSignal` passing. No forgetting to wire up cancellation.
The runtime handles it.

`par.race()` picks the fastest branch and cancels the losers. `par.map()` runs an array in parallel,
aborting everything if any item fails. Structured concurrency by default.

## The Functional Subset Linter - No Escape Hatches

Everything under `examples/showcase/app/` must pass the subset checker. This runs as part of
`deno task lint`:

```bash
$ deno task lint
# Runs Deno's built-in linter + custom subset checker
```

The linter catches:

- Classes, `this`, `new` (except `new Proxy` for the effects runtime)
- `if`/`else` and ternary `?:`
- Loops (`for`, `while`, `do`)
- Mutation operators (`++`, `--`, assignments except `const`)
- `let`/`var` declarations
- Enums, namespaces, decorators

Instead, you use:

- `match()` for branching (exhaustiveness checked at compile time)
- `pipe()` for function composition
- `seq()` for sequential steps
- Array methods (`map`, `filter`, `reduce`) for iteration

Here's a real example from the config validation demo:

```typescript
const ensureFlag = (
  value: string | undefined,
): Result<FeatureMode, ConfigError, Readonly<{ exception: typeof Exception.spec }>> =>
  match(presence(value), {
    Missing: () => Exception.fail({ tag: "MissingFlag" }),
    Present: ({ value: raw }) =>
      match(identifyFlag(raw), {
        Stable: () => ok({ tag: "StableMode" } as const),
        Beta: () => ok({ tag: "BetaMode" } as const),
        Other: ({ value: unexpected }) =>
          Exception.fail({
            tag: "UnsupportedFlag",
            value: unexpected,
          }),
      }),
  });
```

No `if` statements. No thrown exceptions. Just total pattern matching with typed errors. Exception
handlers capture failures and return `{ tag: "Err", error }` instead of crashing the runtime.

## Resource Management - RAII for JavaScript

Version 0.3.0 added automatic resource cleanup inspired by Gleam's `use` construct and Rust's RAII
pattern:

```typescript
await stack(handlers.Resource.scope()).run(() =>
  use({ file: () => fileResource("./data.txt") }).in(({ file }) => {
    const text = new TextDecoder().decode(Deno.readAllSync(file));
    return text;
  })
);
```

Resources are acquired on entry, released on exit. LIFO order for multiple resources. Cleanup runs
on success, failure, and cancellation. No manual `try`/`finally` blocks. No forgetting to close
handles.

The handler registers cleanup callbacks via `ctx.onCancel()`. When the scope exits, cleanup runs in
reverse acquisition order with a 5-second timeout to prevent hung teardown.

## Real Talk: Tradeoffs

This works beautifully for server-side rendering, CLI tools, and backend APIs where you control the
entire stack. The showcase demo is proof - HTMX partials, effect handlers, zero client-side
JavaScript except HTMX itself.

Where it falls apart: frontend frameworks (React, Vue, Svelte), existing TypeScript codebases, teams
that aren't bought into pure FP. The learning curve is real. You can't just drop this into a Next.js
app and expect it to work. You're rewriting in a different paradigm.

The subset linter is strict. You can't use `if` even when it's obvious. You must `match()` over
boolean tags:

```typescript
const toBoolTag = (b: boolean): BoolTag =>
  [{ tag: "False" }, { tag: "True" }][Number(b)] as BoolTag;

match(toBoolTag(value > 5), {
  True: () => "large",
  False: () => "small",
});
```

To some this looks like ceremony. To others it's total clarity. I'm somewhere in the middle - I
appreciate the guarantees but miss the convenience of `if` for trivial cases.

The effect system shines when you need to swap handlers (testing, SSR with different contexts), but
it's overhead if you're just building a static site generator.

## The Testing Story

116 tests covering the runtime, effects, HTTP server, middleware, routing, security (path traversal,
input validation), and the subset linter itself. Coverage reports live in
`docs/TEST_COVERAGE_REPORT.md`.

Tests look like this:

```typescript
Deno.test("seq.when executes branch when predicate is true", async () => {
  const logs: string[] = [];
  const customHandler = {
    name: "Console",
    handles: {
      log: (instr, next, ctx) => {
        logs.push(String(instr.args[0]));
        return ok(undefined);
      },
    },
  };

  await stack(customHandler, handlers.Exception.tryCatch()).run(() =>
    seq()
      .let(() => ok(10))
      .when((last, ctx) => (ctx!["v1"] as number) > 5, (last, ctx) =>
        Console.log(`Value ${(ctx!["v1"] as number)} is large`))
      .return(() =>
        ok("done")
      )
  );

  assertEquals(logs, ["Value 10 is large"]);
});
```

Swap the Console handler with a test spy. Run the program. Assert on captured output. No mocking
library needed - handlers are just data.

## Would I Use This?

For a greenfield Deno project where I own the stack and want compile-time effect tracking? Yes. The
guarantees are compelling. The showcase proves it scales to non-trivial server logic.

For anything involving an existing codebase, a team unfamiliar with algebraic effects, or frontend
frameworks? No. The migration cost is too high.

But I'll take the ideas. Record-based capabilities are brilliant - I'm stealing that pattern for my
next TypeScript project. The Resource handler solves a real problem. And the subset linter makes me
think about what "functional TypeScript" actually means when you close the escape hatches.

## Try It Yourself

```bash
git clone https://github.com/srdjan/typelang  # (hypothetical - check actual repo URL)
cd typelang
deno task dev
# Open http://127.0.0.1:8080
```

Click "Run demo" on the workflow card. Watch the Console output, State snapshots, and timeline
render server-side. View source - it's all typelang functions compiled to handlers.

The docs live in `CLAUDE.md` (comprehensive architecture guide), `docs/`, and
`examples/showcase/README.md`. The test suite is your best tutorial.

I explored this for a weekend over coffee and learned more about effect systems than a month of
reading papers. Sometimes the best way to understand a paradigm is to use a tool that doesn't let
you cheat.
