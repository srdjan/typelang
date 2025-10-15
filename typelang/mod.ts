// typelang/mod.ts
// Public surface: types, effect constructors, sequential/parallel combinators, and helpers.

import { Handler, handlers as builtInHandlers, resolveEff, stack } from "./runtime.ts";
import { AwaitedReturn, Capability, Combine, Eff, Instr, Pure } from "./types.ts";

type EffectFn = (...args: any[]) => unknown;

type Args<F> = F extends (...args: infer A) => unknown ? readonly [...A] : readonly unknown[];
type Ret<F> = F extends (...args: any[]) => infer R ? AwaitedReturn<R> : never;

export type { Capability, Combine, Eff, Pure };
export { builtInHandlers as handlers, resolveEff, stack };
export type { Handler };

// Effect constructor --------------------------------------------------------

export function defineEffect<
  Name extends string,
  Spec extends { readonly [K in keyof Spec]: EffectFn },
>(name: Name) {
  type K = keyof Spec & string;
  type OpMap = {
    readonly [P in K]: (...args: Args<Spec[P]>) => Eff<Ret<Spec[P]>, Capability<Name, Spec>>;
  };

  const op = new Proxy({} as OpMap, {
    get: (_target, prop: string) => (...args: readonly unknown[]) =>
      ({ _tag: name, kind: prop, args, __ret: undefined as unknown as Ret<Spec[K]> } as Instr<
        Name,
        typeof prop,
        Ret<Spec[K]>,
        typeof args
      >) as unknown as Eff<Ret<Spec[K]>, Capability<Name, Spec>>,
  });

  const spec = {} as Capability<Name, Spec>;

  return { name, op, spec } as const;
}

// Sequential builder --------------------------------------------------------

type Ctx = Readonly<Record<string, unknown>>;
type StepFn = (ctx: Record<string, unknown>) => Promise<Record<string, unknown>>;

type SeqBuilder<C> = {
  let<K extends string, A, E>(
    key: K,
    f: (ctx: Readonly<C>) => Eff<A, E>,
  ): SeqBuilder<C & Readonly<Record<K, A>>>;
  do<E>(f: (ctx: Readonly<C>) => Eff<unknown, E>): SeqBuilder<C>;
  return<A, E>(f: (ctx: Readonly<C>) => Eff<A, E>): Eff<A, E>;
};

const freeze = <T extends Record<string, unknown>>(value: T): T => Object.freeze({ ...value });

const runSteps = async (steps: readonly StepFn[]): Promise<Record<string, unknown>> =>
  steps.reduce(
    (acc, step) => acc.then(step),
    Promise.resolve(freeze({})),
  );

const buildSeq = <C>(steps: readonly StepFn[]): SeqBuilder<C> => ({
  let<K extends string, A, E>(key: K, f: (ctx: Readonly<C>) => Eff<A, E>) {
    const next: StepFn = async (ctx) => {
      const current = ctx as Readonly<C>;
      const value = await resolveEff(f(current));
      return freeze({ ...current, [key]: value });
    };
    return buildSeq<C & Readonly<Record<K, A>>>([...steps, next]);
  },
  do<E>(f: (ctx: Readonly<C>) => Eff<unknown, E>) {
    const next: StepFn = async (ctx) => {
      await resolveEff(f(ctx as Readonly<C>));
      return ctx;
    };
    return buildSeq<C>([...steps, next]);
  },
  return<A, E>(f: (ctx: Readonly<C>) => Eff<A, E>) {
    return resolveEff(
      (async () => {
        const context = await runSteps(steps);
        return await resolveEff(f(context as Readonly<C>));
      })(),
    ) as unknown as Eff<A, E>;
  },
});

export function seq<C0 extends Ctx = {}>() {
  return buildSeq<C0>([]);
}

// Parallel helpers ----------------------------------------------------------

const mapEntries = async (
  entries: readonly [string, () => Eff<unknown, unknown>][],
): Promise<Readonly<Record<string, unknown>>> => {
  const results = await Promise.all(entries.map(([_, task]) => resolveEff(task())));
  return Object.freeze(
    Object.fromEntries(entries.map(([key], index) => [key, results[index]])),
  );
};

export const par = {
  all<T extends Record<string, () => Eff<unknown, unknown>>>(tasks: T) {
    const entries = Object.entries(tasks) as readonly [string, () => Eff<unknown, unknown>][];
    return resolveEff(
      (async () => await mapEntries(entries))(),
    ) as unknown as Eff<
      { readonly [K in keyof T]: AwaitedReturn<ReturnType<T[K]>> },
      unknown
    >;
  },
  map<T, U, E>(xs: readonly T[], f: (value: T) => Eff<U, E>) {
    return resolveEff(
      (async () => await Promise.all(xs.map((x) => resolveEff(f(x)))))(),
    ) as unknown as Eff<readonly AwaitedReturn<U>[], E>;
  },
  race<T, E>(thunks: readonly (() => Eff<T, E>)[]) {
    return resolveEff(Promise.race(thunks.map((t) => resolveEff(t())))) as unknown as Eff<
      AwaitedReturn<T>,
      E
    >;
  },
} as const;

// Utilities -----------------------------------------------------------------

export const match = <T extends { readonly tag: string }, R>(
  value: T,
  cases: { readonly [K in T["tag"]]: (v: Extract<T, { readonly tag: K }>) => R },
): R => {
  const handler = cases[value.tag as T["tag"]];
  if (!handler) throw Error(`Non-exhaustive match for tag=${value.tag}`);
  return handler(value as Extract<T, { readonly tag: typeof value.tag }>);
};

export const pipe = <A>(input: A, ...fns: ReadonlyArray<(x: unknown) => unknown>) =>
  fns.reduce<unknown>((acc, fn) => fn(acc), input as unknown);
