# Testing Guide - typelang

This document provides a comprehensive guide to testing in the typelang project.

---

## Quick Start

```bash
# Run all tests
deno task test

# Run tests in watch mode (auto-rerun on changes)
deno task test:watch

# Run tests with coverage report
deno task test:coverage
```

---

## Test Suite Overview

**Total Tests:** 109\
**Execution Time:** ~250ms\
**Line Coverage:** 78.3%\
**Branch Coverage:** 79.9%\
**Status:** ✅ All passing

---

## Test Organization

### 1. Effect Runtime Tests (`typelang/`)

**Files:**

- `typelang/runtime_test.ts` (6 tests)
- `tests/effects_test.ts` (5 tests)
- `tests/seq_test.ts` (10 tests)

**Coverage:**

- Effect handlers (Console, Exception, State, Async)
- Sequential combinators (seq().let, .do, .when, .return)
- Parallel combinators (par.all, par.map, par.race)
- Handler composition and stacking

**Example:**

```typescript
Deno.test("console capture collects logs and wraps result", async () => {
  const outcome = await stack(
    handlers.Console.capture(),
    handlers.Exception.tryCatch(),
  ).run(() =>
    seq()
      .do(() => Console.log("hello"))
      .return(() => "ok")
  );

  assertEquals(outcome.logs, ["hello"]);
});
```

---

### 2. HTTP Server Tests (`server/`)

**Files:**

- `tests/router_test.ts` (8 tests)
- `tests/middleware_test.ts` (13 tests)
- `tests/static_middleware_test.ts` (9 tests)
- `tests/http_test.ts` (18 tests)

**Coverage:**

- Route compilation and matching
- Path parameter extraction
- All middleware functions (error boundary, logger, CORS, rate limit, static, auth)
- HTTP utilities (json, html, text, redirect, parseQuery)
- Security (path traversal, null bytes, symlink attacks)

**Example:**

```typescript
Deno.test("withStatic blocks path traversal", async () => {
  const handler = withStatic("/static", "./examples/showcase/public")(nextHandler);
  const ctx = makeCtx("http://localhost/static/../etc/passwd");

  const res = await handler(ctx);

  assertEquals(res.status, 403);
});
```

---

### 3. Core Utilities Tests

**Files:**

- `tests/pipe_test.ts` (10 tests)
- `tests/errors_test.ts` (20 tests)

**Coverage:**

- Function composition (pipe with 1-9 functions)
- Result type utilities (ok, err, map, flatMap, mapError)
- Error constructors (validation, notFound, unauthorized, etc.)

**Example:**

```typescript
Deno.test("pipe() with multiple functions", () => {
  const add1 = (x: number) => x + 1;
  const double = (x: number) => x * 2;
  const toString = (x: number) => `Result: ${x}`;

  const result = pipe(5, add1, double, toString);

  assertEquals(result, "Result: 12");
});
```

---

### 4. Linter Tests (`scripts/`)

**Files:**

- `tests/subset_test.ts` (17 tests)

**Coverage:**

- All forbidden constructs (if/else, ternary, class, this, loops, let/var, ++/--)
- Allowed constructs (const, new Proxy)
- Edge cases (comments, strings)

**Example:**

```typescript
Deno.test("scan rejects if statement", () => {
  const source = `if (flag) { console.log(flag); }`;
  const diagnostics = scan("test.ts", source);

  assertEquals(diagnostics.length, 1);
  assert(diagnostics[0].message.includes("if"));
});
```

---

## Running Specific Tests

```bash
# Run tests in a specific file
deno test tests/router_test.ts --allow-read --allow-write

# Run tests matching a pattern
deno test --filter "withStatic" --allow-read --allow-write

# Run a specific test by name
deno test --filter "blocks path traversal" --allow-read --allow-write
```

---

## Coverage Reports

The `test:coverage` task generates both text and HTML coverage reports:

```bash
deno task test:coverage
```

**Output:**

- Terminal summary with line/branch coverage percentages
- `coverage/lcov.info` - LCOV format for CI integration
- `coverage/html/index.html` - Interactive HTML report

**Current Coverage:**

