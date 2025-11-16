# Troubleshooting Guide

Common issues and solutions when working with typelang.

---

## Effect-Related Errors

### "Effect X.Y used outside of a runtime stack"

**Cause:** You called an effect operation without wrapping it in `stack(...).run()`

**Example Error:**

```
Effect Console.log used outside of a runtime stack
Available runtime stacks: none
Hint: Wrap your code in stack(...handlers).run(() => ...)
```

**Fix:**

```typescript
// ❌ Wrong - effect called outside of stack
const result = Console.log("hello");

// ✅ Correct - wrapped in stack
const result = await stack(handlers.Console.live()).run(() => Console.log("hello"));
```

---

### "Unhandled effect X.Y"

**Cause:** The effect X is used but no handler is provided in the stack

**Example Error:**

```
Unhandled effect Console.log
Available handlers: [Exception, State]
Missing handler for: Console
Hint: Add handlers.Console.<variant>() to your stack
```

**Fix:** Add the missing handler to your stack:

```typescript
await stack(
  handlers.Console.live(), // ✅ Now Console is handled
  handlers.Exception.tryCatch(),
  handlers.State.with({ count: 0 }),
).run(() => yourProgram);
```

**Common handlers:**

- `handlers.Console.live()` - Logs to console
- `handlers.Console.capture()` - Captures logs for testing
- `handlers.Exception.tryCatch()` - Wraps exceptions in Result type
- `handlers.State.with(initial)` - Provides stateful computations
- `handlers.Async.default()` - Enables async/await effects

---

## Type Errors

### Property 'x' does not exist on context

**Cause:** Trying to access a binding that wasn't added with `.let()`

**Fix:**

```typescript
// ❌ Wrong - 'user' not defined
seq()
  .do(() => Console.log(user.name));

// ✅ Correct - bind user first
seq()
  .let("user", () => fetchUser(id))
  .do(({ user }) => Console.log(user.name));
```

---

### Non-exhaustive match for tag="X"

**Cause:** Using `match()` without handling all cases

**Example Error:**

```
Non-exhaustive match for tag="Loading"
Available cases: [Ok, Err]
Hint: Add a case for "Loading"
```

**Fix:**

```typescript
type AsyncData<T> =
  | { tag: "Loading" }
  | { tag: "Ok"; value: T }
  | { tag: "Err"; error: string };

// ❌ Wrong - missing "Loading" case
match(data, {
  Ok: (d) => d.value,
  Err: (e) => e.error,
});

// ✅ Correct - all cases handled
match(data, {
  Loading: () => "...",
  Ok: (d) => d.value,
  Err: (e) => e.error,
});
```

---

## Subset Lint Violations

### Assignment expressions are not allowed

**Cause:** Using mutation instead of immutable updates

**Fix:**

```typescript
// ❌ Wrong - mutation
const obj = { count: 0 };
obj.count++;

// ✅ Correct - immutable update
const obj = { count: 0 };
const updated = { ...obj, count: obj.count + 1 };
```

---

### `if`/`else` are not allowed; use `match()`

**Cause:** Using imperative conditionals in `examples/showcase/app/`

**Fix:**

```typescript
// ❌ Wrong - if/else not allowed
const result = if (value > 10) {
  "large"
} else {
  "small"
}

// ✅ Correct - use match with tagged union
type Size = { tag: "Large" } | { tag: "Small" };
const size: Size = value > 10 ? { tag: "Large" } : { tag: "Small" };
const result = match(size, {
  Large: () => "large",
  Small: () => "small",
});

// Or for simple cases, use the ternary in the value position:
const result = value > 10 ? "large" : "small";
```

---

### `let`/`var` are not allowed; use `const`

**Cause:** Using mutable variable declarations

**Fix:**

```typescript
// ❌ Wrong
let count = 0;
count = count + 1;

// ✅ Correct - use seq() for sequential updates
seq()
  .let("count", () => 0)
  .let("incremented", ({ count }) => count + 1)
  .return(({ incremented }) => incremented);
```

---

## Runtime Issues

### State not persisting between calls

**Cause:** Each `stack().run()` creates a new isolated runtime

**Explanation:** State handlers are scoped to a single `run()` invocation:

