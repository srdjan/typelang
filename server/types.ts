// server/types.ts
export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";

export type RequestCtx = Readonly<{
  req: Request;
  url: URL;
  params: Readonly<Record<string, string>>;
  query: Readonly<Record<string, string | string[]>>;
  locals: Readonly<Record<string, unknown>>;
}>;

export type Handler = (ctx: RequestCtx) => Response | Promise<Response>;

export type Route = Readonly<{
  method: Method;
  path: string;
  handler: Handler;
}>;

export type Routes = readonly Route[];

export type Middleware = (next: Handler) => Handler;

export type ServerOptions = Readonly<{
  basePath?: string;
  before?: readonly Middleware[];
  after?: readonly Middleware[];
  staticDir?: string;
  staticPrefix?: string;
}>;
