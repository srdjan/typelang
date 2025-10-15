// server/router.ts
import { Route, Routes, Handler, RequestCtx } from "./types.ts";
import { notFound } from "./http.ts";

const compile = (pattern: string) => {
  const parts = pattern.split("/").filter(Boolean);
  const names: string[] = [];
  const regex = new RegExp("^/" + parts.map((p) => {
    return p.startsWith(":") ? (names.push(p.slice(1)), "([^/]+)") : p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("/") + "/?$");
  return { regex, names } as const;
};

type Compiled = Route & { re: RegExp; names: readonly string[] };

export const compileRoutes = (routes: Routes): readonly Compiled[] =>
  routes.map((r) => {
    const { regex, names } = compile(r.path);
    return { ...r, re: regex, names };
  });

export const matchRoute = (routes: readonly Compiled[], method: string, pathname: string):
  { route: Compiled; params: Readonly<Record<string, string>> } | null => {

  const rs = routes.filter((r) => r.method === method);
  for (const r of rs) {
    const m = r.re.exec(pathname);
    if (m) {
      const params = Object.fromEntries(r.names.map((n, i) => [n, m[i + 1]]));
      return { route: r, params };
    }
  }
  return null;
};

export const buildHandler = (compiled: readonly Compiled[]): Handler => async (ctx) => {
  const hit = matchRoute(compiled, ctx.req.method, ctx.url.pathname);
  return hit ? await hit.route.handler({ ...ctx, params: hit.params }) : notFound();
};
