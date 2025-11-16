import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { defineInterface, handlers, ok, seq, stack } from "../typelang/mod.ts";
import { Console, Exception, State } from "../typelang/effects.ts";
import type { Handler } from "../typelang/runtime.ts";
import type { Result } from "../typelang/errors.ts";
import type { Instr } from "../typelang/types.ts";

Deno.test("custom effects compose with built-ins", async () => {
  const CustomInterface = defineInterface<"Custom", { greet: (name: string) => string }>("Custom");

  const createCustomOp = (
    name: string,
  ): Result<string, never, { custom: typeof CustomInterface }> => {
    const instr: Instr<"Custom", "greet", string, [string]> = {
      _tag: "Custom",
      kind: "greet",
      args: [name],
    };
    return ok(instr as unknown as string);
  };

  const customHandler: Handler = {
    name: "Custom",
    handles: {
      greet: (instr, next, ctx) => {
        const [name] = instr.args;
        return ok(`Hello, ${name}!`);
      },
    },
  };

  const result = await stack(
    customHandler,
    handlers.Exception.tryCatch(),
  ).run(() =>
    seq()
      .let(() => createCustomOp("World"))
      .value()
  ) as unknown;

  assertEquals(result, { tag: "Ok", value: "Hello, World!" });
});

Deno.test("handlers can intercept and transform operations", async () => {
  const captured: string[] = [];
  const interceptHandler: Handler = {
    name: "Console",
    handles: {
      log: (instr, next, ctx) => {
        const [msg] = instr.args;
        captured.push(`[INTERCEPTED] ${msg}`);
        return ok(undefined);
      },
    },
  };

  await stack(
    interceptHandler,
    handlers.Exception.tryCatch(),
  ).run(() =>
    seq()
      .do(() => Console.log("test"))
      .return(() => ok("ok"))
  );

  assertEquals(captured, ["[INTERCEPTED] test"]);
});

Deno.test("state modifications are isolated per stack", async () => {
  const program = () =>
    seq()
      .tap(() => State.modify<{ count: number }>((s) => ({ count: s.count + 1 })))
      .let(() => State.get<{ count: number }>())
      .then((state) => ok(state.count))
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
      .let(() => ok("first"))
      .tap(() => Exception.fail({ reason: "error" }))
      .let(() => ok("unreachable"))
      .return((b, ctx) => ok(`${ctx!["v1"]}-${b}`))
  ) as unknown;

  assertEquals(result, { tag: "Err", error: { reason: "error" } });
});

Deno.test("console capture distinguishes log levels", async () => {
  const result = await stack(
    handlers.Console.capture(),
    handlers.Exception.tryCatch(),
  ).run(() =>
    seq()
      .do(() => Console.log("info message"))
      .do(() => Console.warn("warning message"))
      .do(() => Console.error("error message"))
      .return(() => ok("done"))
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
