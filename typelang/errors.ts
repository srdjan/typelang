// typelang/errors.ts
// Standard error types and Result type utilities

export type ErrorTag<T extends string> = { readonly tag: T };

// Common error types
export type ValidationError = ErrorTag<"ValidationError"> & {
  readonly field: string;
  readonly message: string;
};

export type NotFoundError = ErrorTag<"NotFoundError"> & {
  readonly entity: string;
  readonly id: string;
};

export type UnauthorizedError = ErrorTag<"UnauthorizedError"> & {
  readonly reason: string;
};

export type ForbiddenError = ErrorTag<"ForbiddenError"> & {
  readonly reason: string;
};

export type ConflictError = ErrorTag<"ConflictError"> & {
  readonly field: string;
  readonly message: string;
};

// Result type with standard shape
export type Result<T, E = unknown> =
  | { readonly tag: "Ok"; readonly value: T }
  | { readonly tag: "Err"; readonly error: E };

// Constructors
export const ok = <T>(value: T): Result<T, never> => ({ tag: "Ok", value });

export const err = <E>(error: E): Result<never, E> => ({ tag: "Err", error });

// Type guards
export const isOk = <T, E>(result: Result<T, E>): result is Extract<Result<T, E>, { tag: "Ok" }> =>
  result.tag === "Ok";

export const isErr = <T, E>(
  result: Result<T, E>,
): result is Extract<Result<T, E>, { tag: "Err" }> => result.tag === "Err";

// Utilities
export const unwrap = <T, E>(result: Result<T, E>): T => {
  if (result.tag === "Ok") return result.value;
  throw new Error(`Called unwrap on Err: ${JSON.stringify(result.error)}`);
};

export const unwrapOr = <T, E>(result: Result<T, E>, defaultValue: T): T =>
  result.tag === "Ok" ? result.value : defaultValue;

export const mapResult = <T, U, E>(
  result: Result<T, E>,
  f: (value: T) => U,
): Result<U, E> => (result.tag === "Ok" ? ok(f(result.value)) : result);

export const mapError = <T, E, F>(
  result: Result<T, E>,
  f: (error: E) => F,
): Result<T, F> => (result.tag === "Err" ? err(f(result.error)) : result);

export const flatMapResult = <T, U, E>(
  result: Result<T, E>,
  f: (value: T) => Result<U, E>,
): Result<U, E> => (result.tag === "Ok" ? f(result.value) : result);

// Error constructors
export const validationError = (field: string, message: string): ValidationError => ({
  tag: "ValidationError",
  field,
  message,
});

export const notFoundError = (entity: string, id: string): NotFoundError => ({
  tag: "NotFoundError",
  entity,
  id,
});

export const unauthorizedError = (reason: string): UnauthorizedError => ({
  tag: "UnauthorizedError",
  reason,
});

export const forbiddenError = (reason: string): ForbiddenError => ({
  tag: "ForbiddenError",
  reason,
});

export const conflictError = (field: string, message: string): ConflictError => ({
  tag: "ConflictError",
  field,
  message,
});
