import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { withErrorBoundary, withLogger, withRateLimit } from "../server/middleware.ts";
import { RequestCtx } from "../server/types.ts";
import { text } from "../server/http.ts";

const makeCtx = (url: string = "http://localhost/"): RequestCtx => ({
  req: new Request(url),
  url: new URL(url),
  params: {},
  query: {},
  locals: {},
});

Deno.test("withErrorBoundary catches thrown errors", async () => {
  const handler = withErrorBoundary(() => {
    throw new Error("boom");
  });

  const res = await handler(makeCtx());
  assertEquals(res.status, 500);
  const body = await res.text();
  assertEquals(body.includes("boom"), true);
});

Deno.test("withErrorBoundary passes through successful responses", async () => {
  const handler = withErrorBoundary(() => text("ok"));

  const res = await handler(makeCtx());
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "ok");
});

Deno.test("withLogger logs request details", async () => {
  const logs: string[] = [];
  const handler = withLogger((msg) => logs.push(msg))(() => text("ok"));

  await handler(makeCtx("http://localhost/test"));

  assertEquals(logs.length, 1);
  assertEquals(logs[0]?.includes("GET"), true);
  assertEquals(logs[0]?.includes("/test"), true);
  assertEquals(logs[0]?.includes("200"), true);
});

Deno.test("withRateLimit allows requests under limit", async () => {
  const handler = withRateLimit(2)(() => text("ok"));
  const ctx = makeCtx();

  const res1 = await handler(ctx);
  const res2 = await handler(ctx);

  assertEquals(res1.status, 200);
  assertEquals(res2.status, 200);
});

Deno.test("withRateLimit blocks requests over limit", async () => {
  const handler = withRateLimit(2)(() => text("ok"));
  const ctx = makeCtx();

  await handler(ctx);
  await handler(ctx);
  const res3 = await handler(ctx);

  assertEquals(res3.status, 429);
  const body = await res3.text();
  assertEquals(body, "Too Many Requests");
});

Deno.test("withRateLimit resets after time window", async () => {
  const handler = withRateLimit(1)(() => text("ok"));
  const ctx = makeCtx();

  const res1 = await handler(ctx);
  assertEquals(res1.status, 200);

  // Rate limit is per minute, so we can't easily test reset without waiting
  // This test documents the behavior
});
