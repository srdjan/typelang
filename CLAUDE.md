# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

## Overview

**typelang** is a functional TypeScript subset with algebraic effects, featuring:

- A strict functional programming subset enforced via custom linter
- Algebraic effects runtime with handlers (similar to ZIO/Effekt)
- Lightweight HTTP server with middleware composition
- Zero external dependencies (uses Deno standard library only)

## Development Commands

### Running the Application

```bash
deno task dev        # Start development server with watch mode (-A for all permissions)
```

### Testing

```bash
deno test            # Run all tests in the runtime and tooling
```

### Linting

```bash
deno task lint       # Run Deno linter + custom subset checker
deno fmt             # Format code
```

The custom subset linter (`scripts/lint_subset.ts`) enforces strict functional rules on files
matching `INCLUDE_PATTERNS` (currently `app/` directory). It forbids:

- Classes, `this`, `new` (except `new Proxy`)
- `if`/`else`, ternary `?:` (use `match()` instead)
- Loops (`for`, `while`, `do`)
- Mutation (`++`, `--`, assignments except `const` declarations)
- `let`/`var` (use `const` only)
- Enums, namespaces, decorators

Files in `typelang/runtime.ts` and `server/` are exempt from subset checking.

## Project Architecture

### Directory Structure

```
typelang/           # Effect runtime: Eff type, defineEffect, handlers, combinators
  mod.ts            # Public API: defineEffect, seq, par, match, pipe, handlers
  runtime.ts        # Effect interpreter with handler stacks
  types.ts          # Core types: Eff<A,E>, Capability, Instr
  effects.ts        # Example effect definitions (Console, State, etc.)
  seq.ts, par.ts    # Sequential/parallel combinators (deprecated, use mod.ts)
  match.ts, pipe.ts # Utilities (deprecated, use mod.ts)

server/             # HTTP server implementation (NOT subject to subset linting)
  main.ts           # Server entry point, middleware composition
  router.ts         # Path-based routing with `:param` support
  middleware.ts     # Composable middleware (logger, CORS, rate-limit, static, auth, error boundary)
  http.ts           # HTTP utilities (json, html, redirect, parseQuery)
  types.ts          # Server types (Handler, Route, Middleware, RequestCtx)

app/                # Application routes (STRICTLY enforces subset rules)
  routes.ts         # Route definitions as data (Routes array)

scripts/            # Development tooling
  lint_subset.ts    # Custom lexical linter for functional subset

public/             # Static assets served at /static
docs/               # Design specifications and guides
```

### Key Architectural Patterns

#### 1. Algebraic Effects System (typelang/)

The core abstraction is `Eff<A, Caps>` - a value of type `A` that requires capabilities `Caps`.

**Record-based capabilities** make dependencies explicit and self-documenting:

```typescript
// Define an effect
const { op, spec } = defineEffect<"MyEffect", {
  doThing: (x: number) => string
}>("MyEffect");

// Use the effect with record-based capability type
const program: Eff<string, { myEffect: typeof spec }> = op.doThing(42);

// Multi-capability example - order-independent, self-documenting
const complexProgram: Eff<User, {
  http: typeof Http.spec;
  db: typeof Db.spec;
  logger: typeof Console.spec;
}> = ...

// Handle the effect
const handler: Handler = {
  name: "MyEffect",
  handles: {
    doThing: (instr, next, ctx) => {
      const [x] = instr.args;
      return `Result: ${x}`;
    }
  }
};

// Run with handler stack
const result = await stack(handler).run(() => program);
```

**Benefits of record-based capabilities:**

- Order-independent destructuring (named properties prevent parameter order mistakes)
- Self-documenting signatures (capabilities visible at a glance)
- No combinatorial type explosion (no need to define composite types like `HttpAndDb`,
  `HttpDbAndLogger`)
- Type-safe capability threading (compiler ensures all required caps are provided)

**Built-in handlers** (in `handlers` object from `mod.ts`):

- `Console.live()` / `Console.capture()` - logging with different capture modes
- `Exception.tryCatch()` - converts effect failures to `{ tag: "Ok"|"Err" }` results
- `State.with(initial)` - stateful computations
- `Async.default()` - async operations (sleep, await) with automatic cancellation
- `Http.default()` - HTTP requests (get, post, put, delete) with automatic cancellation

