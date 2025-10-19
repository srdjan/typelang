// typelang/types.ts
// Core type definitions shared across the typelang runtime.

/**
 * Eff<A, Caps> - An effectful computation that produces a value of type A
 * and requires capabilities Caps to execute.
 *
 * The Caps parameter should be a record type for best ergonomics:
 *
 * @example
 * // Single capability
 * type GetUser = Eff<User, { http: Http }>;
 *
 * // Multiple capabilities - order-independent, self-documenting
 * type RegisterUser = Eff<Result<User, string>, {
 *   http: Http;
 *   db: Db;
 *   logger: Logger;
 * }>;
 *
 * Benefits:
 * - Order-independent destructuring (named properties prevent mistakes)
 * - Self-documenting signatures (capabilities visible at a glance)
 * - No combinatorial type explosion (no need for HttpAndDb, HttpDbAndLogger, etc.)
 * - Type-safe capability threading (compiler ensures all required caps are provided)
 */
export type Eff<A, Caps> = A & { readonly __eff?: (e: Caps) => Caps };

/**
 * Pure<A> - A pure computation that produces a value of type A with no effects.
 */
export type Pure<A> = Eff<A, {}>;

/**
 * Combine<E1, E2> - Combines two capability sets via intersection.
 * Prefer using record types directly for better ergonomics.
 */
export type Combine<E1, E2> = E1 & E2;

/**
 * Capability<Name, Spec> - A capability with a given name and specification.
 * Returns a record type { readonly [Name]: Spec }
 */
export type Capability<Name extends string, Spec> = Readonly<Record<Name, Spec>>;

/**
 * Instr<Name, K, R, Args> - An effect instruction representing an operation
 * to be interpreted by a handler.
 */
export type Instr<Name extends string, K extends string, R, Args extends readonly unknown[]> = {
  readonly _tag: Name;
  readonly kind: K;
  readonly args: Args;
  // Phantom return type marker for type inference only.
  readonly __ret?: R;
};

export type AnyInstr = Instr<string, string, unknown, readonly unknown[]>;

/**
 * AwaitedReturn<T> - Recursively unwraps Promise types to get the final return type.
 */
export type AwaitedReturn<T> = T extends PromiseLike<infer P> ? AwaitedReturn<P> : T;