```typescript
const stateHandler = handlers.State.with({ count: 0 });

// First run - state starts at 0
await stack(stateHandler).run(() => State.modify((s) => ({ count: s.count + 1 })));

// Second run - state resets to 0 (new runtime!)
await stack(stateHandler).run(() => State.modify((s) => ({ count: s.count + 1 })));
```

**Fix:** If you need persistent state, use a single `run()` with your entire program:

```typescript
await stack(handlers.State.with({ count: 0 })).run(() =>
  seq()
    .do(() => State.modify((s) => ({ count: s.count + 1 })))
    .do(() => State.modify((s) => ({ count: s.count + 1 })))
    .return(() => State.get())
);
// State persists across both modifies
```

---

### Effects executing in wrong order

**Cause:** Using `par` when you meant `seq`, or vice versa

**Fix:**

```typescript
// ❌ Wrong - par runs concurrently, order not guaranteed
par.map([1, 2, 3], (n) => Console.log(n));

// ✅ Correct - seq ensures ordered execution
seq()
  .do(() => Console.log(1))
  .do(() => Console.log(2))
  .do(() => Console.log(3))
  .return(() => "done");
```

---

## Server/HTTP Issues

### 403 Forbidden on static files

**Cause:** Path traversal protection blocking valid requests, or file outside static directory

**Fix:**

1. Ensure file is in the configured static directory:
   ```typescript
   createServer(routes, {
     staticDir: "./examples/showcase/public", // Files must be in ./examples/showcase/public/
     staticPrefix: "/static",
   });
   ```

2. Check that path doesn't contain `..` or null bytes

3. Verify file permissions allow reading

---

### Route not matching

**Cause:** Route path doesn't match request path, or wrong method

**Debug steps:**

1. Check method matches exactly (GET vs POST, etc.)
2. Verify path parameters use `:paramName` syntax
3. Test with exact path first, then add parameters
4. Check for trailing slashes (both `/path` and `/path/` should match)

**Example:**

```typescript
// This route:
{ method: "GET", path: "/users/:id", handler: ... }

// Matches:
GET /users/123
GET /users/123/

// Doesn't match:
POST /users/123  (wrong method)
GET /user/123    (wrong path - "user" not "users")
GET /users       (missing :id parameter)
```

---

## Performance Issues

### Slow test execution

**Cause:** Running the full dev server in tests

**Fix:** Test handlers and effects directly without HTTP server:

```typescript
// ❌ Slow - starts actual server
Deno.test("my test", async () => {
  const server = createServer(routes);
  // ...
});

// ✅ Fast - test handler directly
Deno.test("my test", async () => {
  const ctx: RequestCtx = { req: new Request("http://localhost/"), ... };
  const res = await myHandler(ctx);
  assertEquals(res.status, 200);
});
```

---

## Getting More Help

- **Error messages**: Read them carefully! Typelang provides detailed hints.
- **Type errors**: Check that effect capabilities are properly propagated through `seq()` and
  `par()`.
- **Tests**: Look at existing tests in `tests/` and `typelang/runtime_test.ts` for examples.
- **Handlers**: Remember handler order matters - inner handlers run first.

---

## Common Patterns

### Running multiple effects together

```typescript
const result = await stack(
  handlers.Console.capture(),
  handlers.Exception.tryCatch(),
  handlers.State.with({ count: 0 }),
).run(() =>
  seq()
    .do(() => Console.log("Starting"))
    .let("initial", () => State.get())
    .do(() => State.modify((s) => ({ count: s.count + 1 })))
    .let("final", () => State.get())
    .return(({ initial, final }) => ({ initial, final }))
);

// result shape:
// {
//   result: { tag: "Ok", value: { initial: { count: 0 }, final: { count: 1 } } },
//   logs: ["Starting"],
//   state: { count: 1 }
// }
```

### Testing with captured effects

```typescript
Deno.test("my program logs and updates state", async () => {
  const result = await stack(
    handlers.Console.capture(),
    handlers.Exception.tryCatch(),
    handlers.State.with({ count: 0 }),
  ).run(() => myProgram);

  const captured = result as {
    result: { tag: string; value: unknown };
    logs: string[];
    state: { count: number };
  };

  assertEquals(captured.logs, ["Expected log message"]);
  assertEquals(captured.state.count, 1);
  assertEquals(captured.result.tag, "Ok");
});
```
