import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handlers, ok, par, seq, stack } from "./mod.ts";
import { Console, Exception, State } from "./effects.ts";

type Result<T, E = unknown> = { readonly tag: "Ok"; readonly value: T } | {
  readonly tag: "Err";
  readonly error: E;
};
type Captured<T, E = unknown> = {
  readonly result: Result<T, E>;
  readonly logs: readonly string[];
  readonly warns: readonly string[];
  readonly errors: readonly string[];
};
type WithState<T, S> = { readonly result: Result<T>; readonly state: S };

Deno.test("console capture collects logs and wraps result", async () => {
  const outcome = await stack(
    handlers.Console.capture(),
    handlers.Exception.tryCatch(),
  ).run(() =>
    seq()
      .do(() => Console.log("hello"))
      .do(() => Console.error("warned"))
      .return(() => ok("ok"))
  ) as unknown as Captured<string>;

  assertEquals(outcome.logs, ["hello"]);
  assertEquals(outcome.warns, []);
  assertEquals(outcome.errors, ["warned"]);
  if (outcome.result.tag !== "Ok") {
    throw new Error("expected Ok result");
  }
  assertEquals(outcome.result.value, "ok");
});

Deno.test("exception handler captures failures", async () => {
  const outcome = await stack(
    handlers.Exception.tryCatch(),
  ).run(() =>
    seq()
      .do(() => Exception.fail({ reason: "boom" }))
      .return(() => ok("unreachable"))
  ) as unknown as Result<string, { reason: string }>;

  assertEquals(outcome, { tag: "Err", error: { reason: "boom" } });
});

Deno.test("state handler tracks mutations immutably", async () => {
  const outcome = await stack(
    handlers.State.with<{ count: number }>({ count: 0 }),
    handlers.Exception.tryCatch(),
  ).run(() =>
    seq()
      .tap(() => State.modify<{ count: number }>((s) => ({ count: s.count + 1 })))
      .let(() => State.get<{ count: number }>())
      .then((state) => ok(state.count))
      .value()
  ) as unknown as WithState<number, { count: number }>;

  assertEquals(outcome.state.count, 1);
  if (outcome.result.tag !== "Ok") {
    throw new Error("expected Ok state");
  }
  assertEquals(outcome.result.value, 1);
});

Deno.test("par helpers compose results", async () => {
  const outcome = await stack(
    handlers.Console.capture(),
    handlers.Exception.tryCatch(),
  ).run(() =>
    par.all({
      a: () => seq().return(() => ok(1)),
      b: () => seq().return(() => ok(2)),
    })
  ) as unknown as Captured<{ readonly a: number; readonly b: number }>;

  assertEquals(outcome.logs, []);
  if (outcome.result.tag !== "Ok") {
    throw new Error("expected Ok par result");
  }
  assertEquals(outcome.result.value, { a: 1, b: 2 });
});

Deno.test("par.map resolves concurrent tasks", async () => {
  const outcome = await stack(
    handlers.Exception.tryCatch(),
  ).run(() =>
    par.map([1, 2, 3] as const, (n) => seq().return(() => ok(n * 2)))
  ) as unknown as Result<
    readonly number[]
  >;

  if (outcome.tag !== "Ok") {
    throw new Error("expected Ok par map result");
  }
  assertEquals(outcome.value, [2, 4, 6]);
});

Deno.test("par.race returns first completed task", async () => {
  const outcome = await stack(
    handlers.Exception.tryCatch(),
  ).run(() =>
    par.race([
      () => seq().return(() => ok("fast")),
      () => seq().return(() => ok("slow")),
    ])
  ) as unknown as Result<string>;

  if (outcome.tag !== "Ok") {
    throw new Error("expected Ok par race result");
  }
  // Since both complete immediately, either could win, but typically the first one
  assertEquals(typeof outcome.value, "string");
  assertEquals(["fast", "slow"].includes(outcome.value), true);
});
