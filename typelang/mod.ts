// typelang/mod.ts
// Minimal v0.1 surface: Eff phantom type, defineEffect, seq/par, match, pipe.
// This file intentionally keeps runtime tiny for the example server.
export type Eff<A, E> = A & { readonly __eff?: (e: E) => E };
export type Pure<A> = Eff<A, {}>;
export type Combine<E1, E2> = E1 & E2;

// Simple effect op constructor factory (types-first; runtime opaque)
export type Instr<Name extends string, K extends string, R, Args extends any[]> = {
  readonly _tag: Name;
  readonly kind: K;
  readonly args: Args;
  readonly __ret?: R;
};

export function defineEffect<Name extends string, Spec extends Record<string, (...a: any[]) => any>>(name: Name) {
  type K = keyof Spec & string;
  type Ret<F> = F extends (...a: any[]) => infer R ? R : never;
  type Args<F> = F extends (...a: infer A) => any ? A : never;

  const op = new Proxy({} as any as { [P in K]: (...a: Args<Spec[P]>) => Instr<Name, P, Ret<Spec[P]>, Args<Spec[P]>> }, {
    get: (_t, prop: string) => (...args: unknown[]) => ({ _tag: name, kind: prop, args }) as any
  });
  return { op } as const;
}

// Iterator-free sequential builder (supports sync/async operations)
export type Ctx = Record<string, unknown>;
type Step<C> = (c: Readonly<C>) => unknown | Promise<unknown>;
export function seq<C0 extends Ctx = {}>() {
  const steps: Step<C0>[] = [];
  let ctx: any = {} as C0;

  const api: any = {
    let<K extends string, A>(key: K, f: (c: Readonly<C0>) => A | Promise<A>) {
      steps.push(async (c) => ({ ...c, [key]: await f(c as any) }));
      return api;
    },
    do<E>(f: (c: Readonly<C0>) => unknown | Promise<unknown>) {
      steps.push(async (c) => { await f(c as any); return c; });
      return api;
    },
    async return<A>(f: (c: Readonly<C0>) => A | Promise<A>) {
      for (const s of steps) ctx = await s(ctx);
      return await f(ctx);
    }
  };
  return api as {
    let: typeof api.let;
    do: typeof api.do;
    return: typeof api.return;
  };
}

// Parallel helpers built on Promise.all
export const par = {
  async all<T extends Record<string, () => any>>(tasks: T): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
    const entries = Object.entries(tasks) as [string, () => any][];
    const results = await Promise.all(entries.map(([_, t]) => t()));
    const out: Record<string, unknown> = {};
    entries.forEach(([k], i) => out[k] = results[i]);
    return out as any;
  },
  async map<T, U>(xs: readonly T[], f: (t: T) => any): Promise<readonly U[]> {
    return await Promise.all(xs.map((x) => f(x))) as unknown as readonly U[];
  },
  async race<T>(thunks: readonly Array<() => any>): Promise<T> {
    return await Promise.race(thunks.map((t) => t())) as T;
  }
};

// Exhaustive pattern matching helper
export function match<T extends { tag: string }, R>(value: T, cases: { [K in T["tag"]]: (v: Extract<T, { tag: K }>) => R }): R {
  const fn = (cases as any)[value.tag];
  if (!fn) throw new Error("Non-exhaustive match for tag=" + value.tag);
  return fn(value as any);
}

// Left-to-right function piping
export const pipe = <A>(a: A, ...fns: Array<(x: any) => any>) => fns.reduce((x, f) => f(x), a);
