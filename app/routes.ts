// app/routes.ts
import { Routes } from "../server/types.ts";
import { html, isoNow, json, redirect } from "../server/http.ts";

const ok = <T>(data: T) => json({ ok: true, data });

export const routes: Routes = [
  { method: "GET", path: "/health", handler: () => ok({ status: "ok" }) },
  {
    method: "GET",
    path: "/",
    handler: () =>
      html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>typelang-deno</title>
    <meta name="color-scheme" content="light dark" />
    <script src="https://unpkg.com/htmx.org@2.0.3"></script>
    <link rel="stylesheet" href="/static/app.css" />
  </head>
  <body>
    <header><h1>typelang + Deno</h1></header>
    <main>
      <button hx-get="/api/time" hx-swap="outerHTML">What time is it?</button>
      <div id="time"></div>
      <form hx-post="/echo" hx-target="#echo" hx-swap="innerHTML">
        <input name="msg" placeholder="say hi" />
        <button type="submit">Send</button>
      </form>
      <div id="echo"></div>
    </main>
  </body>
</html>`),
  },
  {
    method: "GET",
    path: "/users/:id",
    handler: ({ params, query }) => ok({ id: params.id, q: query }),
  },
  {
    method: "POST",
    path: "/echo",
    handler: async ({ req }) => {
      const ct = req.headers.get("content-type") ?? "";
      const body = ct.includes("application/json")
        ? await req.json()
        : Object.fromEntries((await req.formData()).entries());
      return html(`<pre id="echo">${escapeHtml(JSON.stringify(body, null, 2))}</pre>`);
    },
  },
  { method: "GET", path: "/api/time", handler: () => html(`<div id="time">${isoNow()}</div>`) },
  { method: "GET", path: "/go", handler: () => redirect("/") },
];

const escapeHtml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll(
    '"',
    "&quot;",
  ).replaceAll("'", "&#039;");
