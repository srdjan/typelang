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

/**
 * Result<T, E, Effects> - Result type with compile-time effect tracking.
 *
 * The Effects parameter is a phantom type (not present at runtime) that tracks
 * which effect interfaces this computation requires. It uses record-based
 * capabilities for ergonomic composition.
 *
 * @example
 * // Pure computation (no effects)
 * const validate = (email: string): Result<boolean, ValidationError> => {
 *   return isValidEmail(email) ? ok(true) : err(validationError("email", "Invalid format"));
 * }
 *
 * // Effectful computation
 * const fetchUser = (id: string): Result<User, HttpError, {
 *   http: HttpInterface
 * }> => {
 *   // implementation
 * }
 *
 * // Multiple effects
 * const registerUser = (data: UserData): Result<User, AppError, {
 *   http: HttpInterface;
 *   db: DbInterface;
 *   logger: ConsoleInterface;
 * }> => {
 *   // implementation
 * }
 */
export type Result<T, E = unknown, Effects = {}> =
  | { readonly tag: "Ok"; readonly value: T; readonly __effects?: () => Effects }
  | { readonly tag: "Err"; readonly error: E; readonly __effects?: () => Effects };

// Constructors
export const ok = <T, Effects = {}>(
  value: T,
): Result<T, never, Effects> => ({ tag: "Ok", value } as Result<T, never, Effects>);

export const err = <E, Effects = {}>(
  error: E,
): Result<never, E, Effects> => ({ tag: "Err", error } as Result<never, E, Effects>);

// Type guards
export const isOk = <T, E, Effects>(
  result: Result<T, E, Effects>,
): result is Extract<Result<T, E, Effects>, { tag: "Ok" }> => result.tag === "Ok";

export const isErr = <T, E, Effects>(
  result: Result<T, E, Effects>,
): result is Extract<Result<T, E, Effects>, { tag: "Err" }> => result.tag === "Err";

// Utilities
export const unwrap = <T, E, Effects>(result: Result<T, E, Effects>): T => {
  if (result.tag === "Ok") return result.value;
  throw new Error(`Called unwrap on Err: ${JSON.stringify(result.error)}`);
};

export const unwrapOr = <T, E, Effects>(result: Result<T, E, Effects>, defaultValue: T): T =>
  result.tag === "Ok" ? result.value : defaultValue;

export const mapResult = <T, U, E, Effects>(
  result: Result<T, E, Effects>,
  f: (value: T) => U,
): Result<
  U,
  E,
  Effects
> => (result.tag === "Ok" ? ok(f(result.value)) : result as Result<U, E, Effects>);

export const mapError = <T, E, F, Effects>(
  result: Result<T, E, Effects>,
  f: (error: E) => F,
): Result<
  T,
  F,
  Effects
> => (result.tag === "Err" ? err(f(result.error)) : result as Result<T, F, Effects>);

export const flatMapResult = <T, U, E, Effects1, Effects2>(
  result: Result<T, E, Effects1>,
  f: (value: T) => Result<U, E, Effects2>,
): Result<U, E, Effects1 & Effects2> =>
  (result.tag === "Ok" ? f(result.value) : result) as Result<U, E, Effects1 & Effects2>;

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
