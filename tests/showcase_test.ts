import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { demos, runDemo } from "../examples/showcase/app/showcase.ts";

const byId = (id: string) => demos.find((demo) => demo.id === id);

Deno.test("workflow demo advances state and captures console output", async () => {
  const demo = byId("workflow");
  assert(demo, "workflow demo should exist");

  const run = await runDemo(demo);

  assertEquals(run.status, "ok");
  assert(run.console.logs.length > 0, "console logs should be captured");

  const state = run.state as { stage: { tag: string }; history: unknown[] } | null;
  assert(state, "workflow demo should capture state");
  assertEquals(state.stage.tag, "Review");
  assert(
    Array.isArray(state.history) && state.history.length > 1,
    "state history should grow",
  );
});

Deno.test("parallel demo reports fastest task and returns timeline", async () => {
  const demo = byId("parallel-effects");
  assert(demo, "parallel-effects demo should exist");

  const run = await runDemo(demo);

  assertEquals(run.status, "ok");
  assertEquals(run.state, null);
  assertEquals(run.timeline.length, 3);
  assert(run.headline.includes("finished first"));
});

Deno.test("exception guard demo surfaces structured ConfigError", async () => {
  const demo = byId("effect-guards");
  assert(demo, "effect-guards demo should exist");

  const run = await runDemo(demo);

  assertEquals(run.status, "error");
  assertEquals(run.artifacts.length > 0, true);
  assert(
    run.artifacts[0].value.includes('"tag"'),
    "error artifact should include structured payload",
  );
});
