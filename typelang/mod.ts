// typelang/mod.ts
// Public surface: types, effect interfaces, sequential/parallel combinators, and helpers.
//
// BEST PRACTICE: Use record-based effect types in Result signatures:
//
//   ✅ Good: Result<User, Error, { http: HttpInterface; db: DbInterface; logger: ConsoleInterface }>
//   ❌ Avoid: Result<User, Error, HttpEffects & DbEffects & LoggerEffects>
//
// Benefits of record-based effects:
// - Order-independent destructuring (named properties prevent mistakes)
// - Self-documenting signatures (effects visible at a glance)
// - No combinatorial type explosion (no need for composite types)
// - Type-safe effect threading (compiler ensures all required effects are provided)

import {
  getCurrentScopeController,
  Handler,
  handlers as builtInHandlers,
  resolveEff,
  resolveResult,
  stack,
  withController,
} from "./runtime.ts";
import { AwaitedReturn, Instr, UnwrapResult } from "./types.ts";
import {
  type Capability,
  type Combine,
  defineInterface,
  type EffectInterface,
  type InterfaceSpec,
  type Pure,
} from "./interfaces.ts";
import { err, isErr, isOk, ok, type Result } from "./errors.ts";
import { defineResource as defineResourceDescriptor, use as useResources } from "./resource.ts";
import type { ResourceBlueprint, ResourceDescriptor, ResourceValues } from "./resource.ts";

// Re-export core types
export type { Capability, Combine, EffectInterface, InterfaceSpec, Pure, Result };
export { err, isErr, isOk, ok };
export { defineInterface };
export { builtInHandlers as handlers, resolveEff, resolveResult, stack };
export type { Handler };
export { defineResourceDescriptor as defineResource, useResources as use };
export type { ResourceBlueprint, ResourceDescriptor, ResourceValues };

// Sequential builder --------------------------------------------------------

type Ctx = Readonly<Record<string, unknown>>;
type StepResult = Readonly<{ ctx: Record<string, unknown>; last: unknown }>;
type StepFn = (state: StepResult) => Promise<StepResult>;

