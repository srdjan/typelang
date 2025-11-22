# Typelang Improvements (Current Snapshot)

Status as of **v0.4.0 (November 16, 2025)**. This file keeps a concise, up-to-date record of what
changed recently so other docs stay lean.

## Highlights

- **seq() ergonomics**: Anonymous `.let(fn)` steps now store results under auto-generated context
  keys (`v1`, `v2`, `v3`, ...) while still updating `last`. Named `.let("key", fn)` remains the
  recommended pattern for reusable bindings. `tapWith`/`returnWith` provide typed context access and
  `when()` handles conditional branches without breaking the subset rules.
- **Parallel + cancellation**: `par.all`, `par.map`, and `par.race` propagate cancellation through
  per-branch `AbortController`s. Losing branches are aborted in races; failures abort siblings in
  `par.all/map`. Resource cleanup hooks (`ctx.onCancel`) run in LIFO order.
- **Resource scopes**: `use()` supplies RAII-style acquisition and disposal with automatic cleanup
  on completion, exceptions, or cancellation.
- **Server hardening**: Static file middleware normalizes paths, rejects traversal attempts, and
  sets cache/content-type headers; rate limiting and auth remain opt-in via middleware.

## Test Coverage

- **140 tests** across runtime, server, subset linter, resources, cancellation, and showcase flows
  (see `deno task test` output). This grew from the earlier 49-test baseline.
- Tasks in `deno.jsonc`:
  - `deno task test` - full suite
  - `deno task test:watch` - watch mode
  - `deno task test:coverage` - writes artifacts to `./coverage/`
- The subset linter runs as part of `deno task lint` (`deno lint --quiet` + `scripts/lint_subset.ts`
  over subset-enforced paths).

## Git Hooks & Tooling

- `deno task setup-hooks` points Git at `.githooks/`.
- Pre-commit hook **gates only**: `deno fmt --check`, `deno task lint`, and
  `deno test --allow-read --allow-write --quiet`. It never auto-formats.
- `deno fmt` handles formatting (2-space indent, 100-column line width, semicolons).

## Examples & Layout Notes

- `examples/showcase` is the current example app. It exercises `seq()`, `par`, handlers, and the
  functional subset via HTMX pages served from `server/main.ts`.
- Generic runner remains available via `deno task dev:example` (defaults to the showcase).

## Pointers

- For architecture/assistant guidance: `CLAUDE.md` and `AGENTS.md`.
- For resource semantics: `docs/resource-usage.md` and `docs/resource-raii-design.md`.
- For cancellation details: `docs/cancellation-design.md` and
  `docs/cancellation-implementation-summary.md`.
- Active backlog lives in `TODO.md`.
