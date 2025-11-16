# **typelang**: Exploration of a Strictly Functional TypeScript Subset

Lean, functional TypeScript subset with algebraic-effects style APIs, a tiny handler runtime, and a
**modern Deno HTTP server** that accepts externally-defined `Routes`.

## Run

```bash
deno task dev
# open http://localhost:8080
```

## Interactive showcase

- Navigate to `/` to explore an HTMX-driven dashboard that renders typelang programs server-side.
- Each card highlights a concrete capability: `seq()` orchestration with State, `par` concurrency
  with Async, and typed Exception guards.
- Results stream back as structured JSON captured by `Console.capture()` and `State.with()`—no
  Promises or mutation in application code.
- The hero panel demonstrates middleware composition by calling `/health` without reloading the
  page.
- Zero external dependencies: the showcase relies exclusively on Deno, typelang runtime, and static
  CSS.

## Lint the subset rules

```bash
deno task lint
```

This runs Deno's built-in linter plus a lexical subset checker that forbids: classes, `this`, `new`,
`if`/`else`, ternary `?:`, loops, mutation (`++`, `--`, assignments), enums, namespaces, decorators,
and `let`/`var`.

## Test

```bash
# Run all tests (116 tests)
deno task test

# Run tests in watch mode (auto-rerun on file changes)
deno task test:watch

# Run tests with coverage report
deno task test:coverage
```

**Test Coverage:** 116 tests covering:

- ✅ Effect runtime (handlers, combinators, seq, par)
- ✅ HTTP server (routing, middleware, utilities)
- ✅ Showcase programs (Console, State, Exception, Async demos)
- ✅ Security (path traversal, input validation)
- ✅ Functional subset linter

See [TEST_COVERAGE_REPORT.md](./docs/TEST_COVERAGE_REPORT.md) for detailed coverage analysis.

## Project layout

```
typelang-repo/
  typelang/        # effect runtime + helpers: Eff, defineEffect, seq, par, handlers, match, pipe
  server/          # lean HTTP server + middleware + router
  app/             # external routes (the “input” to server)
  public/          # static assets (served at /static)
  scripts/         # subset linter (Deno-only)
  tests/           # comprehensive test suite (116 tests)
  deno.jsonc       # tasks: dev, test, lint, fmt
```

## Server features

- External `Routes` as input
- Path params (`/users/:id`)
- Middleware: logger, CORS, error boundary, rate-limit, static, auth stub
- Showcase root route renders HTMX-ready partials (`/showcase/:id`, `/showcase/:id/run`)
- Tiny, dependency-free implementation

## Configuration & security defaults

- `TYPELANG_ALLOWED_ORIGINS` (comma-separated) governs which origins receive CORS headers. Omit to
  fall back to `http://127.0.0.1:8080` and `http://localhost:8080`. You can also pass
  `allowedOrigins` to `createServer`.
- `TYPELANG_AUTH_TOKEN` enables bearer-token enforcement for every request (expect
  `Authorization: Bearer <token>`). Provide a custom predicate via `ServerOptions.auth` to replace
  this behavior.
- `TYPELANG_TRUST_PROXY` (set to `true`/`1`) allows the rate limiter to respect `x-forwarded-for`
  and should only be enabled behind a trusted ingress/proxy. Otherwise, client IPs are derived from
  the TCP connection.
- `TYPELANG_RATE_LIMIT` overrides the default 300-requests-per-minute budget enforced by
  `withRateLimit`. You can also set `ServerOptions.rateLimitPerMinute`.
- Static assets are streamed directly from disk with extension-based caching headers. Keep large
  files inside `public/` so `withStatic()` can serve them efficiently.

## Typelang (minimal surface used here)

- `Eff<A, Caps>` phantom effect type with record-based capabilities
- `defineEffect(name)` to declare typed ops and capability specs
- Record-based capability syntax: `Eff<User, { http: Http; db: Db; logger: Logger }>` makes
  dependencies explicit
- `stack(...handlers).run()` interpreter with built-in Console / State / Exception / Async handlers
- `seq()` and `par` helpers (iterator-free) for linear & parallel steps that respect `Eff`
- `match()` and `pipe()` utilities for expression-oriented control flow

---

Made with the help of my two devs: Clody & Gipity. Enjoy!
