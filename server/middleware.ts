// server/middleware.ts
import { Handler, Middleware, RequestCtx } from "./types.ts";
import { text } from "./http.ts";

export const compose = (mws: readonly Middleware[], terminal: Handler): Handler =>
  mws.reduceRight((next, mw) => mw(next), terminal);

export const withLogger = (sink: (s: string) => void): Middleware => (next) => async (ctx) => {
  const t0 = performance.now();
  const res = await next(ctx);
  const dt = Math.round(performance.now() - t0);
  sink(`${ctx.req.method} ${ctx.url.pathname} ${res.status} ${dt}ms`);
  return res;
};

export const withErrorBoundary: Middleware = (next) => async (ctx) => {
  try {
    return await next(ctx);
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : "Unknown error";
    return text(`Internal Error\n${msg}`, { status: 500 });
  }
};

export const withCors =
  (allow: Readonly<{ origin: string; methods?: string; headers?: string }>): Middleware =>
  (next) =>
  async (ctx) => {
    if (ctx.req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": allow.origin,
          "access-control-allow-methods": allow.methods ?? "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          "access-control-allow-headers": allow.headers ?? "content-type, authorization",
        },
      });
    }
    const res = await next(ctx);
    const h = new Headers(res.headers);
    h.set("access-control-allow-origin", allow.origin);
    h.set("vary", "origin");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  };

export const withRateLimit = (reqsPerMin: number): Middleware => {
  const bucket = new Map<string, readonly [number, number]>();
  return (next) => async (ctx) => {
    const ip = ctx.req.headers.get("x-forwarded-for") ?? "local";
    const nowMin = Math.floor(Date.now() / 60000);
    const prev = bucket.get(ip);
    const cur = !prev || prev[0] != nowMin ? [nowMin, 1] as const : [nowMin, prev[1] + 1] as const;
    bucket.set(ip, cur);
    return cur[1] > reqsPerMin ? text("Too Many Requests", { status: 429 }) : await next(ctx);
  };
};

export const withStatic = (prefix: string, dir: string): Middleware => (next) => async (ctx) => {
  if (ctx.req.method !== "GET" || !ctx.url.pathname.startsWith(prefix)) return await next(ctx);

  const requestedPath = ctx.url.pathname.slice(prefix.length).replace(/^\/+/, "");

  // Security: prevent path traversal attacks
  if (requestedPath.includes("..") || requestedPath.includes("\0")) {
    return text("Forbidden", { status: 403 });
  }

  const file = `${dir}/${requestedPath || "index.html"}`;

  try {
    // Security: ensure resolved path is within allowed directory
    const realDir = await Deno.realPath(dir).catch(() => null);
    const realFile = await Deno.realPath(file).catch(() => null);

    if (!realDir || !realFile || !realFile.startsWith(realDir)) {
      return text("Forbidden", { status: 403 });
    }

    const data = await Deno.readFile(realFile);
    const ext = realFile.split(".").pop() ?? "";
    const type = ({
      "html": "text/html; charset=utf-8",
      "js": "application/javascript; charset=utf-8",
      "css": "text/css; charset=utf-8",
      "json": "application/json; charset=utf-8",
      "svg": "image/svg+xml",
      "png": "image/png",
      "jpg": "image/jpeg",
      "jpeg": "image/jpeg",
      "ico": "image/x-icon",
    } as const)[ext] ?? "application/octet-stream";
    return new Response(data, {
      headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return await next(ctx);
  }
};

export const withAuth = (predicate: (ctx: RequestCtx) => boolean): Middleware => (next) => (ctx) =>
  predicate(ctx) ? next(ctx) : text("Unauthorized", { status: 401 });