#### 2. Sequential & Parallel Combinators

**seq()** - monadic sequential composition with auto-named bindings:

```typescript
seq()
  .let(() => fetchUser(id)) // ctx.v1
  .then((user) => fetchPosts(user.id))
  .let((posts) => posts) // ctx.v2
  .tap((posts) => Console.log(`Found ${posts.length} posts`))
  .return((posts, ctx) => ({ user: ctx!["v1"], posts }));
```

Key seq() methods:

- `.let(f)` - auto-named binding (stored in context as v1, v2, v3, ...)
- `.then(f)` - chain transformation on last value
- `.tap(f)` - side effect with last value
- `.do(f)` - action with (last, ctx)
- `.value()` - return last value
- `.return(f)` - close with f(last, ctx?)

**par** - parallel execution:

```typescript
par.all({
  user: () => fetchUser(id),
  posts: () => fetchPosts(id),
}); // Returns { user: User, posts: Post[] }

par.map([1, 2, 3], (x) => compute(x)); // Returns array of results
par.race([() => fast(), () => slow()]); // First to complete
```

#### 3. Automatic Cancellation & Cleanup

**typelang v0.3.0** introduces automatic cancellation and resource cleanup inspired by Effection's
automatic disposal. Cancellation is completely transparent to users - you never see or pass
`AbortSignal` manually.

**Key Features:**

- **Ctrl-C Handling**: SIGINT/SIGTERM automatically trigger cleanup and graceful shutdown
- **Structured Concurrency**: Parent cancellation propagates to children (`par.race`, `par.all`)
- **LIFO Cleanup Order**: Resources released in reverse order of acquisition
- **Fail-Safe**: Cleanup errors are logged but don't propagate
- **Timeout Protection**: 5-second default timeout prevents hung cleanup

**Handler Signature (BREAKING CHANGE in v0.3.0):**

All handlers now receive a third parameter `ctx: CancellationContext`:

```typescript
type HandlerFn = (
  instr: AnyInstr,
  next: Next,
  ctx: CancellationContext  // NEW: Required third parameter
) => unknown | Promise<unknown>;
```

**CancellationContext API:**

```typescript
type CancellationContext = {
  readonly signal: AbortSignal;  // Check if cancelled: signal.aborted
  readonly onCancel: (cleanup: () => void | Promise<void>) => void;  // Register cleanup
};
```

**Example: Cancelable HTTP Request**

```typescript
const httpHandler: Handler = {
  name: "Http",
  handles: {
    get: async (instr, next, ctx) => {
      const [url] = instr.args;
      // Pass signal to fetch - automatic cancellation on Ctrl-C or parent abort
      return await fetch(url, { signal: ctx.signal });
    }
  }
};
```

**Example: Resource Cleanup**

```typescript
const fileHandler: Handler = {
  name: "File",
  handles: {
    write: async (instr, next, ctx) => {
      const [path, data] = instr.args;
      const file = await Deno.open(path, { write: true, create: true });

      // Register cleanup - runs on cancellation in LIFO order
      ctx.onCancel(async () => {
        await file.close();
        console.log(`Cleaned up file: ${path}`);
      });

      await file.write(new TextEncoder().encode(data));
      return file.rid;
    }
  }
};
```

**Parallel Cancellation Semantics:**

- `par.all()`: On failure, aborts all sibling branches
- `par.race()`: Winner completes normally, losers are aborted (cleanup runs)
- `par.map()`: On any failure, aborts all items

```typescript
// Race example: losing branches automatically clean up
const fastest = await stack(handlers.Http.default()).run(() =>
  par.race([
    () => Http.op.get("https://api1.example.com/data"),
    () => Http.op.get("https://api2.example.com/data"),
    () => Http.op.get("https://api3.example.com/data"),
  ])
);
// Winner's request completes, losers are cancelled and cleaned up
```

**Best Practices:**

1. **Always register cleanup for acquired resources** (files, connections, timers)
2. **Pass `ctx.signal` to cancelable APIs** (fetch, setTimeout, subprocess)
3. **Don't throw from cleanup callbacks** - log errors instead
4. **Test Ctrl-C behavior** during development with long-running operations

**Migration from v0.2.x:**

All custom handlers must add the `ctx` parameter:

