import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handlers, seq, stack } from "../typelang/mod.ts";
import { Console } from "../typelang/effects.ts";

Deno.test("seq.when executes branch when predicate is true", async () => {
  const logs: string[] = [];
  const customHandler = {
    name: "Console",
    handles: {
      log: (instr: { args: readonly unknown[] }, next: unknown, ctx: unknown) => {
        logs.push(String(instr.args[0]));
      },
    },
  };

  await stack(customHandler, handlers.Exception.tryCatch()).run(() =>
    seq()
      .let(() => 10)
      .when((last, ctx) => (ctx!["v1"] as number) > 5, (last, ctx) =>
        Console.op.log(`Value ${(ctx!["v1"] as number)} is large`))
      .return(() =>
        "done"
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
      },
    },
  };

  await stack(customHandler, handlers.Exception.tryCatch()).run(() =>
    seq()
      .let(() => 3)
      .when((last, ctx) => (ctx!["v1"] as number) > 5, (last, ctx) =>
        Console.op.log(`Value ${(ctx!["v1"] as number)} is large`))
      .return(() =>
        "done"
      )
  );

  assertEquals(logs, []);
});

Deno.test("seq.when preserves context", async () => {
  const customHandler = {
    name: "Console",
    handles: {
      log: (instr: unknown, next: unknown, ctx: unknown) => {}, // No-op
    },
  };

  const result = await stack(customHandler, handlers.Exception.tryCatch()).run(() =>
    seq()
      .let(() => 1)
      .let(() => 2)
      .when((last, ctx) => (ctx!["v1"] as number) > 0, () => Console.op.log("positive"))
      .let((last, ctx) => (ctx!["v1"] as number) + (ctx!["v2"] as number))
      .return((last, ctx) => ({ a: ctx!["v1"], b: ctx!["v2"], c: ctx!["v3"] }))
  ) as unknown;

  const expected = { tag: "Ok", value: { a: 1, b: 2, c: 3 } };
  assertEquals(result, expected);
});
