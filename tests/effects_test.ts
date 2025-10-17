import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { defineEffect, handlers, seq, stack } from "../typelang/mod.ts";
import { Console, Exception, State } from "../typelang/effects.ts";
import type { Handler } from "../typelang/runtime.ts";

Deno.test("custom effects compose with built-ins", async () => {
  const Custom = defineEffect<"Custom", { greet: (name: string) => string }>("Custom");

  const customHandler: Handler = {
    name: "Custom",
    handles: {
      greet: (instr) => {
        const [name] = instr.args;
        return `Hello, ${name}!`;
      },
    },
  };

  const result = await stack(
    customHandler,
    handlers.Exception.tryCatch(),
  ).run(() =>
    seq()
      .let(() => Custom.op.greet("World"))
      .value()
  ) as unknown;

  assertEquals(result, { tag: "Ok", value: "Hello, World!" });
});

Deno.test("handlers can intercept and transform operations", async () => {
  const captured: string[] = [];
  const interceptHandler: Handler = {
    name: "Console",
    handles: {
      log: (instr) => {
        const [msg] = instr.args;
        captured.push(`[INTERCEPTED] ${msg}`);
      },
    },
  };

  await stack(
    interceptHandler,
    handlers.Exception.tryCatch(),
  ).run(() =>
    seq()
      .do(() => Console.op.log("test"))
      .return(() => "ok")
  );

  assertEquals(captured, ["[INTERCEPTED] test"]);
});

Deno.test("state modifications are isolated per stack", async () => {
  const program = () =>
    seq()
      .tap(() => State.modify<{ count: number }>((s) => ({ count: s.count + 1 })))
      .let(() => State.get<{ count: number }>())
      .then((state) => state.count)
      .value();

  const result1 = await stack(
    handlers.State.with<{ count: number }>({ count: 0 }),
    handlers.Exception.tryCatch(),
  ).run(program) as unknown as { result: { tag: string; value: number }; state: { count: number } };

  const result2 = await stack(
    handlers.State.with<{ count: number }>({ count: 10 }),
    handlers.Exception.tryCatch(),
  ).run(program) as unknown as { result: { tag: string; value: number }; state: { count: number } };

  assertEquals(result1.state.count, 1);
  assertEquals(result2.state.count, 11);
});

Deno.test("exception handler short-circuits on fail", async () => {
  const result = await stack(
    handlers.Exception.tryCatch(),
  ).run(() =>
    seq()
      .let("a", () => "first")
      .tap(() => Exception.op.fail({ reason: "error" }))
      .let("b", () => "unreachable")
      .return((b, ctx) => `${ctx!.a}-${b}`)
  ) as unknown;

  assertEquals(result, { tag: "Err", error: { reason: "error" } });
});

Deno.test("console capture distinguishes log levels", async () => {
  const result = await stack(
    handlers.Console.capture(),
    handlers.Exception.tryCatch(),
  ).run(() =>
    seq()
      .do(() => Console.op.log("info message"))
      .do(() => Console.op.warn("warning message"))
      .do(() => Console.op.error("error message"))
      .return(() => "done")
  ) as unknown as {
    result: { tag: string };
    logs: readonly string[];
    warns: readonly string[];
    errors: readonly string[];
  };

  assertEquals(result.logs, ["info message"]);
  assertEquals(result.warns, ["warning message"]);
  assertEquals(result.errors, ["error message"]);
});
