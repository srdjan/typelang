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
type StepResult = Readonly<{ ctx: Record<string, unknown>; last: unknown }>;
type StepFn = (state: StepResult) => Promise<StepResult>;

type SeqBuilder<C, Last> = {
  // Anonymous .let() - stores value as "last"
  let<A, E>(f: (last: Last, ctx?: Readonly<C>) => Eff<A, E>): SeqBuilder<C, A>;
  // Named .let() - stores in context AND as "last"
  let<K extends string, A, E>(
    key: K,
    f: (last: Last, ctx?: Readonly<C>) => Eff<A, E>,
  ): SeqBuilder<C & Readonly<Record<K, A>>, A>;
  // Chain last value (like Promise.then)
  then<A, E>(f: (last: Last) => Eff<A, E>): SeqBuilder<C, A>;
  // Side effect with last value only
  tap<E>(f: (last: Last) => Eff<void, E>): SeqBuilder<C, Last>;
  // Side effect with last + context
  do<E>(f: (last: Last, ctx: Readonly<C>) => Eff<void, E>): SeqBuilder<C, Last>;
  // Conditional execution
  when<E>(
    predicate: (last: Last, ctx?: Readonly<C>) => boolean,
    thenBranch: (last: Last, ctx?: Readonly<C>) => Eff<void, E>,
  ): SeqBuilder<C, Last>;
  // Return last value directly
  value(): Eff<Last, unknown>;
  // Return transformed value
  return<A, E>(f: (last: Last, ctx?: Readonly<C>) => Eff<A, E>): Eff<A, E>;
};

const freeze = <T extends Record<string, unknown>>(value: T): T => Object.freeze({ ...value });

const runSteps = async (steps: readonly StepFn[]): Promise<StepResult> =>
  steps.reduce(
    (acc, step) => acc.then(step),
    Promise.resolve({ ctx: freeze({}), last: undefined as unknown }),
  );

const buildSeq = <C, Last>(steps: readonly StepFn[]): SeqBuilder<C, Last> => ({
  let(...args: readonly unknown[]) {
    // Detect anonymous vs named based on first argument type
    if (typeof args[0] === "string") {
      // Named: .let("key", fn)
      const key = args[0] as string;
      const f = args[1] as (last: Last, ctx?: Readonly<C>) => unknown;
      const next: StepFn = async (state) => {
        const value = await resolveEff(f(state.last as Last, state.ctx as Readonly<C>));
        return { ctx: freeze({ ...state.ctx, [key]: value }), last: value };
      };
      return buildSeq([...steps, next]) as unknown as SeqBuilder<
        C & Readonly<Record<string, unknown>>,
        unknown
      >;
    } else {
      // Anonymous: .let(fn)
      const f = args[0] as (last: Last, ctx?: Readonly<C>) => unknown;
      const next: StepFn = async (state) => {
        const value = await resolveEff(f(state.last as Last, state.ctx as Readonly<C>));
        return { ctx: state.ctx, last: value };
      };
      return buildSeq([...steps, next]) as unknown as SeqBuilder<C, unknown>;
    }
  },
  then<A, E>(f: (last: Last) => Eff<A, E>) {
    const next: StepFn = async (state) => {
      const value = await resolveEff(f(state.last as Last));
      return { ctx: state.ctx, last: value };
    };
    return buildSeq<C, A>([...steps, next]);
  },
  tap<E>(f: (last: Last) => Eff<void, E>) {
    const next: StepFn = async (state) => {
      await resolveEff(f(state.last as Last));
      return state;
    };
    return buildSeq<C, Last>([...steps, next]);
  },
  do<E>(f: (last: Last, ctx: Readonly<C>) => Eff<void, E>) {
    const next: StepFn = async (state) => {
      await resolveEff(f(state.last as Last, state.ctx as Readonly<C>));
      return state;
    };
    return buildSeq<C, Last>([...steps, next]);
  },
  when<E>(
    predicate: (last: Last, ctx?: Readonly<C>) => boolean,
    thenBranch: (last: Last, ctx?: Readonly<C>) => Eff<void, E>,
  ) {
    const next: StepFn = async (state) => {
      if (predicate(state.last as Last, state.ctx as Readonly<C>)) {
        await resolveEff(thenBranch(state.last as Last, state.ctx as Readonly<C>));
      }
      return state;
    };
    return buildSeq<C, Last>([...steps, next]);
  },
  value() {
    return resolveEff(
      (async () => {
        const state = await runSteps(steps);
        return state.last as Last;
      })(),
    ) as unknown as Eff<Last, unknown>;
  },
  return<A, E>(f: (last: Last, ctx?: Readonly<C>) => Eff<A, E>) {
    return resolveEff(
      (async () => {
        const state = await runSteps(steps);
        return await resolveEff(f(state.last as Last, state.ctx as Readonly<C>));
      })(),
    ) as unknown as Eff<A, E>;
  },
});

