// typelang/types.ts
// Core type definitions shared across the typelang runtime.

export type Eff<A, E> = A & { readonly __eff?: (e: E) => E };
export type Pure<A> = Eff<A, {}>;
export type Combine<E1, E2> = E1 & E2;

export type Capability<Name extends string, Spec> = Readonly<Record<Name, Spec>>;

export type Instr<Name extends string, K extends string, R, Args extends readonly unknown[]> = {
  readonly _tag: Name;
  readonly kind: K;
  readonly args: Args;
  // Phantom return type marker for type inference only.
  readonly __ret?: R;
};

export type AnyInstr = Instr<string, string, unknown, readonly unknown[]>;

export type AwaitedReturn<T> = T extends PromiseLike<infer P> ? AwaitedReturn<P> : T;
