// typelang/types.ts
// Core type definitions shared across the typelang runtime.

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

/**
 * UnwrapResult<T> - Extracts the value type from a Result type.
 */
export type UnwrapResult<T> = T extends { readonly tag: "Ok"; readonly value: infer V } ? V
  : T extends { readonly tag: "Err" } ? never
  : T;

/**
 * CancellationContext - Context provided to effect handlers for cancellation and cleanup.
 *
 * Handlers receive this context as a third parameter and can:
 * - Check `signal.aborted` to short-circuit work
 * - Pass `signal` to cancelable APIs (fetch, setTimeout, etc.)
 * - Register cleanup callbacks via `onCancel` for resource disposal
 *
 * @example
 * const handler: Handler = {
 *   name: "Http",
 *   handles: {
 *     get: (instr, next, ctx) => {
 *       const [url] = instr.args;
 *       ctx.onCancel(() => console.log("Request cancelled"));
 *       return fetch(url, { signal: ctx.signal });
 *     }
 *   }
 * };
 */
export type CancellationContext = Readonly<{
  readonly signal: AbortSignal;
  readonly onCancel: (cleanup: () => void | Promise<void>) => void;
}>;
