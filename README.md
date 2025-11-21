# **typelang**: Exploration of a Strictly Functional TypeScript Subset

Current release: **v0.4.0** (November 16, 2025) — see `CHANGELOG.md` for the full notes.

Lean, functional TypeScript subset with algebraic-effects style APIs, a tiny handler runtime, and a
**modern Deno HTTP server** that accepts externally-defined `Routes`.

## Run

```bash
deno task dev              # default developer loop (showcase)
deno task dev:showcase     # run examples/showcase/main.ts directly
deno task dev:example demo # generic runner (defaults to showcase)
# open http://127.0.0.1:8080
```

See `examples/README.md` for the list of available demos and wiring instructions.

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
# Run all tests (140 tests)
deno task test

# Run tests in watch mode (auto-rerun on file changes)
deno task test:watch

# Run tests with coverage report
deno task test:coverage
```

**Test Coverage:** 140 tests covering:

- ✅ Effect runtime (handlers, combinators, seq, par)
- ✅ HTTP server (routing, middleware, utilities)
- ✅ Showcase programs (Console, State, Exception, Async demos)
- ✅ Security (path traversal, input validation)
- ✅ Functional subset linter

See [TEST_COVERAGE_REPORT.md](./docs/TEST_COVERAGE_REPORT.md) for detailed coverage analysis.

## Project layout

```
typelang-repo/
  typelang/                # effect runtime + helpers: Result, seq(), par(), handlers, resources
  server/                  # lean HTTP server + middleware + router
  examples/
    showcase/
      app/                 # user-facing routes and HTMX demos (subset-enforced)
      public/              # static assets for the showcase, served at /static
      main.ts              # example entrypoint exporting start()
  docs/                    # design documents, specs, troubleshooting, testing notes
  scripts/                 # subset linter + helper runners
  tests/                   # comprehensive test suite (140 tests)
  coverage/                # populated via deno task test:coverage
  deno.jsonc               # tasks: dev, dev:showcase, dev:example, test, lint, fmt
```

Read `examples/showcase/README.md` for a deep dive into the shipped showcase and its routes. See
`docs/README.md` for the full documentation map.

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
  files inside `examples/showcase/public/` so `withStatic()` can serve them efficiently.

## Typelang (minimal surface used here)

- `Eff<A, Caps>` phantom effect type with record-based capabilities
- `defineEffect(name)` to declare typed ops and capability specs
- Record-based capability syntax: `Eff<User, { http: Http; db: Db; logger: Logger }>` makes
  dependencies explicit
- `stack(...handlers).run()` interpreter with built-in Console / State / Exception / Async handlers
- `seq()` and `par` helpers (iterator-free) for linear & parallel steps that respect `Eff`
- `match()` and `pipe()` utilities for expression-oriented control flow

### seq() with named context keys

```typescript
const hydrateProfile = (userId: string) =>
  seq()
    .let("user", () => fetchUser(userId))
    .let("posts", (user) => fetchPosts(user.id))
    .let("followers", (_, ctx) => fetchFollowers(ctx!["user"].id))
    .returnWith(({ user, posts, followers }) => ({
      user,
      posts,
      followers,
    }));
```

**Best practice:** Use named `.let("key", fn)` for values you'll reference later. This provides
autocomplete, type safety, and self-documenting code. Anonymous `.let(fn)` generates auto keys
(`v1`, `v2`...) that require type assertions. The new `.returnWith(fn)` method receives a typed
context object, eliminating manual type casts.

---

Made with the help of my two devs: Clody & Gipity. Enjoy!
