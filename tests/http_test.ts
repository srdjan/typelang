import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { html, json, notFound, parseQuery, redirect, text } from "../server/http.ts";

Deno.test("json() creates JSON response with correct headers", async () => {
  const data = { message: "hello", count: 42 };
  const res = json(data);

  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "application/json; charset=utf-8");
  assertEquals(res.headers.get("cache-control"), "no-store");

  const body = await res.json();
  assertEquals(body, data);
});

Deno.test("json() accepts custom status code", async () => {
  const data = { error: "not found" };
  const res = json(data, { status: 404 });

  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body, data);
});

Deno.test("json() accepts custom headers", async () => {
  const data = { value: 123 };
  const res = json(data, { headers: { "x-custom": "test" } });

  assertEquals(res.headers.get("x-custom"), "test");
  assertEquals(res.headers.get("content-type"), "application/json; charset=utf-8");
});

Deno.test("text() creates text response with correct headers", async () => {
  const res = text("Hello, World!");

  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "text/plain; charset=utf-8");

  const body = await res.text();
  assertEquals(body, "Hello, World!");
});

Deno.test("text() accepts custom status code", async () => {
  const res = text("Unauthorized", { status: 401 });

  assertEquals(res.status, 401);
  const body = await res.text();
  assertEquals(body, "Unauthorized");
});

Deno.test("html() creates HTML response with correct headers", async () => {
  const markup = "<h1>Hello</h1>";
  const res = html(markup);

  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "text/html; charset=utf-8");

  const body = await res.text();
  assertEquals(body, markup);
});

Deno.test("html() accepts Uint8Array body", async () => {
  const markup = new TextEncoder().encode("<p>Test</p>");
  const res = html(markup);

  assertEquals(res.status, 200);
  const body = await res.text();
  assertEquals(body, "<p>Test</p>");
});

Deno.test("notFound() returns 404 response", async () => {
  const res = notFound();

  assertEquals(res.status, 404);
  const body = await res.text();
  assertEquals(body, "Not Found");
});

Deno.test("redirect() creates redirect response", () => {
  const res = redirect("/home");

  assertEquals(res.status, 302);
  assertEquals(res.headers.get("location"), "/home");
});

Deno.test("redirect() accepts custom status code", () => {
  const res = redirect("/permanent", 301);

  assertEquals(res.status, 301);
  assertEquals(res.headers.get("location"), "/permanent");
});

Deno.test("parseQuery() handles empty query string", () => {
  const url = new URL("http://localhost/path");
  const query = parseQuery(url);

  assertEquals(query, {});
});

Deno.test("parseQuery() handles single value", () => {
  const url = new URL("http://localhost/path?name=John");
  const query = parseQuery(url);

  assertEquals(query, { name: "John" });
});

Deno.test("parseQuery() handles multiple different params", () => {
  const url = new URL("http://localhost/path?name=John&age=30&city=NYC");
  const query = parseQuery(url);

  assertEquals(query, { name: "John", age: "30", city: "NYC" });
});

Deno.test("parseQuery() handles array values (same key multiple times)", () => {
  const url = new URL("http://localhost/path?tag=red&tag=blue&tag=green");
  const query = parseQuery(url);

  assertEquals(query, { tag: ["red", "blue", "green"] });
});

Deno.test("parseQuery() handles mixed single and array values", () => {
  const url = new URL("http://localhost/path?name=John&tag=red&tag=blue&age=30");
  const query = parseQuery(url);

  assertEquals(query, { name: "John", tag: ["red", "blue"], age: "30" });
});

Deno.test("parseQuery() handles URL-encoded values", () => {
  const url = new URL("http://localhost/path?message=Hello%20World&email=test%40example.com");
  const query = parseQuery(url);

  assertEquals(query, { message: "Hello World", email: "test@example.com" });
});

Deno.test("parseQuery() handles empty value", () => {
  const url = new URL("http://localhost/path?key=");
  const query = parseQuery(url);

  assertEquals(query, { key: "" });
});

Deno.test("parseQuery() handles key without value", () => {
  const url = new URL("http://localhost/path?flag");
  const query = parseQuery(url);

  assertEquals(query, { flag: "" });
});
