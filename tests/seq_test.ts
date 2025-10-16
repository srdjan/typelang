import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handlers, seq, stack } from "../typelang/mod.ts";
import { Console } from "../typelang/effects.ts";

Deno.test("seq.when executes branch when predicate is true", async () => {
  const logs: string[] = [];
  const customHandler = {
    name: "Console",
    handles: {
      log: (instr: { args: readonly unknown[] }) => {
        logs.push(String(instr.args[0]));
      },
    },
  };

  await stack(customHandler, handlers.Exception.tryCatch()).run(() =>
    seq()
      .let("value", () => 10)
      .when(({ value }) => value > 5, ({ value }) => Console.op.log(`Value ${value} is large`))
      .return(() => "done")
  );

  assertEquals(logs, ["Value 10 is large"]);
});

Deno.test("seq.when skips branch when predicate is false", async () => {
  const logs: string[] = [];
  const customHandler = {
    name: "Console",
    handles: {
      log: (instr: { args: readonly unknown[] }) => {
        logs.push(String(instr.args[0]));
      },
    },
  };

  await stack(customHandler, handlers.Exception.tryCatch()).run(() =>
    seq()
      .let("value", () => 3)
      .when(({ value }) => value > 5, ({ value }) => Console.op.log(`Value ${value} is large`))
      .return(() => "done")
  );

  assertEquals(logs, []);
});

Deno.test("seq.when preserves context", async () => {
  const customHandler = {
    name: "Console",
    handles: {
      log: () => {}, // No-op
    },
  };

  const result = await stack(customHandler, handlers.Exception.tryCatch()).run(() =>
    seq()
      .let("a", () => 1)
      .let("b", () => 2)
      .when(({ a }) => a > 0, () => Console.op.log("positive"))
      .let("c", ({ a, b }) => a + b)
      .return(({ a, b, c }) => ({ a, b, c }))
  ) as unknown;

  const expected = { tag: "Ok", value: { a: 1, b: 2, c: 3 } };
  assertEquals(result, expected);
});
