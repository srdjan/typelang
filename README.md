# typelang v0.1 + Deno HTTP Server (Example Repo)

Lean, functional TypeScript subset with (optional) algebraic-effects style APIs and a **modern Deno HTTP server** that accepts externally-defined `Routes`.

## Run

```bash
deno task dev
# open http://localhost:8080
```

## Lint the subset rules

```bash
deno task lint
```

This runs Deno's linter plus an AST-based subset checker that forbids: classes, `this`, `new`, loops, mutation (`++`, `--`, assignments), enums, namespaces, decorators, and `let`/`var`.

## Project layout

```
typelang-repo/
  typelang/        # minimal v0.1 helpers: Eff, defineEffect, seq, par, match, pipe
  server/          # lean HTTP server + middleware + router
  app/             # external routes (the “input” to server)
  public/          # static assets (served at /static)
  scripts/         # subset linter (Deno-only)
  deno.jsonc       # tasks: dev, lint, fmt
```

## Server features

- External `Routes` as input
- Path params (`/users/:id`)
- Middleware: logger, CORS, error boundary, rate-limit, static, auth stub
- HTMX-friendly sample page
- Tiny, dependency-free implementation

## Typelang (minimal surface used here)

- `Eff<A,E>` phantom effect type (types only)
- `defineEffect(name)` to declare typed ops (data)
- `seq()` and `par` helpers (iterator-free) for linear & parallel steps
- `match()` and `pipe()` utilities

> The example server does not require effect handlers to run; the typelang helpers are included to show how you would structure app logic in the subset without generators.

---

Enjoy!