```typescript
// Before (v0.2.x)
handles: {
  myOp: (instr, next) => { /* ... */ }
}

// After (v0.3.0)
handles: {
  myOp: (instr, next, ctx) => { /* ... */ }
}
```

See `docs/migration-v0.3.md` for full migration guide.

#### 4. HTTP Server (server/)

The server uses **middleware composition** and **data-driven routing**:

```typescript
// Define routes as data
const routes: Routes = [
  { method: "GET", path: "/users/:id", handler: ({ params }) => ... },
  { method: "POST", path: "/echo", handler: async ({ req }) => ... }
];

// Server composes middleware and terminal handler
const server = createServer(routes, {
  basePath: "",
  staticDir: "./public",
  staticPrefix: "/static"
});
```

**Middleware are functions** `(next: Handler) => Handler` that wrap the next handler:

- Execution flows from outer to inner middleware
- Built-in: `withLogger`, `withCors`, `withErrorBoundary`, `withRateLimit`, `withStatic`, `withAuth`
- Composed with `compose(middlewares, terminal)`

**Route matching**:

- Paths support `:param` syntax (e.g., `/users/:id`)
- Compiled to regex at startup (`compileRoutes`)
- Params available in `ctx.params`

**RequestCtx** passed to all handlers:

```typescript
{
  req: Request,           // Native Request object
  url: URL,              // Parsed URL
  params: Record<...>,   // Path parameters
  query: Record<...>,    // Query string (supports arrays)
  locals: Record<...>    // Middleware-injected data
}
```

#### 5. Functional Subset Enforcement

The `app/` directory must follow strict subset rules checked by `lint_subset.ts`. This ensures:

- **Pure data transformations**: No classes, no mutation, no side effects
- **Expression-oriented**: Use `match()` instead of `if`/`else`, `pipe()` for composition
- **Immutability**: Only `const` declarations allowed

**Pattern matching** with `match()`:

```typescript
match(result, {
  Ok: (v) => v.value,
  Err: (e) => e.error,
});
```

**Function composition** with `pipe()`:

```typescript
pipe(
  input,
  parseJson,
  validate,
  transform,
  serialize,
);
```

## Testing Strategy

- **Unit tests**: Test pure functions and effect handlers in isolation
- **Runtime tests**: Verify handler composition and effect resolution (`typelang/runtime_test.ts`)
- **Integration tests**: Test routes with synthetic Request objects (no real HTTP server needed)

Example testing pattern:

```typescript
Deno.test("handler should...", async () => {
  const result = await stack(handler1, handler2).run(() => program);
  assertEquals(result, expected);
});
```

## Common Development Tasks

### Adding a New Effect

1. Define the effect in `typelang/effects.ts` (or inline):
   ```typescript
   export const MyEffect = defineEffect<"MyEffect", {
     op1: (arg: T) => R;
   }>("MyEffect");
   ```

2. Create a handler:
   ```typescript
   export const myEffectHandler = (): Handler => ({
     name: "MyEffect",
     handles: {
       op1: (instr, next) => {/* implementation */},
     },
   });
   ```

3. Use in a program with `stack(...handlers).run()`

### Adding a Route

1. Add route definition to `app/routes.ts`:
   ```typescript
   { method: "POST", path: "/api/foo/:id", handler: async ({ params, req }) => {
     // Must follow functional subset rules!
     return json({ success: true });
   }}
   ```

2. Route automatically picked up by server (no registration needed)

### Adding Middleware

1. Define middleware in `server/middleware.ts`:
   ```typescript
   export const withMyMiddleware = (...): Middleware => (next) => async (ctx) => {
     // Pre-processing
     const res = await next(ctx);
     // Post-processing
     return res;
   };
   ```

2. Add to middleware chain in `server/main.ts` `before` array

## Design Constraints

- **Zero npm dependencies**: Uses only Deno standard library
- **Functional core, imperative shell**: Effects pushed to runtime handlers
- **Type-driven design**: Phantom types track effect requirements at compile time
- **Subset-enforced purity**: Application code (`app/`) strictly functional
- **Middleware composition**: Cross-cutting concerns via function composition

## Configuration

All configuration in `deno.jsonc`:

- Tasks: `dev`, `lint`, `fmt`
- Formatter: 2-space indent, 100 char line width, semicolons required
- Linter: Recommended rules only

No build step required - Deno runs TypeScript directly.
