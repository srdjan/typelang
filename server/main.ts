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
import * as App from "../examples/showcase/app/routes.ts";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://127.0.0.1:8080",
  "http://localhost:8080",
] as const;

const safeEnvGet = (key: string): string | null => {
  try {
    return Deno.env.get(key) ?? null;
  } catch {
    return null;
  }
};

const resolveAllowedOrigins = (origins?: readonly string[]): readonly string[] => {
  if (origins && origins.length > 0) {
    return origins;
  }
  const fromEnv = safeEnvGet("TYPELANG_ALLOWED_ORIGINS");
  if (fromEnv) {
    return fromEnv
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }
  return DEFAULT_ALLOWED_ORIGINS;
};

const timingSafeEquals = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
};

const resolveAuthPredicate = (override?: (ctx: RequestCtx) => boolean) => {
  if (override) {
    return override;
  }
  const token = safeEnvGet("TYPELANG_AUTH_TOKEN");
  if (!token) {
    return (_ctx: RequestCtx) => true;
  }
  const expected = `Bearer ${token}`;
  return (ctx: RequestCtx) => {
    const header = ctx.req.headers.get("authorization");
    return header !== null && timingSafeEquals(header.trim(), expected);
  };
};

const resolveTrustProxy = (flag?: boolean): boolean => {
  if (typeof flag === "boolean") return flag;
  const env = safeEnvGet("TYPELANG_TRUST_PROXY");
  return env === "1" || env?.toLowerCase() === "true";
};

const resolveRateLimit = (override?: number): number => {
  if (typeof override === "number" && override > 0) return override;
  const env = safeEnvGet("TYPELANG_RATE_LIMIT");
  const parsed = env ? Number(env) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 300;
};

const extractIp = (info: Deno.ServeHandlerInfo): string => {
  const remote = info.remoteAddr;
  if (remote?.transport === "tcp") {
    return remote.hostname;
  }
  return "local";
};

export const createServer = (routes: Routes, opts: ServerOptions = {}) => {
  const compiled = compileRoutes(routes);
  const terminal = buildHandler(compiled);
  const allowedOrigins = resolveAllowedOrigins(opts.allowedOrigins);
  const authPredicate = resolveAuthPredicate(opts.auth);
  const trustProxy = resolveTrustProxy(opts.trustProxy);
  const rateLimit = resolveRateLimit(opts.rateLimitPerMinute);

  const before = [
    withErrorBoundary,
    withLogger((s) => console.log(s)),
    withCors({ origins: allowedOrigins }),
    withRateLimit(rateLimit, { trustProxyHeader: trustProxy }),
    ...(opts.staticDir && opts.staticPrefix ? [withStatic(opts.staticPrefix, opts.staticDir)] : []),
    withAuth(authPredicate),
    ...(opts.before ?? []),
  ] as const;

  const handler = compose(before, terminal);

  return Deno.serve({
    port: 8080,
    hostname: "127.0.0.1",
    onListen: ({ port, hostname }) => console.log(`listening on http://${hostname}:${port}`),
  }, (req: Request, info) => {
    const url = new URL(req.url);
    const ctx: RequestCtx = {
      req,
      url,
      params: {},
      query: parseQuery(url),
      locals: {},
      ip: extractIp(info),
    };
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
  createServer(App.routes, {
    basePath: "",
    staticDir: "./examples/showcase/public",
    staticPrefix: "/static",
  });
}
