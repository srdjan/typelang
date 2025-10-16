# **typelang**: Exploration of a Strictly Functional TypeScript Subset

Lean, functional TypeScript subset with algebraic-effects style APIs, a tiny handler runtime, and a
**modern Deno HTTP server** that accepts externally-defined `Routes`.

## Run

```bash
deno task dev
# open http://localhost:8080
```

## Lint the subset rules

```bash
deno task lint
```

This runs Deno's built-in linter plus a lexical subset checker that forbids: classes, `this`, `new`,
`if`/`else`, ternary `?:`, loops, mutation (`++`, `--`, assignments), enums, namespaces, decorators,
and `let`/`var`.

## Test

```bash
# Run all tests (109 tests)
deno task test

# Run tests in watch mode (auto-rerun on file changes)
deno task test:watch

# Run tests with coverage report
deno task test:coverage
```

**Test Coverage:** 109 tests covering:

- ✅ Effect runtime (handlers, combinators, seq, par)
- ✅ HTTP server (routing, middleware, utilities)
- ✅ Security (path traversal, input validation)
- ✅ Functional subset linter

See [TEST_COVERAGE_REPORT.md](./TEST_COVERAGE_REPORT.md) for detailed coverage analysis.

## Project layout

```
typelang-repo/
  typelang/        # effect runtime + helpers: Eff, defineEffect, seq, par, handlers, match, pipe
  server/          # lean HTTP server + middleware + router
  app/             # external routes (the “input” to server)
  public/          # static assets (served at /static)
  scripts/         # subset linter (Deno-only)
  tests/           # comprehensive test suite (109 tests)
  deno.jsonc       # tasks: dev, test, lint, fmt
```

## Server features

- External `Routes` as input
- Path params (`/users/:id`)
- Middleware: logger, CORS, error boundary, rate-limit, static, auth stub
- HTMX-friendly sample page
- Tiny, dependency-free implementation

## Typelang (minimal surface used here)

- `Eff<A,E>` phantom effect type + `Combine` helper
- `defineEffect(name)` to declare typed ops and capability specs
- `stack(...handlers).run()` interpreter with built-in Console / State / Exception / Async handlers
- `seq()` and `par` helpers (iterator-free) for linear & parallel steps that respect `Eff`
- `match()` and `pipe()` utilities for expression-oriented control flow

---

Made with the help of my two devs: Clody & Gipity. Enjoy!
