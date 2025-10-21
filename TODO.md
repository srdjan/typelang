## Examples Directory Reorganization TODO (Approved Plan)

A trackable checklist to migrate the current demo application into /examples/showcase while keeping
default dev behavior unchanged and adding a generic example runner.

---

## 1) Server Refactor (keep default `deno task dev` behavior)

- [ ] Edit server/main.ts (import.meta.main block only)
  - [ ] Import routes from ../../examples/showcase/app/routes.ts
  - [ ] Set staticDir to ./examples/showcase/public
  - [ ] Set staticPrefix to /static
  - [ ] Keep basePath "" (so the showcase mounts at "/")
  - [ ] Do not change the createServer export/API
- [ ] Quick smoke-compile: deno cache server/main.ts

Notes:

- Goal is to make server/main.ts the default dev runner for the showcase example without changing
  user-facing URLs.

---

## 2) File Moves (create example layout)

- [ ] Create directories
  - [ ] examples/
  - [ ] examples/showcase/
  - [ ] examples/showcase/app/
  - [ ] examples/showcase/app/pages/
  - [ ] examples/showcase/app/components/
  - [ ] examples/showcase/public/
- [ ] Move demo application code
  - [ ] Move app/routes.ts → examples/showcase/app/routes.ts
  - [ ] Move app/showcase.ts → examples/showcase/app/showcase.ts
  - [ ] Move app/demos_additional.ts → examples/showcase/app/demos_additional.ts
  - [ ] Move app/pages/* → examples/showcase/app/pages/
  - [ ] Move app/components/* → examples/showcase/app/components/
- [ ] Move static assets
  - [ ] Move public/* → examples/showcase/public/
- [ ] Remove/clean up empty app/ and public/ directories after successful moves

Notes:

- Preserve file names and internal app/ structure during moves.

---

## 3) Path & Import Fixes (after moves)

Update relative imports in moved files so they continue to reference shared root modules (typelang/,
server/):

- [ ] In examples/showcase/app/_.ts (files moved from app/_)
  - [ ] Update imports from ../typelang/... → ../../../typelang/...
  - [ ] Update imports from ../server/... → ../../../server/...
- [ ] In examples/showcase/app/pages/_.ts (files moved from app/pages/_)
  - [ ] Update imports from ../../typelang/... → ../../../../typelang/...
  - [ ] Update imports from ../../server/... → ../../../../server/...
  - [ ] Keep ../components/ui.ts (still correct within app/)
- [ ] In examples/showcase/app/routes.ts (moved from app/routes.ts)
  - [ ] Update imports from ../server/... → ../../../server/...
  - [ ] Update imports from ../typelang/... → ../../../typelang/...
  - [ ] Keep ./pages/*, ./showcase.ts, ./demos_additional.ts (still correct)
- [ ] In any files referencing server/highlight.ts or server/http.ts
  - [ ] Ensure paths are adjusted to ../../../server/highlight.ts and ../../../server/http.ts where
        applicable

Notes:

- Verify all imports resolve: deno cache examples/showcase/app/**/*.ts

---

## 4) Tasks & Runners (scripts + deno.jsonc)

- [ ] Create examples/showcase/main.ts (standalone entrypoint)
  - [ ] Import { createServer } from ../../server/main.ts
  - [ ] Import { routes } from ./app/routes.ts
  - [ ] In import.meta.main: createServer(routes, { basePath: "", staticDir:
        "./examples/showcase/public", staticPrefix: "/static" })
- [ ] Create scripts/dev.ts (generic example runner)
  - [ ] Accept example name via CLI arg (default: "showcase")
  - [ ] Dynamically import ./examples/<name>/main.ts and run it
  - [ ] On error, print available examples and exit(1)
- [ ] Update deno.jsonc tasks
  - [ ] Keep existing: "dev": "deno run -A server/main.ts" (unchanged default)
  - [ ] Add: "dev:showcase": "deno run -A examples/showcase/main.ts"
  - [ ] Add: "dev:example": "deno run -A scripts/dev.ts showcase" (or allow arg pass-through)

Notes:

- Default developer experience remains: deno task dev
- New runners allow per-example execution and discovery

---

## 5) Documentation Updates

- [ ] Update root README.md
  - [ ] Project layout: reflect examples/showcase/{app,public} instead of root app/public
  - [ ] Add "Examples" section with commands:
    - deno task dev (default showcase)
    - deno task dev:showcase
    - deno task dev:example showcase
  - [ ] Link to /examples/README.md
- [ ] Create /examples/README.md
  - [ ] List available examples (start with showcase)
  - [ ] How to run each (dev:showcase, dev:example)
  - [ ] Brief descriptions and pointers
- [ ] Create /examples/showcase/README.md
  - [ ] Describe the showcase
  - [ ] How to run via dev:showcase and scripts/dev.ts
  - [ ] Key routes and features

Notes:

- Keep docs consistent with unchanged default dev behavior and static asset paths (/static)

---

## 6) Verification & QA

- [ ] deno fmt (format)
- [ ] deno task lint (includes custom subset linter)
- [ ] deno task test (all tests pass)
- [ ] Smoke run (default): deno task dev
  - [ ] Open / (landing), /demos, /comparison, /learn/*
  - [ ] Confirm /static assets load from examples/showcase/public
- [ ] Smoke run (example entry): deno task dev:showcase
  - [ ] Confirm identical behavior to default dev
- [ ] Smoke run (generic runner): deno task dev:example showcase
  - [ ] Confirm identical behavior to default dev

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

## 8) Add support for pipes,

- [ ] Add support for pipes, using https://github.com/irony/aspipes

```typescript
const greeting = pipe("hello");
greeting | upper | ex("!!!");
```
