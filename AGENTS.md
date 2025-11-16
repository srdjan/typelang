# Repository Guidelines

## Project Structure & Module Organization

The TypeScript subset lives in `typelang/` (core effect runtime, handlers, helpers). The production
HTTP pipeline is in `server/`, while `examples/showcase/app/` holds user-facing routes and showcase
demos that feed into the server. Static assets live in `examples/showcase/public/`, docs and specs
sit in `docs/` plus `TODO.md`, and cross-cutting scripts (subset linter, hook setup) are in
`scripts/`. Tests reside in `tests/` with fixtures in `coverage/` when coverage is generated.

## Build, Test, and Development Commands

Use `deno task dev` to start the local server on `http://127.0.0.1:8080`. `deno task dev:showcase`
invokes `examples/showcase/main.ts` directly, and `deno task dev:example <name>` loads
`examples/<name>/main.ts` through the generic runner. `deno task lint` runs `deno lint --quiet`
followed by `deno run -A scripts/lint_subset.ts` to enforce the functional subset. `deno task test`,
`deno task test:watch`, and `deno task test:coverage` cover the full suite, watch mode, and coverage
report respectively; expect artifacts inside `coverage/`. `deno task fmt` auto-formats the repo, and
`deno task setup-hooks` points Git at `.githooks/` if you need the same pre-commit checks locally.

## Coding Style & Naming Conventions

Formatting is handled by `deno fmt` with 2-space indentation, 100-character lines, and explicit
semicolons. Keep modules expression-oriented: avoid classes, loops, mutation, ternaries, and other
constructs blocked by `scripts/lint_subset.ts`. Prefer `camelCase` for functions/variables,
`PascalCase` for types, and filename slugs like `middleware.ts` or `seq_test.ts`. Import paths are
relative (no npm-style specifiers) and should avoid default exports in favor of named APIs.

## Testing Guidelines

Author tests with Deno’s built-in runner; place them in `tests/` and suffix files with `_test.ts` to
match the existing suite (`router_test.ts`, `subset_test.ts`, etc.). Organize tests around runtime
behaviors rather than HTTP endpoints, and capture edge cases for both sequential (`seq`) and
parallel (`par`) flows. Run `deno task test` before committing; if you touch effect handlers or HTTP
middleware, also run `deno task test:coverage` to ensure new logic stays covered.

## Commit & Pull Request Guidelines

Recent history shows short, descriptive, present-tense commits (`added todo file`,
`Update CLAUDE.md`). Follow that style: summarize scope in ~60 characters, expand on motivation or
follow-up steps in the body, and reference issues or PR numbers when applicable. Pull requests
should describe the change, list user-visible impacts, include reproduction or testing instructions
(`deno task test` output), and attach screenshots for UI-facing updates (the HTMX dashboard). Keep
PRs focused; split sweeping refactors into smaller patches when possible.

## Security & Configuration Tips

Runtime commands often use `deno run -A`; limit that to local development and secure CI by granting
only needed permissions (`--allow-read`/`--allow-write`). When exposing the server beyond localhost,
configure `withCors` and `withAuth` in `server/middleware.ts` explicitly rather than relying on
permissive defaults. Secrets or API tokens should never be committed—load them via environment
variables and thread them through the `RequestCtx` capabilities if needed.
