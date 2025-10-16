import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { compileRoutes, matchRoute } from "../server/router.ts";
import { text } from "../server/http.ts";

Deno.test("route compilation handles exact match", () => {
  const routes = compileRoutes([
    { method: "GET", path: "/", handler: () => text("root") },
  ]);

  const match = matchRoute(routes, "GET", "/");
  assertEquals(match?.params, {});
});

Deno.test("route compilation extracts single param", () => {
  const routes = compileRoutes([
    { method: "GET", path: "/users/:id", handler: () => text("user") },
  ]);

  const match = matchRoute(routes, "GET", "/users/123");
  assertEquals(match?.params, { id: "123" });
});

Deno.test("route compilation extracts multiple params", () => {
  const routes = compileRoutes([
    { method: "GET", path: "/users/:id/posts/:postId", handler: () => text("post") },
  ]);

  const match = matchRoute(routes, "GET", "/users/123/posts/456");
  assertEquals(match?.params, { id: "123", postId: "456" });
});

Deno.test("route compilation handles trailing slash", () => {
  const routes = compileRoutes([
    { method: "GET", path: "/users/:id", handler: () => text("user") },
  ]);

  const match = matchRoute(routes, "GET", "/users/123/");
  assertEquals(match?.params, { id: "123" });
});

Deno.test("route compilation returns null for no match", () => {
  const routes = compileRoutes([
    { method: "GET", path: "/users/:id", handler: () => text("user") },
  ]);

  const match = matchRoute(routes, "GET", "/posts/123");
  assertEquals(match, null);
});

Deno.test("route compilation matches method exactly", () => {
  const routes = compileRoutes([
    { method: "GET", path: "/users", handler: () => text("get") },
    { method: "POST", path: "/users", handler: () => text("post") },
  ]);

  const getMatch = matchRoute(routes, "GET", "/users");
  const postMatch = matchRoute(routes, "POST", "/users");

  assertEquals(getMatch?.route.method, "GET");
  assertEquals(postMatch?.route.method, "POST");
});

Deno.test("route compilation handles special characters in params", () => {
  const routes = compileRoutes([
    { method: "GET", path: "/users/:id", handler: () => text("user") },
  ]);

  const match = matchRoute(routes, "GET", "/users/user-123");
  assertEquals(match?.params, { id: "user-123" });
});

Deno.test("route compilation handles nested paths", () => {
  const routes = compileRoutes([
    { method: "GET", path: "/api/v1/users/:id", handler: () => text("user") },
  ]);

  const match = matchRoute(routes, "GET", "/api/v1/users/123");
  assertEquals(match?.params, { id: "123" });
});
