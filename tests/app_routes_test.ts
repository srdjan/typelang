import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { routes } from "../app/routes.ts";
import type { RequestCtx } from "../server/types.ts";

const findRoute = (method: string, path: string) =>
  routes.find((route) => route.method === method && route.path === path);

const baseCtx = (method: string, url: string): RequestCtx => {
  const request = new Request(url, { method });
  const parsed = new URL(url);
  return {
    req: request,
    url: parsed,
    params: {},
    query: {},
    locals: {},
  };
};

Deno.test("GET / renders landing page", async () => {
  const route = findRoute("GET", "/");
  if (!route) throw new Error("GET / route missing");

  const res = await route.handler(baseCtx("GET", "http://localhost/"));
  const body = await res.text();

  assertEquals(res.status, 200);
  assertStringIncludes(body, "What if TypeScript");
  assertStringIncludes(body, "purely functional");
});

Deno.test("GET /showcase/workflow returns demo card", async () => {
  const route = findRoute("GET", "/showcase/:id");
  if (!route) throw new Error("GET /showcase/:id route missing");

  const ctx: RequestCtx = {
    ...baseCtx("GET", "http://localhost/showcase/workflow"),
    params: { id: "workflow" },
  };

  const res = await route.handler(ctx);
  const body = await res.text();

  assertEquals(res.status, 200);
  assertStringIncludes(body, "Pure Workflow Sequencing");
  assertStringIncludes(body, "Run demo");
});

Deno.test("POST /showcase/workflow/run returns run fragment", async () => {
  const route = findRoute("POST", "/showcase/:id/run");
  if (!route) throw new Error("POST /showcase/:id/run route missing");

  const ctx: RequestCtx = {
    ...baseCtx("POST", "http://localhost/showcase/workflow/run"),
    params: { id: "workflow" },
  };

  const res = await route.handler(ctx);
  const body = await res.text();

  assertEquals(res.status, 200);
  assertStringIncludes(body, "Succeeded");
  assertStringIncludes(body, "Stage advanced");
});

Deno.test("GET /showcase/:id returns 404 for unknown demo", async () => {
  const route = findRoute("GET", "/showcase/:id");
  if (!route) throw new Error("GET /showcase/:id route missing");

  const ctx: RequestCtx = {
    ...baseCtx("GET", "http://localhost/showcase/missing"),
    params: { id: "missing" },
  };

  const res = await route.handler(ctx);

  assertEquals(res.status, 404);
});
