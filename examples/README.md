# typelang Examples

The `examples/` directory hosts runnable programs that exercise the typelang runtime and server.
Each example ships with its own `main.ts` entrypoint plus application code under
`examples/<name>/app/` and static assets under `examples/<name>/public/`.

## Commands

| Command                        | Purpose                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `deno task dev`                | Default developer loop; runs `server/main.ts` which boots the showcase example on `/`.                       |
| `deno task dev:showcase`       | Directly runs `examples/showcase/main.ts` for quick smoke tests.                                             |
| `deno task dev:example [name]` | Generic runner that dynamically imports `examples/<name>/main.ts`. Omitting `[name]` defaults to `showcase`. |

You can pass CLI flags to `dev:example` after `--`, e.g. `deno task dev:example -- showcase`.

## Available examples

| Name       | Path                | Entry command                              | Description                                                                                                    |
| ---------- | ------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `showcase` | `examples/showcase` | `deno task dev` / `deno task dev:showcase` | HTMX dashboard demonstrating `seq()`, `par`, Console/State/Exception/Async handlers, and middleware streaming. |

## Adding a new example

1. Copy `examples/showcase` as a starting point or create an empty directory under
   `examples/<name>/`.
2. Place effect demos and routes inside `examples/<name>/app/` following the subset rules.
3. Put static assets in `examples/<name>/public/` so `withStatic()` can stream them via `/static`.
4. Create `examples/<name>/main.ts` that exports a `start()` function and optionally any named
   runner. Call
   `createServer(routes, { basePath: "", staticDir: "./examples/<name>/public", staticPrefix: "/static" })`.
5. Run it with `deno task dev:example <name>` and add documentation to `examples/<name>/README.md`.

Keeping examples self-contained ensures documentation stays accurate and allows the generic runner
to enumerate them automatically.
