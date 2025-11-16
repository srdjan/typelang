# Changelog

All notable changes to this project will be documented in this file. Dates use YYYY-MM-DD.

## [0.4.0] - 2025-11-16

### Breaking changes

- Moved the showcase application from the root `app/` + `public/` directories into
  `examples/showcase/{app,public}` and updated every import/static reference (server, tests,
  scripts/lint_subset.ts) accordingly.
- Default server startup (`deno task dev`) now serves static assets from
  `./examples/showcase/public` and requires consumers to update any local overrides pointing at the
  old `./public` path.

### Features

- Added `examples/showcase/main.ts`, a reusable `scripts/dev.ts` runner, and new tasks
  (`deno task dev:showcase`, `deno task dev:example`) so any example in `examples/<name>/` can be
  booted directly.
- Introduced `examples/README.md` and `examples/showcase/README.md` to describe each example, the
  routes they expose, and how to launch them.
- Added a documentation index (`docs/README.md`) that inventories every guide/spec plus target
  audience to make it easier to find the right file.

### Improvements

- README now documents the v0.4.0 release, outlines the examples directory layout, links to the new
  documentation index, and includes an updated `seq()` example showing auto-generated context keys
  (`ctx.v1`, `ctx.v2`, ...).
- `CLAUDE.md`, `AGENTS.md`, testing docs, troubleshooting, and the subset linter instructions were
  rewritten to reference `examples/showcase/app/`, the new dev commands, and the relocated static
  assets.
- Archived migration-only docs (`docs/migration-v0.3.md`, `docs/guide-v0.2.md`) under
  `docs/archive/` and removed migration-specific sections from the active design specs.
- Cleaned up `TODO.md` by removing the deferred "Add support for pipes" item and aligning tasks with
  the completed examples reorganization.

### Bug fixes

- Static middleware tests now exercise files inside `./examples/showcase/public`, preventing false
  positives if the showcase assets move again.
- `server/main.ts` and related tests import showcase routes from the new location, ensuring
  `deno task dev` boots the moved example without manual tweaking.

## [0.3.0]

- Shipped the cancellation runtime with `ctx.signal`/`ctx.onCancel` plus RAII-style resource scopes.
- Rewrote handlers/tests to work with Result-based effects and wrapped user code with `ok()`.
- Added documentation covering cancellation patterns and resource cleanup.