type SeqBuilder<C, Last> = {
  // Anonymous .let() - stores value in context under an auto-generated key (v1, v2, ...),
  // and also sets it as the new "last" value
  // BEST PRACTICE: Use named .let("key", fn) for values you'll reference later
  let<A, E, Effects>(
    f: (last: Last, ctx?: Readonly<C>) => Result<A, E, Effects>,
  ): SeqBuilder<C & Readonly<Record<string, A>>, A>;
  // Named .let() - stores in context under provided key AND as "last"
  // RECOMMENDED: Use this for values you'll need in later steps
  let<K extends string, A, E, Effects>(
    key: K,
    f: (last: Last, ctx?: Readonly<C>) => Result<A, E, Effects>,
  ): SeqBuilder<C & Readonly<Record<K, A>>, A>;
  // Chain last value (like Promise.then)
  then<A, E, Effects>(f: (last: Last) => Result<A, E, Effects>): SeqBuilder<C, A>;
  // Side effect with last value only
  tap<E, Effects>(f: (last: Last) => Result<void, E, Effects>): SeqBuilder<C, Last>;
  // Side effect with typed context (no last parameter)
  // Use when you need named bindings from context
  tapWith<E, Effects>(f: (ctx: Readonly<C>) => Result<void, E, Effects>): SeqBuilder<C, Last>;
  // Side effect with last + context
  do<E, Effects>(
    f: (last: Last, ctx: Readonly<C>) => Result<void, E, Effects>,
  ): SeqBuilder<C, Last>;
  // Conditional execution
  when<E, Effects>(
    predicate: (last: Last, ctx?: Readonly<C>) => boolean,
    thenBranch: (last: Last, ctx?: Readonly<C>) => Result<void, E, Effects>,
  ): SeqBuilder<C, Last>;
  // Return last value directly
  value(): Result<Last, unknown, unknown>;
  // Return transformed value from last + optional context
  return<A, E, Effects>(
    f: (last: Last, ctx?: Readonly<C>) => Result<A, E, Effects>,
  ): Result<A, E, Effects>;
  // Return transformed value from typed context (no last parameter)
  // Use when you've named all values you need in context
  returnWith<A, E, Effects>(
    f: (ctx: Readonly<C>) => Result<A, E, Effects>,
  ): Result<A, E, Effects>;
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
      // Anonymous: .let(fn) with auto-generated context key (v1, v2, ...)
      const f = args[0] as (last: Last, ctx?: Readonly<C>) => unknown;
      const next: StepFn = async (state) => {
        const value = await resolveEff(f(state.last as Last, state.ctx as Readonly<C>));
        // Generate next available key v1, v2, ... that does not collide with existing keys
        let index = Object.keys(state.ctx).length + 1;
        let key = `v${index}`;
        while (Object.prototype.hasOwnProperty.call(state.ctx, key)) {
          index++;
          key = `v${index}`;
        }
        return { ctx: freeze({ ...state.ctx, [key]: value }), last: value };
      };
      return buildSeq([...steps, next]) as unknown as SeqBuilder<
        C & Readonly<Record<string, unknown>>,
        unknown
      >;
    }
  },
  then<A, E, Effects>(f: (last: Last) => Result<A, E, Effects>) {
    const next: StepFn = async (state) => {
      const value = await resolveEff(f(state.last as Last));
      return { ctx: state.ctx, last: value };
    };
    return buildSeq<C, A>([...steps, next]);
  },
  tap<E, Effects>(f: (last: Last) => Result<void, E, Effects>) {
    const next: StepFn = async (state) => {
      await resolveEff(f(state.last as Last));
      return state;
    };
    return buildSeq<C, Last>([...steps, next]);
  },
  tapWith<E, Effects>(f: (ctx: Readonly<C>) => Result<void, E, Effects>) {
    const next: StepFn = async (state) => {
      await resolveEff(f(state.ctx as Readonly<C>));
      return state;
    };
    return buildSeq<C, Last>([...steps, next]);
  },
  do<E, Effects>(f: (last: Last, ctx: Readonly<C>) => Result<void, E, Effects>) {
    const next: StepFn = async (state) => {
      await resolveEff(f(state.last as Last, state.ctx as Readonly<C>));
      return state;
    };
    return buildSeq<C, Last>([...steps, next]);
  },
  when<E, Effects>(
    predicate: (last: Last, ctx?: Readonly<C>) => boolean,
    thenBranch: (last: Last, ctx?: Readonly<C>) => Result<void, E, Effects>,
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
    return ok(resolveEff(
      (async () => {
        const state = await runSteps(steps);
        return state.last as Last;
      })(),
    )) as unknown as Result<Last, unknown, unknown>;
  },
  return<A, E, Effects>(f: (last: Last, ctx?: Readonly<C>) => Result<A, E, Effects>) {
    return ok(resolveEff(
      (async () => {
        const state = await runSteps(steps);
        return await resolveEff(f(state.last as Last, state.ctx as Readonly<C>));
      })(),
    )) as unknown as Result<A, E, Effects>;
  },
  returnWith<A, E, Effects>(f: (ctx: Readonly<C>) => Result<A, E, Effects>) {
    return ok(resolveEff(
      (async () => {
        const state = await runSteps(steps);
        return await resolveEff(f(state.ctx as Readonly<C>));
      })(),
    )) as unknown as Result<A, E, Effects>;
  },
});

export function seq() {
  return buildSeq<{}, void>([]);
}

// Legacy effect helper ------------------------------------------------------

type EffectOperations<Name extends string, Ops> = {
  [K in keyof Ops]: Ops[K] extends (...args: infer A) => infer R ? (...args: A) => Result<
      AwaitedReturn<R>,
      never,
      Pure
    >
    : never;
};

