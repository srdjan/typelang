// server/middleware.ts
import { Handler, Middleware, RequestCtx } from "./types.ts";
import { json, text } from "./http.ts";

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
  } catch (error) {
    const traceId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    console.error(`[error:${traceId}]`, error);
    const accept = ctx.req.headers.get("accept") ?? "";
    const wantsJson = accept.includes("application/json");
    const body = wantsJson
      ? json({ error: "Internal Server Error", traceId }, { status: 500 })
      : text(`Internal Server Error\ntrace: ${traceId}`, { status: 500 });
    return body;
  }
};

type CorsConfig = Readonly<{
  origins: readonly string[];
  methods?: string;
  headers?: string;
  exposeHeaders?: string;
  credentials?: boolean;
}>;

const normalizeOrigins = (origins: readonly string[]): readonly string[] =>
  origins
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

const buildCorsHeaders = (
  origin: string,
  config: CorsConfig,
  base: HeadersInit = {},
): Headers => {
  const headers = new Headers(base);
  headers.set("access-control-allow-origin", origin);
  headers.set("vary", "origin");
  headers.set(
    "access-control-allow-methods",
    config.methods ?? "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  );
  headers.set("access-control-allow-headers", config.headers ?? "content-type, authorization");
  if (config.exposeHeaders) {
    headers.set("access-control-expose-headers", config.exposeHeaders);
  }
  if (config.credentials) {
    headers.set("access-control-allow-credentials", "true");
  }
  return headers;
};

const originAllowed = (
  origin: string | null,
  allowAll: boolean,
  allowed: Set<string>,
): origin is string => {
  if (!origin) return false;
  return allowAll || allowed.has(origin);
};

export const withCors = (config: CorsConfig): Middleware => {
  const normalized = normalizeOrigins(config.origins);
  const allowAll = normalized.includes("*");
  const allowedOrigins = new Set(
    allowAll ? normalized.filter((origin) => origin !== "*") : normalized,
  );

  return (next) => async (ctx) => {
    const requestOrigin = ctx.req.headers.get("origin");
    const permitted = originAllowed(requestOrigin, allowAll, allowedOrigins);

    if (ctx.req.method === "OPTIONS") {
      if (!permitted) {
        return text("Forbidden", { status: 403 });
      }
      return new Response(null, { status: 204, headers: buildCorsHeaders(requestOrigin, config) });
    }

    const res = await next(ctx);
    if (!permitted) {
      return res;
    }

    const headers = buildCorsHeaders(requestOrigin, config, res.headers);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
};

type RateLimitOptions = Readonly<{
  trustProxyHeader?: boolean;
}>;

const resolveClientId = (ctx: RequestCtx, trustProxyHeader?: boolean): string => {
  if (trustProxyHeader) {
    const forwarded = ctx.req.headers.get("x-forwarded-for");
    if (forwarded) {
      const [first] = forwarded.split(",");
      if (first?.trim()) return first.trim();
    }
  }
  return ctx.ip;
};

export const withRateLimit = (reqsPerMin: number, opts: RateLimitOptions = {}): Middleware => {
  let windowMinute = Math.floor(Date.now() / 60000);
  const counts = new Map<string, number>();
  return (next) => async (ctx) => {
    const nowMinute = Math.floor(Date.now() / 60000);
    if (nowMinute !== windowMinute) {
      counts.clear();
      windowMinute = nowMinute;
    }
    const clientId = resolveClientId(ctx, opts.trustProxyHeader);
    const hits = (counts.get(clientId) ?? 0) + 1;
    counts.set(clientId, hits);
    if (hits > reqsPerMin) {
      return text("Too Many Requests", { status: 429 });
    }
    return await next(ctx);
  };
};

const mimeTypes: Readonly<Record<string, string>> = {
  "html": "text/html; charset=utf-8",
  "js": "application/javascript; charset=utf-8",
  "css": "text/css; charset=utf-8",
  "json": "application/json; charset=utf-8",
  "svg": "image/svg+xml",
  "png": "image/png",
  "jpg": "image/jpeg",
  "jpeg": "image/jpeg",
  "ico": "image/x-icon",
};

const getMimeType = (path: string, cache: Map<string, string>): string => {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (cache.has(ext)) return cache.get(ext)!;
  const type = mimeTypes[ext] ?? "application/octet-stream";
  cache.set(ext, type);
  return type;
};

export const withStatic = (prefix: string, dir: string): Middleware => {
  let resolvedRootPromise: Promise<string | null> | null = null;
  const resolveRoot = async () => {
    if (!resolvedRootPromise) {
      resolvedRootPromise = Deno.realPath(dir).catch(() => null);
    }
    return await resolvedRootPromise;
  };
  const mimeCache = new Map<string, string>();

  return (next) => async (ctx) => {
    if (ctx.req.method !== "GET" || !ctx.url.pathname.startsWith(prefix)) return await next(ctx);

    const requestedPath = ctx.url.pathname.slice(prefix.length).replace(/^\/+/, "") || "index.html";

    if (requestedPath.includes("..") || requestedPath.includes("\0")) {
      return text("Forbidden", { status: 403 });
    }

    const root = await resolveRoot();
    if (!root) return await next(ctx);

    const candidate = `${root}/${requestedPath}`;
    const realFile = await Deno.realPath(candidate).catch(() => null);

    if (!realFile || !realFile.startsWith(root)) {
      return text("Forbidden", { status: 403 });
    }

    try {
      const data = await Deno.readFile(realFile);
      const headers = new Headers({
        "content-type": getMimeType(realFile, mimeCache),
        "cache-control": "public, max-age=31536000, immutable",
      });
      return new Response(data, { headers });
    } catch {
      return await next(ctx);
    }
  };
};

export const withAuth = (predicate: (ctx: RequestCtx) => boolean): Middleware => (next) => (ctx) =>
  predicate(ctx) ? next(ctx) : text("Unauthorized", { status: 401 });
