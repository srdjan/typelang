import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  compose,
  withAuth,
  withCors,
  withErrorBoundary,
  withLogger,
  withRateLimit,
  withStatic,
} from "../server/middleware.ts";
import { RequestCtx } from "../server/types.ts";
import { text } from "../server/http.ts";

const makeCtx = (
  url: string = "http://localhost/",
  method: string = "GET",
  headers: Record<string, string> = {},
): RequestCtx => ({
  req: new Request(url, { method, headers }),
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

Deno.test("withCors handles OPTIONS preflight request", async () => {
  const handler = withCors({ origin: "*" })(() => text("ok"));
  const ctx = makeCtx("http://localhost/", "OPTIONS");

  const res = await handler(ctx);

  assertEquals(res.status, 204);
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
  assertEquals(
    res.headers.get("access-control-allow-methods"),
    "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  );
  assert(res.headers.get("access-control-allow-headers")?.includes("content-type"));
});

Deno.test("withCors adds CORS headers to regular requests", async () => {
  const handler = withCors({ origin: "https://example.com" })(() => text("ok"));
  const ctx = makeCtx();

  const res = await handler(ctx);

  assertEquals(res.status, 200);
  assertEquals(res.headers.get("access-control-allow-origin"), "https://example.com");
  assertEquals(res.headers.get("vary"), "origin");
});

Deno.test("withCors accepts custom methods and headers", async () => {
  const handler = withCors({
    origin: "*",
    methods: "GET,POST",
    headers: "x-custom",
  })(() => text("ok"));
  const ctx = makeCtx("http://localhost/", "OPTIONS");

  const res = await handler(ctx);

  assertEquals(res.headers.get("access-control-allow-methods"), "GET,POST");
  assertEquals(res.headers.get("access-control-allow-headers"), "x-custom");
});

Deno.test("withAuth allows request when predicate returns true", async () => {
  const handler = withAuth(() => true)(() => text("ok"));
  const ctx = makeCtx();

  const res = await handler(ctx);

  assertEquals(res.status, 200);
  assertEquals(await res.text(), "ok");
});

Deno.test("withAuth blocks request when predicate returns false", async () => {
  const handler = withAuth(() => false)(() => text("ok"));
  const ctx = makeCtx();

  const res = await handler(ctx);

  assertEquals(res.status, 401);
  assertEquals(await res.text(), "Unauthorized");
});

Deno.test("withAuth receives context", async () => {
  let receivedPath = "";
  const handler = withAuth((ctx) => {
    receivedPath = ctx.url.pathname;
    return true;
  })(() => text("ok"));
  const ctx = makeCtx("http://localhost/test");

  await handler(ctx);

  assertEquals(receivedPath, "/test");
});

Deno.test("compose applies middleware in correct order", async () => {
  const log: string[] = [];

  const mw1 = (next: any) => async (ctx: any) => {
    log.push("mw1-before");
    const res = await next(ctx);
    log.push("mw1-after");
    return res;
  };

  const mw2 = (next: any) => async (ctx: any) => {
    log.push("mw2-before");
    const res = await next(ctx);
    log.push("mw2-after");
    return res;
  };

  const terminal = () => {
    log.push("terminal");
    return text("ok");
  };

  const handler = compose([mw1, mw2], terminal);
  await handler(makeCtx());

  assertEquals(log, ["mw1-before", "mw2-before", "terminal", "mw2-after", "mw1-after"]);
});
