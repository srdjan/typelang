# Resource Scopes & RAII Usage

Typelang's `Resource` effect introduces Gleam-style `use` scopes that automatically dispose
resources when the scope exits—whether it succeeds, throws, or is cancelled.

## Defining Resources

Create descriptors with `defineResource(acquire, release, { label })`. The descriptor is a pure
value describing how to acquire and release the resource, while actual work happens inside the
scope.

```ts
import { defineResource } from "../typelang/mod.ts";

const fileResource = (path: string) =>
  defineResource(
    () => Deno.openSync(path, { read: true }),
    (file) => {
      file.close();
      return undefined;
    },
    { label: `file(${path})` },
  );
```

Descriptors are typically wrapped in zero-argument functions when passed to `use`, so they can
capture parameters but remain pure.

## Basic Usage

```ts
import { handlers, stack, use } from "../typelang/mod.ts";
import { Resource } from "../typelang/effects.ts";

await stack(
  handlers.Resource.scope(),
).run(() =>
  use({ file: () => fileResource("./data/users.txt") }).in(({ file }) => {
    const text = new TextDecoder().decode(Deno.readAllSync(file));
    return text;
  })
);
```

The `file` handle is automatically closed when the scope exits.

## File I/O Example

```ts
const readFirstLine = (path: string) =>
  use({ file: () => fileResource(path) }).in(({ file }) => {
    const buffer = new Uint8Array(1024);
    const bytesRead = file.readSync(buffer) ?? 0;
    const firstLine = new TextDecoder().decode(buffer.subarray(0, bytesRead)).split("\n")[0];
    return firstLine;
  });
```

## Database Connection Example

```ts
const dbResource = (dsn: string) =>
  defineResource(
    () => connectToDatabase(dsn),
    (connection) => connection.close(),
    { label: `db(${dsn})` },
  );

const fetchUsers = () =>
  use({ db: () => dbResource(Deno.env.get("DATABASE_URL")!) }).in(async ({ db }) => {
    const rows = await db.query("SELECT id, email FROM users LIMIT 10");
    return rows;
  });
```

Exceptions during the query (or during acquisition) still trigger `connection.close()` in LIFO
order.

## Network Socket Example

```ts
const socketResource = (host: string, port: number) =>
  defineResource(
    async () => await Deno.connect({ hostname: host, port }),
    (socket) => socket.close(),
    { label: `socket(${host}:${port})` },
  );

const ping = (host: string, port: number) =>
  use({ socket: () => socketResource(host, port) }).in(async ({ socket }) => {
    await socket.write(new TextEncoder().encode("PING\r\n"));
    const buf = new Uint8Array(64);
    const read = await socket.read(buf);
    return read === null ? null : new TextDecoder().decode(buf.subarray(0, read));
  });
```

If the scope is cancelled (e.g., losing branch in `par.race`), the socket is still closed because
cleanups are registered via `CancellationContext.onCancel`.

## Working with Multiple Resources

`use` accepts multiple descriptor records; resources are acquired in the order provided and released
in reverse order automatically.

```ts
const processRequest = () =>
  use(
    { file: () => fileResource("./logs/access.log") },
    { db: () => dbResource("postgres://...") },
  ).in(async ({ file, db }) => {
    const request = await readRequest(file);
    await db.execute("INSERT INTO requests ...", request);
    return request.id;
  });
```

## Parallel & Cancellation

Because resource scopes create their own `AbortController`, they compose with `par` helpers:

```ts
await par.race([
  () => computeFastPath(),
  () =>
    use({ socket: () => socketResource("cache", 6379) }).in(async ({ socket }) => {
      // Automatically cleaned up if another branch wins.
      return await readFromCache(socket);
    }),
]);
```

Cleanups are registered using `CancellationContext.onCancel`, so cancellation cascades correctly and
errors during cleanup are logged but never rethrown.
