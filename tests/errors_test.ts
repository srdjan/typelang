import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  conflictError,
  err,
  flatMapResult,
  forbiddenError,
  isErr,
  isOk,
  mapError,
  mapResult,
  notFoundError,
  ok,
  unauthorizedError,
  unwrap,
  unwrapOr,
  validationError,
} from "../typelang/errors.ts";

Deno.test("ok creates successful result", () => {
  const result = ok(42);
  assertEquals(result, { tag: "Ok", value: 42 });
});

Deno.test("err creates error result", () => {
  const result = err("failure");
  assertEquals(result, { tag: "Err", error: "failure" });
});

Deno.test("isOk type guard works", () => {
  const result = ok(42);
  if (isOk(result)) {
    assertEquals(result.value, 42);
  }
});

Deno.test("isErr type guard works", () => {
  const result = err("failure");
  if (isErr(result)) {
    assertEquals(result.error, "failure");
  }
});

Deno.test("unwrap returns value for Ok", () => {
  const result = ok(42);
  assertEquals(unwrap(result), 42);
});

Deno.test("unwrap throws for Err", () => {
  const result = err("failure");
  let threw = false;
  try {
    unwrap(result);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test("unwrapOr returns value for Ok", () => {
  const result = ok(42);
  assertEquals(unwrapOr(result, 0), 42);
});

Deno.test("unwrapOr returns default for Err", () => {
  const result = err("failure");
  assertEquals(unwrapOr(result, 0), 0);
});

Deno.test("mapResult transforms Ok value", () => {
  const result = ok(21);
  const mapped = mapResult(result, (x) => x * 2);
  assertEquals(mapped, { tag: "Ok", value: 42 });
});

Deno.test("mapResult preserves Err", () => {
  const result = err("failure");
  const mapped = mapResult(result, (x: number) => x * 2);
  assertEquals(mapped, { tag: "Err", error: "failure" });
});

Deno.test("mapError transforms Err value", () => {
  const result = err("failure");
  const mapped = mapError(result, (e) => `Error: ${e}`);
  assertEquals(mapped, { tag: "Err", error: "Error: failure" });
});

Deno.test("mapError preserves Ok", () => {
  const result = ok(42);
  const mapped = mapError(result, (e: string) => `Error: ${e}`);
  assertEquals(mapped, { tag: "Ok", value: 42 });
});

Deno.test("flatMapResult chains Ok results", () => {
  const result = ok(21);
  const chained = flatMapResult(result, (x) => ok(x * 2));
  assertEquals(chained, { tag: "Ok", value: 42 });
});

Deno.test("flatMapResult propagates Err in input", () => {
  const result = err("failure");
  const chained = flatMapResult(result, (x: number) => ok(x * 2));
  assertEquals(chained, { tag: "Err", error: "failure" });
});

Deno.test("flatMapResult propagates Err in mapper", () => {
  const result = ok(21);
  const chained = flatMapResult(result, () => err("inner failure"));
  assertEquals(chained, { tag: "Err", error: "inner failure" });
});

Deno.test("validationError creates proper shape", () => {
  const error = validationError("email", "Invalid email format");
  assertEquals(error, {
    tag: "ValidationError",
    field: "email",
    message: "Invalid email format",
  });
});

Deno.test("notFoundError creates proper shape", () => {
  const error = notFoundError("User", "123");
  assertEquals(error, {
    tag: "NotFoundError",
    entity: "User",
    id: "123",
  });
});

Deno.test("unauthorizedError creates proper shape", () => {
  const error = unauthorizedError("Invalid token");
  assertEquals(error, {
    tag: "UnauthorizedError",
    reason: "Invalid token",
  });
});

Deno.test("forbiddenError creates proper shape", () => {
  const error = forbiddenError("Insufficient permissions");
  assertEquals(error, {
    tag: "ForbiddenError",
    reason: "Insufficient permissions",
  });
});

Deno.test("conflictError creates proper shape", () => {
  const error = conflictError("email", "Email already exists");
  assertEquals(error, {
    tag: "ConflictError",
    field: "email",
    message: "Email already exists",
  });
});
