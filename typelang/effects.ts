// typelang/effects.ts
// Built-in effect interface definitions

import { defineInterface, type InterfaceSpec } from "./interfaces.ts";
import { ok, type Result } from "./errors.ts";
import { type Instr } from "./types.ts";

// Console effect interface
export const ConsoleInterface = defineInterface<"Console", {
  log: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}>("Console");

export type ConsoleInterface = typeof ConsoleInterface;

// Helper to create console operations
const createConsoleOp = <K extends keyof ConsoleInterface["operations"]>(
  kind: K,
) =>
(...args: Parameters<ConsoleInterface["operations"][K]>): Result<
  void,
  never,
  { console: ConsoleInterface }
> => {
  const instr: Instr<"Console", K & string, void, typeof args> = {
    _tag: "Console",
    kind: kind as K & string,
    args,
  };
  return ok(instr as unknown as void);
};

const consoleOps = {
  log: createConsoleOp("log"),
  warn: createConsoleOp("warn"),
  error: createConsoleOp("error"),
};

export const Console = {
  ...consoleOps,
  op: consoleOps,
  spec: ConsoleInterface,
} as const;

// Exception effect interface
export const ExceptionInterface = defineInterface<"Exception", {
  fail: <E>(error: E) => never;
}>("Exception");

export type ExceptionInterface = typeof ExceptionInterface;

const exceptionOps = {
  fail: <E>(error: E): Result<never, E, { exception: ExceptionInterface }> => {
    const instr: Instr<"Exception", "fail", never, [E]> = {
      _tag: "Exception",
      kind: "fail",
      args: [error] as const,
    };
    return ok(instr as unknown as never);
  },
};

export const Exception = {
  ...exceptionOps,
  op: exceptionOps,
  spec: ExceptionInterface,
} as const;

// State effect interface
export const StateInterface = defineInterface<"State", {
  get: <S>() => S;
  put: <S>(next: S) => void;
  modify: <S>(update: (state: S) => S) => void;
}>("State");

export type StateInterface = typeof StateInterface;

const stateOps = {
  get: <S>(): Result<S, never, { state: StateInterface }> => {
    const instr: Instr<"State", "get", S, []> = {
      _tag: "State",
      kind: "get",
      args: [],
    };
    return ok(instr as unknown as S);
  },
  put: <S>(next: S): Result<void, never, { state: StateInterface }> => {
    const instr: Instr<"State", "put", void, [S]> = {
      _tag: "State",
      kind: "put",
      args: [next],
    };
    return ok(instr as unknown as void);
  },
  modify: <S>(update: (state: S) => S): Result<void, never, { state: StateInterface }> => {
    const instr: Instr<"State", "modify", void, [(state: S) => S]> = {
      _tag: "State",
      kind: "modify",
      args: [update],
    };
    return ok(instr as unknown as void);
  },
};

export const State = {
  ...stateOps,
  op: stateOps,
  spec: StateInterface,
} as const;

// Async effect interface
export const AsyncInterface = defineInterface<"Async", {
  sleep: (ms: number) => void;
  await: <T>(promise: Promise<T>) => T;
}>("Async");

export type AsyncInterface = typeof AsyncInterface;

const asyncOps = {
  sleep: (ms: number): Result<void, never, { async: AsyncInterface }> => {
    const instr: Instr<"Async", "sleep", void, [number]> = {
      _tag: "Async",
      kind: "sleep",
      args: [ms],
    };
    return ok(instr as unknown as void);
  },
  await: <T>(promise: Promise<T>): Result<T, never, { async: AsyncInterface }> => {
    const instr: Instr<"Async", "await", T, [Promise<T>]> = {
      _tag: "Async",
      kind: "await",
      args: [promise],
    };
    return ok(instr as unknown as T);
  },
};

export const Async = {
  ...asyncOps,
  op: asyncOps,
  spec: AsyncInterface,
} as const;

// Http effect interface
export const HttpInterface = defineInterface<"Http", {
  get: (url: string, options?: RequestInit) => Response;
  post: (url: string, body?: unknown, options?: RequestInit) => Response;
  put: (url: string, body?: unknown, options?: RequestInit) => Response;
  delete: (url: string, options?: RequestInit) => Response;
}>("Http");

export type HttpInterface = typeof HttpInterface;

const createHttpOp = <K extends keyof HttpInterface["operations"]>(
  kind: K,
) =>
(...args: Parameters<HttpInterface["operations"][K]>): Result<
  Response,
  never,
  { http: HttpInterface }
> => {
  const instr: Instr<"Http", K & string, Response, typeof args> = {
    _tag: "Http",
    kind: kind as K & string,
    args,
  };
  return ok(instr as unknown as Response);
};

const httpOps = {
  get: createHttpOp("get"),
  post: createHttpOp("post"),
  put: createHttpOp("put"),
  delete: createHttpOp("delete"),
};

export const Http = {
  ...httpOps,
  op: httpOps,
  spec: HttpInterface,
} as const;

// Resource effect interface
export const ResourceInterface = defineInterface<"Resource", {
  scope: (
    descriptors: Readonly<Record<string, unknown>>,
    body: (
      resources: Readonly<Record<string, unknown>>,
    ) => Result<unknown, unknown, unknown> | Promise<Result<unknown, unknown, unknown>>,
  ) => unknown;
}>("Resource");

export type ResourceInterface = typeof ResourceInterface;

const resourceOps = {
  scope: <R extends Readonly<Record<string, unknown>>, T, E, Effects>(
    descriptors: R,
    body: (resources: R) => Result<T, E, Effects> | Promise<Result<T, E, Effects>>,
  ): Result<T, E, Effects & { resource: ResourceInterface }> => {
    const instr: Instr<"Resource", "scope", T, [R, typeof body]> = {
      _tag: "Resource",
      kind: "scope",
      args: [descriptors, body as any],
    };
    return ok(instr as unknown as T);
  },
};

export const Resource = {
  ...resourceOps,
  op: resourceOps,
  spec: ResourceInterface,
} as const;
