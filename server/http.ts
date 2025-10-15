// server/http.ts
export const json = <T>(data: T, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: new Headers({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...Object.fromEntries(new Headers(init.headers ?? {})),
    }),
  });

export const text = (body: string, init: ResponseInit = {}): Response =>
  new Response(body, {
    status: init.status ?? 200,
    headers: new Headers({
      "content-type": "text/plain; charset=utf-8",
      ...Object.fromEntries(new Headers(init.headers ?? {})),
    }),
  });

export const html = (body: string | Uint8Array, init: ResponseInit = {}): Response =>
  new Response(body, {
    status: init.status ?? 200,
    headers: new Headers({
      "content-type": "text/html; charset=utf-8",
      ...Object.fromEntries(new Headers(init.headers ?? {})),
    }),
  });

export const notFound = () => text("Not Found", { status: 404 });
export const methodNotAllowed = () => text("Method Not Allowed", { status: 405 });
export const redirect = (location: string, status: number = 302) =>
  new Response(null, { status, headers: { location } });

export const parseQuery = (url: URL): Readonly<Record<string, string | string[]>> => {
  const entries = Array.from(url.searchParams.entries());
  const keys = Array.from(new Set(entries.map(([k]) => k)));
  const obj = keys.map((k) => {
    const vs = url.searchParams.getAll(k);
    return [k, vs.length === 1 ? vs[0] : vs] as const;
  });
  return Object.fromEntries(obj);
};