export const defineEffect = <Name extends string, Ops>(
  name: Name,
): Readonly<{ spec: InterfaceSpec<Name, Ops>; op: EffectOperations<Name, Ops> }> => {
  const spec = defineInterface<Name, Ops>(name);
  const op = new Proxy(
    {},
    {
      get(_target, key) {
        if (typeof key !== "string") return undefined;
        return (...args: readonly unknown[]) => {
          const instr: Instr<Name, typeof key, unknown, readonly unknown[]> = {
            _tag: name,
            kind: key,
            args,
          };
          return ok(instr as unknown);
        };
      },
    },
  ) as EffectOperations<Name, Ops>;
  return { spec, op };
};

// Parallel helpers ----------------------------------------------------------

export const par = {
  all<
    T extends Record<
      string,
      () => Result<unknown, unknown, unknown> | Promise<Result<unknown, unknown, unknown>>
    >,
  >(
    tasks: T,
  ) {
    const entries = Object.entries(tasks) as readonly [
      string,
      () => Result<unknown, unknown, unknown> | Promise<Result<unknown, unknown, unknown>>,
    ][];
    return ok(resolveEff(
      (async () => {
        const parentController = getCurrentScopeController();

        // Create per-branch controllers
        const branchControllers = entries.map(() => {
          const controller = new AbortController();
          // Link to parent for propagation
          if (parentController) {
            parentController.signal.addEventListener("abort", () => {
              controller.abort();
            });
          }
          return controller;
        });

        try {
          // Run all branches with their own controllers
          const results = await Promise.all(
            entries.map(([_, task], index) =>
              withController(branchControllers[index], async () => await resolveEff(task()))
            ),
          );

          return Object.freeze(
            Object.fromEntries(entries.map(([key], index) => [key, results[index]])),
          );
        } catch (error) {
          // On failure, abort all branches
          branchControllers.forEach((controller) => controller.abort());
          throw error;
        }
      })(),
    )) as unknown as Result<
      { readonly [K in keyof T]: UnwrapResult<AwaitedReturn<ReturnType<T[K]>>> },
      unknown,
      unknown
    >;
  },
  map<T, U, E, Effects>(
    xs: readonly T[],
    f: (value: T) => Result<U, E, Effects> | Promise<Result<U, E, Effects>>,
  ) {
    return ok(resolveEff(
      (async () => {
        const parentController = getCurrentScopeController();

        // Create per-item controllers
        const itemControllers = xs.map(() => {
          const controller = new AbortController();
          // Link to parent for propagation
          if (parentController) {
            parentController.signal.addEventListener("abort", () => {
              controller.abort();
            });
          }
          return controller;
        });

        try {
          // Run all items with their own controllers
          const results = await Promise.all(
            xs.map((x, index) =>
              withController(itemControllers[index], async () => await resolveEff(f(x)))
            ),
          );

          return results;
        } catch (error) {
          // On failure, abort all items
          itemControllers.forEach((controller) => controller.abort());
          throw error;
        }
      })(),
    )) as unknown as Result<readonly AwaitedReturn<U>[], E, Effects>;
  },
  race<T, E, Effects>(
    thunks: readonly (() => Result<T, E, Effects> | Promise<Result<T, E, Effects>>)[],
  ) {
    return ok(resolveEff(
      (async () => {
        const parentController = getCurrentScopeController();

        // Create per-branch controllers
        const branchControllers = thunks.map(() => {
          const controller = new AbortController();
          // Link to parent for propagation
          if (parentController) {
            parentController.signal.addEventListener("abort", () => {
              controller.abort();
            });
          }
          return controller;
        });

        // Run all branches with their own controllers
        const branchPromises = thunks.map(async (thunk, index) =>
          withController(branchControllers[index], async () => {
            const result = await resolveEff(thunk());
            return { index, result } as const;
          })
        );

        const winner = await Promise.race(branchPromises);

        // Abort losing branches - withController ensures only losers run cleanup
        branchControllers.forEach((controller, i) => {
          if (i !== winner.index) {
            controller.abort();
          }
        });

        return winner.result;
      })(),
    )) as unknown as Result<AwaitedReturn<T>, E, Effects>;
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
