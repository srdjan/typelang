import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handlers, ok, seq, stack } from "../typelang/mod.ts";
import { Console } from "../typelang/effects.ts";

Deno.test("seq.when executes branch when predicate is true", async () => {
  const logs: string[] = [];
  const customHandler = {
    name: "Console",
    handles: {
      log: (instr: { args: readonly unknown[] }, next: unknown, ctx: unknown) => {
        logs.push(String(instr.args[0]));
        return ok(undefined);
      },
    },
  };

  await stack(customHandler, handlers.Exception.tryCatch()).run(() =>
    seq()
      .let(() => ok(10))
      .when((last, ctx) => (ctx!["v1"] as number) > 5, (last, ctx) =>
        Console.log(`Value ${(ctx!["v1"] as number)} is large`))
      .return(() =>
        ok("done")
      )
  );

  assertEquals(logs, ["Value 10 is large"]);
});

Deno.test("seq.when skips branch when predicate is false", async () => {
  const logs: string[] = [];
  const customHandler = {
    name: "Console",
    handles: {
      log: (instr: { args: readonly unknown[] }, next: unknown, ctx: unknown) => {
        logs.push(String(instr.args[0]));
        return ok(undefined);
      },
    },
  };

  await stack(customHandler, handlers.Exception.tryCatch()).run(() =>
    seq()
      .let(() => ok(3))
      .when((last, ctx) => (ctx!["v1"] as number) > 5, (last, ctx) =>
        Console.log(`Value ${(ctx!["v1"] as number)} is large`))
      .return(() =>
        ok("done")
      )
  );

  assertEquals(logs, []);
});

Deno.test("seq.when preserves context", async () => {
  const customHandler = {
    name: "Console",
    handles: {
      log: (instr: unknown, next: unknown, ctx: unknown) => ok(undefined), // No-op
    },
  };

  const result = await stack(customHandler, handlers.Exception.tryCatch()).run(() =>
    seq()
      .let(() => ok(1))
      .let(() => ok(2))
      .when((last, ctx) => (ctx!["v1"] as number) > 0, () => Console.log("positive"))
      .let((last, ctx) => ok((ctx!["v1"] as number) + (ctx!["v2"] as number)))
      .return((last, ctx) => ok({ a: ctx!["v1"], b: ctx!["v2"], c: ctx!["v3"] }))
  ) as unknown;

  const expected = { tag: "Ok", value: { a: 1, b: 2, c: 3 } };
  assertEquals(result, expected);
});

Deno.test("seq.tapWith receives typed context object", async () => {
  const logs: string[] = [];
  const customHandler = {
    name: "Console",
    handles: {
      log: (instr: { args: readonly unknown[] }, next: unknown, ctx: unknown) => {
        logs.push(String(instr.args[0]));
        return ok(undefined);
      },
    },
  };

  await stack(customHandler, handlers.Exception.tryCatch()).run(() =>
    seq()
      .let("x", () => ok(10))
      .let("y", () => ok(20))
      .tapWith((ctx) => Console.log(`x=${ctx!["x"]}, y=${ctx!["y"]}`))
      .return(() => ok("done"))
  );

  assertEquals(logs, ["x=10, y=20"]);
});

Deno.test("seq.returnWith receives typed context object", async () => {
  const result = await stack(handlers.Exception.tryCatch()).run(() =>
    seq()
      .let("a", () => ok(1))
      .let("b", () => ok(2))
      .let("c", () => ok(3))
      .returnWith((ctx) =>
        ok({
          a: ctx!["a"],
          b: ctx!["b"],
          c: ctx!["c"],
          sum: (ctx!["a"] as number) + (ctx!["b"] as number) + (ctx!["c"] as number),
        })
      )
  ) as unknown;

  const expected = { tag: "Ok", value: { a: 1, b: 2, c: 3, sum: 6 } };
  assertEquals(result, expected);
});

Deno.test("seq.tapWith does not require last parameter", async () => {
  const logs: string[] = [];
  const customHandler = {
    name: "Console",
    handles: {
      log: (instr: { args: readonly unknown[] }, next: unknown, ctx: unknown) => {
        logs.push(String(instr.args[0]));
        return ok(undefined);
      },
    },
  };

  await stack(customHandler, handlers.Exception.tryCatch()).run(() =>
    seq()
      .let("user", () => ok({ id: 1, name: "Alice" }))
      .then((user) => ok(user.id))
      .tapWith((ctx) => Console.log(`User: ${(ctx!["user"] as { name: string }).name}`))
      .return((id) => ok(id))
  );

  assertEquals(logs, ["User: Alice"]);
});

Deno.test("seq named keys with tapWith and returnWith", async () => {
  const logs: string[] = [];
  const customHandler = {
    name: "Console",
    handles: {
      log: (instr: { args: readonly unknown[] }, next: unknown, ctx: unknown) => {
        logs.push(String(instr.args[0]));
        return ok(undefined);
      },
    },
  };

  const result = await stack(customHandler, handlers.Exception.tryCatch()).run(() =>
    seq()
      .let("step1", () => ok("first"))
      .let("step2", () => ok("second"))
      .let("step3", () => ok("third"))
      .tapWith(({ step1, step2, step3 }) => Console.log(`Steps: ${step1}, ${step2}, ${step3}`))
      .returnWith(({ step1, step2, step3 }) =>
        ok({ step1, step2, step3, combined: `${step1}-${step2}-${step3}` })
      )
  ) as unknown;

  assertEquals(logs, ["Steps: first, second, third"]);
  const expected = {
    tag: "Ok",
    value: {
      step1: "first",
      step2: "second",
      step3: "third",
      combined: "first-second-third",
    },
  };
  assertEquals(result, expected);
});
