// typelang/interfaces.ts
// Interface-based effect system with compile-time effect tracking

/**
 * EffectInterface<Name> - Base interface for all effect interfaces.
 * Each effect interface has a unique name tag for runtime dispatch.
 */
export interface EffectInterface<Name extends string = string> {
  readonly _tag: Name;
  readonly _brand: unique symbol;
}

/**
 * InterfaceSpec<Name, Ops> - Complete interface specification with operations.
 *
 * @example
 * const HttpInterface: InterfaceSpec<"Http", {
 *   get: (url: string) => Promise<Response>;
 * }> = defineInterface("Http");
 */
export type InterfaceSpec<Name extends string, Ops> = EffectInterface<Name> & {
  readonly operations: Ops;
};

/**
 * defineInterface<Name, Ops> - Define a new effect interface.
 *
 * Returns an interface specification that can be used in Result effect types.
 * The interface includes a unique brand symbol for nominal typing.
 *
 * @example
 * const HttpInterface = defineInterface<"Http", {
 *   get: (url: string) => Promise<Response>;
 *   post: (url: string, body: unknown) => Promise<Response>;
 * }>("Http");
 *
 * type HttpInterface = typeof HttpInterface;
 *
 * // Use in function signatures
 * const fetchData = (url: string): Result<Data, Error, {
 *   http: HttpInterface
 * }> => {
 *   // implementation
 * }
 */
export const defineInterface = <Name extends string, Ops>(
  name: Name,
): InterfaceSpec<Name, Ops> => {
  const brand = Symbol(name);
  return {
    _tag: name,
    _brand: brand as any,
    operations: {} as Ops,
  } as InterfaceSpec<Name, Ops>;
};

/**
 * Capability<Name, Interface> - A capability record entry.
 * Maps a capability name to its interface specification.
 */
export type Capability<Name extends string, Interface extends EffectInterface> = Readonly<
  Record<Name, Interface>
>;

/**
 * Combine<E1, E2> - Combines two capability records via intersection.
 * Maintains record-based ergonomics with named properties.
 */
export type Combine<E1, E2> = E1 & E2;

/**
 * Pure - Empty effect set for pure computations.
 */
export type Pure = Record<never, never>;
