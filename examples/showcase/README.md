# Showcase Example

The showcase is typelang's primary demo: a server-rendered HTMX dashboard that exercises sequential
(`seq()`) and parallel (`par`) flows, exception-safe orchestration, and the strict functional
subset.

## Layout

```
examples/showcase/
  app/        # Route handlers, demo programs, UI renderers
  public/     # Static CSS/assets served at /static
  main.ts     # Entry point exporting start()
```

## Running

- `deno task dev` – boots `server/main.ts`, which imports the showcase routes and assets by default.
- `deno task dev:showcase` – runs `examples/showcase/main.ts` directly.
- `deno task dev:example showcase` – uses the dynamic runner in `scripts/dev.ts`.

All commands listen on `http://127.0.0.1:8080` and expose:

- `/` – Hero landing page with highlights and demo selector
- `/showcase/:id` – Detail page per effect demo
- `/showcase/:id/run` – HTMX endpoint that executes the program server-side
- `/comparison`, `/learn/*` – Educational routes rendered from the subset-safe UI modules

## Demo coverage

| Demo               | Capabilities                     | Notes                                                |
| ------------------ | -------------------------------- | ---------------------------------------------------- |
| Workflow sequencer | `seq()`, Console, State          | Shows automatic context keys `ctx.v1`, `ctx.v2`, ... |
| Parallel effects   | `par.all`, Async                 | Demonstrates cancellation-aware tasks                |
| Exception guards   | Exception handler                | Throws and captures structured errors                |
| Additional cards   | Async, Console, State, Exception | Defined in `demos_additional.ts`                     |

The HTMX cards read from `Console.capture()` output and streamed JSON artifacts so you can audit
handler results without mutating global state.
