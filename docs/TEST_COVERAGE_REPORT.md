# Test Coverage Report

_Last updated: November 15, 2025_

## How coverage is generated

1. Run `deno task test:coverage`.
   - Executes the full suite (116 tests as of this report) with coverage instrumentation and stores
     raw data in `coverage/`.
2. Produce a human-readable summary: `deno coverage coverage --summary`.
   - Optionally emit LCOV for CI upload: `deno coverage coverage --lcov --output=coverage.lcov`.

## Summary

| Area                | Key Files / Directories      | Coverage Notes                                                                                                                        |
| ------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Effect runtime      | `typelang/`                  | Handler stack, cancellation scopes, and resource helpers exercised by `tests/runtime_test.ts`, `seq_test.ts`, and `resource_test.ts`. |
| HTTP server         | `server/`                    | Router, middleware, and static server verified via `tests/middleware_test.ts` and `tests/static_middleware_test.ts`.                  |
| Showcase + routes   | `examples/showcase/app/`     | Route handlers and demo programs covered in `tests/app_routes_test.ts` plus showcase-specific suites.                                 |
| Security safeguards | `server/middleware.ts`       | Error boundary, rate limiter, auth, and CORS paths now under targeted tests.                                                          |
| Subset tooling      | `scripts/`, `tests/subset_*` | Functional subset enforcement validated separately; excluded from coverage totals.                                                    |

Overall lines/statements remain above 90% for the runtime and server layers; UI-heavy files trend
lower because they render large HTML strings, but snapshot tests ensure regressions are caught.

## Keeping this report current

- Re-run the commands above whenever new modules are added or large refactors land.
- Update the “Summary” table with notable coverage gaps or newly added suites.
- Commit fresh LCOV artifacts if your CI or quality gates require them; otherwise, clear the
  `coverage/` directory before committing.
