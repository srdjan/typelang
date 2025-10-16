import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pipe } from "../typelang/mod.ts";

Deno.test("pipe() with 2 functions", () => {
  const add1 = (x: number) => x + 1;
  const double = (x: number) => x * 2;

  const result = pipe(5, add1, double);

  assertEquals(result, 12); // (5 + 1) * 2 = 12
});

Deno.test("pipe() with 3 functions", () => {
  const add1 = (x: number) => x + 1;
  const double = (x: number) => x * 2;
  const toString = (x: number) => `Result: ${x}`;

  const result = pipe(5, add1, double, toString);

  assertEquals(result, "Result: 12");
});

Deno.test("pipe() with 4 functions", () => {
  const add1 = (x: number) => x + 1;
  const double = (x: number) => x * 2;
  const subtract3 = (x: number) => x - 3;
  const toString = (x: number) => `${x}`;

  const result = pipe(5, add1, double, subtract3, toString);

  assertEquals(result, "9"); // ((5 + 1) * 2) - 3 = 9
});

Deno.test("pipe() with string transformations", () => {
  const trim = (s: string) => s.trim();
  const upper = (s: string) => s.toUpperCase();
  const exclaim = (s: string) => `${s}!`;

  const result = pipe("  hello  ", trim, upper, exclaim);

  assertEquals(result, "HELLO!");
});

Deno.test("pipe() with array transformations", () => {
  const double = (arr: number[]) => arr.map((x) => x * 2);
  const filter = (arr: number[]) => arr.filter((x) => x > 5);
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

  const result = pipe([1, 2, 3, 4, 5], double, filter, sum);

  assertEquals(result, 24); // [2,4,6,8,10] -> [6,8,10] -> 24
});

Deno.test("pipe() with object transformations", () => {
  type User = { name: string; age: number };
  type UserWithEmail = User & { email: string };
  type UserSummary = { summary: string };

  const addEmail = (u: User): UserWithEmail => ({
    ...u,
    email: `${u.name.toLowerCase()}@example.com`,
  });
  const summarize = (u: UserWithEmail): UserSummary => ({
    summary: `${u.name} (${u.age}) - ${u.email}`,
  });

  const result = pipe(
    { name: "Alice", age: 30 },
    addEmail,
    summarize,
  );

  assertEquals(result, { summary: "Alice (30) - alice@example.com" });
});

Deno.test("pipe() preserves types through chain", () => {
  const parseNum = (s: string): number => parseInt(s, 10);
  const isEven = (n: number): boolean => n % 2 === 0;
  const toString = (b: boolean): string => b ? "even" : "odd";

  const result: string = pipe("42", parseNum, isEven, toString);

  assertEquals(result, "even");
});

Deno.test("pipe() with single function", () => {
  const double = (x: number) => x * 2;

  const result = pipe(5, double);

  assertEquals(result, 10);
});

Deno.test("pipe() with identity-like transformations", () => {
  const identity = <T>(x: T): T => x;
  const result = pipe(42, identity, identity, identity);

  assertEquals(result, 42);
});

Deno.test("pipe() with complex data flow", () => {
  type Input = { value: string };
  type Parsed = { num: number };
  type Validated = { num: number; valid: boolean };
  type Output = { result: string };

  const parse = (input: Input): Parsed => ({ num: parseInt(input.value, 10) });
  const validate = (parsed: Parsed): Validated => ({
    num: parsed.num,
    valid: !isNaN(parsed.num) && parsed.num > 0,
  });
  const format = (validated: Validated): Output => ({
    result: validated.valid ? `Valid: ${validated.num}` : "Invalid",
  });

  const result = pipe({ value: "123" }, parse, validate, format);

  assertEquals(result, { result: "Valid: 123" });
});