| File                   | Branch % | Line %   |
| ---------------------- | -------- | -------- |
| typelang/errors.ts     | 100.0    | 100.0    |
| server/http.ts         | 100.0    | 94.9     |
| server/router.ts       | 100.0    | 88.6     |
| typelang/effects.ts    | 100.0    | 91.7     |
| typelang/mod.ts        | 100.0    | 85.9     |
| server/middleware.ts   | 76.0     | 86.9     |
| typelang/runtime.ts    | 80.6     | 73.6     |
| scripts/lint_subset.ts | 76.5     | 67.7     |
| **All files**          | **79.9** | **78.3** |

---

## Writing New Tests

### Test File Naming

- Place tests in `tests/` directory
- Name files with `_test.ts` suffix (e.g., `router_test.ts`)
- Runtime tests can live in `typelang/runtime_test.ts`

### Test Structure

```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { functionToTest } from "../module.ts";

Deno.test("descriptive test name", () => {
  // Arrange
  const input = "test input";

  // Act
  const result = functionToTest(input);

  // Assert
  assertEquals(result, "expected output");
});

Deno.test("async test", async () => {
  const result = await asyncFunction();
  assertEquals(result, expected);
});
```

### Testing Patterns

**1. Pure Functions (easiest)**

```typescript
Deno.test("calculateTotal sums items", () => {
  const items = [{ price: 10 }, { price: 20 }];
  assertEquals(calculateTotal(items), 30);
});
```

**2. Effect Handlers (use stack)**

```typescript
Deno.test("handler processes effect", async () => {
  const result = await stack(myHandler).run(() => myEffect());
  assertEquals(result, expected);
});
```

**3. HTTP Handlers (use synthetic requests)**

```typescript
Deno.test("handler returns JSON", async () => {
  const ctx = {
    req: new Request("http://localhost/"),
    url: new URL("http://localhost/"),
    params: {},
    query: {},
    locals: {},
  };

  const res = await handler(ctx);
  assertEquals(res.status, 200);
});
```

**4. Middleware (compose with test handler)**

```typescript
Deno.test("middleware transforms response", async () => {
  const next = () => text("ok");
  const handler = myMiddleware()(next);

  const res = await handler(ctx);
  assertEquals(res.headers.get("x-custom"), "value");
});
```

---

## Continuous Integration

The test suite is designed to run in CI environments:

```yaml
# Example GitHub Actions workflow
- name: Run tests
  run: deno task test

- name: Generate coverage
  run: deno task test:coverage
```

**Requirements:**

- Deno 1.40+ (uses standard library 0.224.0)
- Permissions: `--allow-read --allow-write` (for file system tests)

---

## Test Coverage Goals

| Module         | Current | Target  | Status        |
| -------------- | ------- | ------- | ------------- |
| Effect Runtime | 90%     | 90%     | ✅ Met        |
| HTTP Server    | 75%     | 80%     | ⚠️ Close      |
| Core Utilities | 70%     | 80%     | ⚠️ Needs work |
| Linter         | 95%     | 90%     | ✅ Exceeded   |
| **Overall**    | **78%** | **85%** | ⚠️ Close      |

---

## Known Gaps

### Application Routes (examples/showcase/app/routes.ts)

- **Coverage:** 0%
- **Priority:** Medium
- **Effort:** 1-2 hours
- **Tests Needed:** 8-10 integration tests

### Integration Tests

- **Coverage:** Minimal
- **Priority:** Medium
- **Effort:** 2-3 hours
- **Tests Needed:** 5-10 end-to-end tests

### Performance Tests

- **Coverage:** None
- **Priority:** Low
- **Effort:** 2-3 hours
- **Tests Needed:** Basic benchmarks

---

## Troubleshooting

### Tests Fail with Permission Errors

Add required permissions:

```bash
deno test --allow-read --allow-write
```

### Tests Timeout

Increase timeout for slow tests:

```typescript
Deno.test({
  name: "slow test",
  fn: async () => {/* ... */},
  sanitizeOps: false,
  sanitizeResources: false,
});
```

### Coverage Report Not Generated

Ensure coverage directory is writable:

```bash
rm -rf coverage
deno task test:coverage
```

---

## Resources

- [Deno Testing Documentation](https://deno.land/manual/testing)
- [Deno Standard Library Assertions](https://deno.land/std/assert)
- [Test Coverage Report](./TEST_COVERAGE_REPORT.md)

---

_Last Updated: 2025-10-16_\
_Test Suite Version: 109 tests_
