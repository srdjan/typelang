## Examples Directory Reorganization TODO (Approved Plan)

A trackable checklist to migrate the current demo application into /examples/showcase while keeping
default dev behavior unchanged and adding a generic example runner.

> Status: Completed for v0.4.0 — kept for reference so future examples can follow the same plan.

---

## 1) Server Refactor (keep default `deno task dev` behavior)

- [x] Edit server/main.ts (import.meta.main block only)
  - [x] Import routes from ../../examples/showcase/app/routes.ts
  - [x] Set staticDir to ./examples/showcase/public
  - [x] Set staticPrefix to /static
  - [x] Keep basePath "" (so the showcase mounts at "/")
  - [x] Do not change the createServer export/API
- [x] Quick smoke-compile: deno cache server/main.ts

Notes:

- Goal is to make server/main.ts the default dev runner for the showcase example without changing
  user-facing URLs.

---

## 2) File Moves (create example layout)

- [x] Create directories
  - [x] examples/
  - [x] examples/showcase/
  - [x] examples/showcase/app/
  - [x] examples/showcase/app/pages/
  - [x] examples/showcase/app/components/
  - [x] examples/showcase/public/
- [x] Move demo application code
  - [x] Move app/routes.ts → examples/showcase/app/routes.ts
  - [x] Move app/showcase.ts → examples/showcase/app/showcase.ts
  - [x] Move app/demos_additional.ts → examples/showcase/app/demos_additional.ts
  - [x] Move app/pages/* → examples/showcase/app/pages/
  - [x] Move app/components/* → examples/showcase/app/components/
- [x] Move static assets
  - [x] Move public/* → examples/showcase/public/
- [x] Remove/clean up empty app/ and public/ directories after successful moves

Notes:

- Preserve file names and internal app/ structure during moves.

---

## 3) Path & Import Fixes (after moves)

Update relative imports in moved files so they continue to reference shared root modules (typelang/,
server/):

- [x] In examples/showcase/app/_.ts (files moved from app/_)
  - [x] Update imports from ../typelang/... → ../../../typelang/...
  - [x] Update imports from ../server/... → ../../../server/...
- [x] In examples/showcase/app/pages/_.ts (files moved from app/pages/_)
  - [x] Update imports from ../../typelang/... → ../../../../typelang/...
  - [x] Update imports from ../../server/... → ../../../../server/...
  - [x] Keep ../components/ui.ts (still correct within app/)
- [x] In examples/showcase/app/routes.ts (moved from app/routes.ts)
  - [x] Update imports from ../server/... → ../../../server/...
  - [x] Update imports from ../typelang/... → ../../../typelang/...
  - [x] Keep ./pages/*, ./showcase.ts, ./demos_additional.ts (still correct)
- [x] In any files referencing server/highlight.ts or server/http.ts
  - [x] Ensure paths are adjusted to ../../../server/highlight.ts and ../../../server/http.ts where
        applicable

Notes:

- Verify all imports resolve: deno cache examples/showcase/app/**/*.ts

---

## 4) Tasks & Runners (scripts + deno.jsonc)

- [x] Create examples/showcase/main.ts (standalone entrypoint)
  - [x] Import { createServer } from ../../server/main.ts
  - [x] Import { routes } from ./app/routes.ts
  - [x] In import.meta.main: createServer(routes, { basePath: "", staticDir:
        "./examples/showcase/public", staticPrefix: "/static" })
- [x] Create scripts/dev.ts (generic example runner)
  - [x] Accept example name via CLI arg (default: "showcase")
  - [x] Dynamically import ./examples/<name>/main.ts and run it
  - [x] On error, print available examples and exit(1)
- [x] Update deno.jsonc tasks
  - [x] Keep existing: "dev": "deno run -A server/main.ts" (unchanged default)
  - [x] Add: "dev:showcase": "deno run -A examples/showcase/main.ts"
  - [x] Add: "dev:example": "deno run -A scripts/dev.ts showcase" (or allow arg pass-through)

Notes:

- Default developer experience remains: deno task dev
- New runners allow per-example execution and discovery

---

## 5) Documentation Updates

- [x] Update root README.md
  - [x] Project layout: reflect examples/showcase/{app,public} instead of root app/public
  - [x] Add "Examples" section with commands:
    - deno task dev (default showcase)
    - deno task dev:showcase
    - deno task dev:example showcase
  - [x] Link to /examples/README.md
- [x] Create /examples/README.md
  - [x] List available examples (start with showcase)
  - [x] How to run each (dev:showcase, dev:example)
  - [x] Brief descriptions and pointers
- [x] Create /examples/showcase/README.md
  - [x] Describe the showcase
  - [x] How to run via dev:showcase and scripts/dev.ts
  - [x] Key routes and features

Notes:

- Keep docs consistent with unchanged default dev behavior and static asset paths (/static)

---

## 6) Verification & QA

- [x] deno fmt (format)
- [x] deno task lint (includes custom subset linter)
- [x] deno task test (all tests pass)
- [x] Smoke run (default): deno task dev
  - [x] Open / (landing), /demos, /comparison, /learn/*
  - [x] Confirm /static assets load from examples/showcase/public
- [x] Smoke run (example entry): deno task dev:showcase
  - [x] Confirm identical behavior to default dev
- [x] Smoke run (generic runner): deno task dev:example showcase
  - [x] Confirm identical behavior to default dev

Notes:

- Ensure no imports are broken after path updates
- Confirm that keep-alive default dev UX remains unchanged

---

## 7) Add resource Management RAII ispired by and gleam syntax

- [√]

  ```gleam
  pub fn process_file() {
    use file <- with_file("data.txt")
    use connection <- with_database() process_data_with_resources(file, connection)
  }
  ```

  to something like this:

  ```typescript
  const process_file = () => {
    use file & connection {
      const data = file.read("data.txt")
      const records = connection.query("SELECT * FROM users")
      return records
    }
  }
  ```
