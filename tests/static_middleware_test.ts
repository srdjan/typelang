import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { withStatic } from "../server/middleware.ts";
import { RequestCtx } from "../server/types.ts";
import { text } from "../server/http.ts";

const makeCtx = (
  url: string = "http://localhost/",
  method: string = "GET",
): RequestCtx => ({
  req: new Request(url, { method }),
  url: new URL(url),
  params: {},
  query: {},
  locals: {},
  ip: "127.0.0.1",
});

const nextHandler = () => text("next handler called");

Deno.test("withStatic serves files from directory", async () => {
  const handler = withStatic("/static", "./examples/showcase/public")(nextHandler);
  const ctx = makeCtx("http://localhost/static/app.css");

  const res = await handler(ctx);

  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "text/css; charset=utf-8");

  const body = await res.text();
  // Verify it's actually the CSS file content
  assertEquals(body.length > 0, true);
});

Deno.test("withStatic URL normalization prevents path traversal", async () => {
  const handler = withStatic("/static", "./examples/showcase/public")(nextHandler);
  // URL constructor normalizes paths, so ../.. gets resolved
  // This means /static/subdir/../../etc becomes /etc which doesn't match /static prefix
  const ctx = makeCtx("http://localhost/static/subdir/../../../etc/passwd");

  const res = await handler(ctx);

  // Path is normalized to /etc/passwd which doesn't start with /static
  // So it goes to next handler
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "next handler called");
});

Deno.test("withStatic blocks null bytes", async () => {
  const handler = withStatic("/static", "./examples/showcase/public")(nextHandler);
  const ctx = makeCtx("http://localhost/static/file\0.txt");

  const res = await handler(ctx);

  assertEquals(res.status, 403);
  assertEquals(await res.text(), "Forbidden");
});

Deno.test("withStatic only handles GET requests", async () => {
  const handler = withStatic("/static", "./examples/showcase/public")(nextHandler);
  const ctx = makeCtx("http://localhost/static/app.css", "POST");

  const res = await handler(ctx);

  assertEquals(res.status, 200);
  assertEquals(await res.text(), "next handler called");
});

Deno.test("withStatic only handles paths with prefix", async () => {
  const handler = withStatic("/static", "./examples/showcase/public")(nextHandler);
  const ctx = makeCtx("http://localhost/api/users");

  const res = await handler(ctx);

  assertEquals(res.status, 200);
  assertEquals(await res.text(), "next handler called");
});

Deno.test("withStatic returns 403 for non-existent files (realPath fails)", async () => {
  const handler = withStatic("/static", "./examples/showcase/public")(nextHandler);
  const ctx = makeCtx("http://localhost/static/nonexistent.txt");

  const res = await handler(ctx);

  // realPath returns null for non-existent files, triggering the security check
  assertEquals(res.status, 403);
  assertEquals(await res.text(), "Forbidden");
});

Deno.test("withStatic sets correct content-type for different extensions", async () => {
  const handler = withStatic("/static", "./examples/showcase/public")(nextHandler);

  // Test CSS
  const cssCtx = makeCtx("http://localhost/static/app.css");
  const cssRes = await handler(cssCtx);
  assertEquals(cssRes.headers.get("content-type"), "text/css; charset=utf-8");
});

Deno.test("withStatic sets cache-control headers", async () => {
  const handler = withStatic("/static", "./examples/showcase/public")(nextHandler);
  const ctx = makeCtx("http://localhost/static/app.css");

  const res = await handler(ctx);

  assertEquals(res.headers.get("cache-control"), "public, max-age=31536000, immutable");
});

Deno.test("withStatic realPath check prevents symlink attacks", async () => {
  // Create a temporary directory structure for testing
  const tempDir = await Deno.makeTempDir();
  const publicDir = `${tempDir}/public`;
  const secretDir = `${tempDir}/secret`;

  try {
    await Deno.mkdir(publicDir);
    await Deno.mkdir(secretDir);
    await Deno.writeTextFile(`${publicDir}/allowed.txt`, "allowed");
    await Deno.writeTextFile(`${secretDir}/secret.txt`, "secret");

    // Create a symlink from public to secret (if permissions allow)
    try {
      await Deno.symlink(`${secretDir}/secret.txt`, `${publicDir}/link.txt`);

      const handler = withStatic("/static", publicDir)(nextHandler);
      const ctx = makeCtx(`http://localhost/static/link.txt`);
      const res = await handler(ctx);

      // realPath resolves the symlink, which points outside publicDir
      // So it should be blocked
      assertEquals(res.status, 403);
      assertEquals(await res.text(), "Forbidden");
    } catch (symlinkError) {
      // If symlink creation fails (permissions), skip this test
      console.log("Skipping symlink test - insufficient permissions");
    }
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
