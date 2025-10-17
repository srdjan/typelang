// server/main.ts
import { buildHandler, compileRoutes } from "./router.ts";
import {
  compose,
  withAuth,
  withCors,
  withErrorBoundary,
  withLogger,
  withRateLimit,
  withStatic,
} from "./middleware.ts";
import { RequestCtx, Routes, ServerOptions } from "./types.ts";
import { parseQuery } from "./http.ts";
import * as App from "../app/routes.ts";

export const createServer = (routes: Routes, opts: ServerOptions = {}) => {
  const compiled = compileRoutes(routes);
  const terminal = buildHandler(compiled);

  const before = [
    withErrorBoundary,
    withLogger((s) => console.log(s)),
    withCors({ origin: "*" }),
    withRateLimit(300),
    ...(opts.staticDir && opts.staticPrefix ? [withStatic(opts.staticPrefix, opts.staticDir)] : []),
    withAuth((_ctx) => true),
    ...(opts.before ?? []),
  ] as const;

  const handler = compose(before, terminal);

  return Deno.serve({
    port: 8080,
    hostname: "127.0.0.1",
    onListen: ({ port, hostname }) => console.log(`listening on http://${hostname}:${port}`),
  }, (req: Request) => {
    const url = new URL(req.url);
    const ctx: RequestCtx = { req, url, params: {}, query: parseQuery(url), locals: {} };
    if (opts.basePath && !url.pathname.startsWith(opts.basePath)) {
      return new Response("Not Found", { status: 404 });
    }
    const normalized = opts.basePath
      ? url.pathname.slice(opts.basePath.length) || "/"
      : url.pathname;
    const patched = { ...ctx, url: new URL(url.origin + normalized + url.search) };
    return handler(patched);
  });
};

if (import.meta.main) {
  createServer(App.routes, { basePath: "", staticDir: "./public", staticPrefix: "/static" });
}