export function seq() {
  return buildSeq<{}, void>([]);
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
  if (!handler) {
    const available = Object.keys(cases).join(", ");
    throw Error(
      `Non-exhaustive match for tag="${value.tag}"\n` +
        `Available cases: [${available}]\n` +
        `Hint: Add a case for "${value.tag}"`,
    );
  }
  return handler(value as Extract<T, { readonly tag: typeof value.tag }>);
};

type Fn<A, B> = (a: A) => B;

export function pipe<A>(value: A): A;
export function pipe<A, B>(value: A, fn1: Fn<A, B>): B;
export function pipe<A, B, C>(value: A, fn1: Fn<A, B>, fn2: Fn<B, C>): C;
export function pipe<A, B, C, D>(value: A, fn1: Fn<A, B>, fn2: Fn<B, C>, fn3: Fn<C, D>): D;
export function pipe<A, B, C, D, E>(
  value: A,
  fn1: Fn<A, B>,
  fn2: Fn<B, C>,
  fn3: Fn<C, D>,
  fn4: Fn<D, E>,
): E;
export function pipe<A, B, C, D, E, F>(
  value: A,
  fn1: Fn<A, B>,
  fn2: Fn<B, C>,
  fn3: Fn<C, D>,
  fn4: Fn<D, E>,
  fn5: Fn<E, F>,
): F;
export function pipe<A, B, C, D, E, F, G>(
  value: A,
  fn1: Fn<A, B>,
  fn2: Fn<B, C>,
  fn3: Fn<C, D>,
  fn4: Fn<D, E>,
  fn5: Fn<E, F>,
  fn6: Fn<F, G>,
): G;
export function pipe<A, B, C, D, E, F, G, H>(
  value: A,
  fn1: Fn<A, B>,
  fn2: Fn<B, C>,
  fn3: Fn<C, D>,
  fn4: Fn<D, E>,
  fn5: Fn<E, F>,
  fn6: Fn<F, G>,
  fn7: Fn<G, H>,
): H;
export function pipe<A, B, C, D, E, F, G, H, I>(
  value: A,
  fn1: Fn<A, B>,
  fn2: Fn<B, C>,
  fn3: Fn<C, D>,
  fn4: Fn<D, E>,
  fn5: Fn<E, F>,
  fn6: Fn<F, G>,
  fn7: Fn<G, H>,
  fn8: Fn<H, I>,
): I;
export function pipe<A, B, C, D, E, F, G, H, I, J>(
  value: A,
  fn1: Fn<A, B>,
  fn2: Fn<B, C>,
  fn3: Fn<C, D>,
  fn4: Fn<D, E>,
  fn5: Fn<E, F>,
  fn6: Fn<F, G>,
  fn7: Fn<G, H>,
  fn8: Fn<H, I>,
  fn9: Fn<I, J>,
): J;
export function pipe(value: unknown, ...fns: ReadonlyArray<Fn<unknown, unknown>>): unknown {
  return fns.reduce((acc, fn) => fn(acc), value);
}
