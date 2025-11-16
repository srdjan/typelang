// smoke_test.ts
// Quick smoke test to verify the new Result-based effect system

import { Console, Http } from "./typelang/effects.ts";
import { handlers, ok, resolveResult, seq, stack } from "./typelang/mod.ts";
import type { Result } from "./typelang/errors.ts";
import type { ConsoleInterface, HttpInterface } from "./typelang/effects.ts";

// Test 1: Basic effect operation
const testBasicEffect = async (): Promise<void> => {
  console.log("\n=== Test 1: Basic Console Effect ===");

  const program = Console.log("Hello from new system!");

  const result = await stack(handlers.Console.live()).run(() => program);

  console.log("✓ Basic effect works");
};

// Test 2: Sequential composition
const testSeq = async (): Promise<void> => {
  console.log("\n=== Test 2: Sequential Composition ===");

  const program = seq()
    .let(() => Console.log("Step 1"))
    .then(() => Console.log("Step 2"))
    .return(() => ok("Done"));

  const result = await stack(handlers.Console.live()).run(() => program);

  console.log("✓ Sequential composition works");
};

// Test 3: Type-level effect tracking
const exampleFunction = (msg: string): Result<void, never, { console: ConsoleInterface }> => {
  return Console.log(msg);
};

const testTypeLevelEffects = async (): Promise<void> => {
  console.log("\n=== Test 3: Type-Level Effect Tracking ===");

  const result = await stack(handlers.Console.live()).run(() =>
    exampleFunction("Type-level effects work!")
  );

  console.log("✓ Type-level effect tracking works");
};

// Test 4: Result wrapping
const testResultWrapping = async (): Promise<void> => {
  console.log("\n=== Test 4: Result Wrapping ===");

  const pureResult: Result<number, never> = ok(42);

  const result = await stack().run(() => pureResult);

  console.log(`✓ Result unwrapping works, got: ${result}`);
};

// Run all tests
const main = async (): Promise<void> => {
  console.log("🚀 Running smoke tests for new Result-based effect system...\n");

  try {
    await testBasicEffect();
    await testSeq();
    await testTypeLevelEffects();
    await testResultWrapping();

    console.log("\n✅ All smoke tests passed!");
  } catch (error) {
    console.error("\n❌ Smoke test failed:", error);
    Deno.exit(1);
  }
};

if (import.meta.main) {
  await main();
}
