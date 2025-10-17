// app/demos_additional.ts
// Additional demo programs to showcase more typelang features.

import { Async, Console, Exception, State } from "../typelang/effects.ts";
import { handlers, match, par, pipe, seq, stack } from "../typelang/mod.ts";
import type { DemoArtifact, DemoEvent, DemoRun, ShowcaseDemo } from "./showcase.ts";

type BoolTag =
  | Readonly<{ tag: "True" }>
  | Readonly<{ tag: "False" }>;

const boolTags: readonly BoolTag[] = [
  { tag: "False" } as const,
  { tag: "True" } as const,
] as const;

const toBoolTag = (flag: boolean): BoolTag => boolTags[Number(flag)];

type Option<T> =
  | Readonly<{ tag: "Some"; value: T }>
  | Readonly<{ tag: "None" }>;

const option = <T>(value: T | null | undefined): Option<T> =>
  [
    { tag: "None" } as const,
    { tag: "Some", value: value as T } as const,
  ][Number(value !== null && value !== undefined)];

const jsonStringify = (value: unknown): string => JSON.stringify(value, null, 2) ?? String(value);

type Outcome =
  | Readonly<{ tag: "Ok"; value: unknown }>
  | Readonly<{ tag: "Err"; error: unknown }>;

type DemoConsole = Readonly<{
  logs: readonly string[];
  warns: readonly string[];
  errors: readonly string[];
}>;

type NormalizedRun = Readonly<{
  outcome: Outcome;
  state: unknown | null;
  console: DemoConsole;
  elapsedMs: number;
}>;

// Demo 1: Hello Effects -------------------------------------------------------

const helloProgram = () =>
  seq()
    .do(() => Console.op.log("Starting hello program"))
    .let("count", () => 42)
    .do(({ count }) => Console.op.log(`The answer is ${count}`))
    .return(({ count }) => ({ message: "Hello from effects!", count }));

const presentHello = (run: NormalizedRun): DemoRun =>
  match(run.outcome, {
    Ok: ({ value }) => {
      const result = value as Readonly<{ message: string; count: number }>;
      return {
        status: "ok",
        headline: result.message,
        detail: [
          "Console.op.log() writes to the Console effect",
          "seq().do() executes effects without binding values",
          "seq().let() binds values for later steps",
          "seq().return() produces the final result",
        ],
        artifacts: [
          { label: "Count", value: String(result.count) },
          { label: "Message", value: result.message },
        ],
        console: run.console,
        state: run.state,
        timeline: [
          { label: "Start", message: "Program initialized" },
          { label: "Compute", message: "Set count to 42" },
          { label: "Log", message: "Logged the answer" },
          { label: "Complete", message: "Returned result" },
        ],
        elapsedMs: run.elapsedMs,
      };
    },
    Err: ({ error }) => ({
      status: "error",
      headline: "Unexpected error",
      detail: ["An error occurred during execution"],
      artifacts: [{ label: "Error", value: jsonStringify(error) }],
      console: run.console,
      state: run.state,
      timeline: [],
      elapsedMs: run.elapsedMs,
    }),
  });

// Demo 2: Pipe Dreams ---------------------------------------------------------

type User = Readonly<{ id: number; name: string; active: boolean }>;

const users: readonly User[] = [
  { id: 1, name: "Alice Anderson", active: true },
  { id: 2, name: "Bob Brown", active: false },
  { id: 3, name: "Charlie Chen", active: true },
  { id: 4, name: "Diana Davis", active: true },
] as const;

const filterActive = (users: readonly User[]): readonly User[] => users.filter((u) => u.active);

const extractNames = (users: readonly User[]): readonly string[] => users.map((u) => u.name);

const toUpperCase = (names: readonly string[]): readonly string[] =>
  names.map((n) => n.toUpperCase());

const joinWithComma = (names: readonly string[]): string => names.join(", ");

const pipeProgram = () =>
  seq()
    .let("users", () => users)
    .do(() => Console.op.log(`Processing ${users.length} users`))
    .let("result", ({ users }) =>
      pipe(
        users,
        filterActive,
        extractNames,
        toUpperCase,
        joinWithComma,
      ))
    .do(({ result }) => Console.op.log(`Active users: ${result}`))
    .return(({ result }) => result);

const presentPipe = (run: NormalizedRun): DemoRun =>
  match(run.outcome, {
    Ok: ({ value }) => ({
      status: "ok",
      headline: `Result: ${value}`,
      detail: [
        "pipe() chains transformations left-to-right",
        "Each function receives the output of the previous",
        "Type-safe: compiler checks each step",
        "Reads naturally top-to-bottom",
      ],
      artifacts: [
        { label: "Active Users", value: String(value) },
        {
          label: "Pipeline Steps",
          value: "filterActive → extractNames → toUpperCase → joinWithComma",
        },
      ],
      console: run.console,
      state: run.state,
      timeline: [
        { label: "Filter", message: "Filtered active users" },
        { label: "Extract", message: "Extracted names" },
        { label: "Transform", message: "Converted to uppercase" },
        { label: "Join", message: "Joined with commas" },
      ],
      elapsedMs: run.elapsedMs,
    }),
    Err: ({ error }) => ({
      status: "error",
      headline: "Pipeline failed",
      detail: ["An error occurred during transformation"],
      artifacts: [{ label: "Error", value: jsonStringify(error) }],
      console: run.console,
      state: run.state,
      timeline: [],
      elapsedMs: run.elapsedMs,
    }),
  });

// Demo 3: Match Made ----------------------------------------------------------

type Status =
  | Readonly<{ tag: "Pending" }>
  | Readonly<{ tag: "Approved"; by: string }>
  | Readonly<{ tag: "Rejected"; reason: string }>;

const statuses: readonly Status[] = [
  { tag: "Pending" },
  { tag: "Approved", by: "Admin" },
  { tag: "Rejected", reason: "Invalid data" },
] as const;

const statusMessage = (status: Status): string =>
  match(status, {
    Pending: () => "⏳ Awaiting review",
    Approved: ({ by }) => `✅ Approved by ${by}`,
    Rejected: ({ reason }) => `❌ Rejected: ${reason}`,
  });

const matchProgram = () =>
  seq()
    .let("statuses", () => statuses)
    .do(() => Console.op.log("Processing statuses"))
    .let("messages", ({ statuses }) =>
      pipe(
        statuses,
        (items) => items.map(statusMessage),
      ))
    .do(({ messages }) => Console.op.log(`Processed ${messages.length} statuses`))
    .return(({ messages }) => messages);

const presentMatch = (run: NormalizedRun): DemoRun =>
  match(run.outcome, {
    Ok: ({ value }) => {
      const messages = value as readonly string[];
      return {
        status: "ok",
        headline: `Processed ${messages.length} statuses`,
        detail: [
          "match() provides exhaustive pattern matching",
          "Compiler ensures all cases are handled",
          "Destructure fields in each case",
          "Works with discriminated unions (tag property)",
        ],
        artifacts: [
          { label: "Messages", value: messages.join("\n") },
          { label: "Cases Handled", value: "Pending, Approved, Rejected" },
        ],
        console: run.console,
        state: run.state,
        timeline: messages.map((msg, i) => ({
          label: `Status ${i + 1}`,
          message: msg,
        })),
        elapsedMs: run.elapsedMs,
      };
    },
    Err: ({ error }) => ({
      status: "error",
      headline: "Pattern matching failed",
      detail: ["An error occurred during matching"],
      artifacts: [{ label: "Error", value: jsonStringify(error) }],
      console: run.console,
      state: run.state,
      timeline: [],
      elapsedMs: run.elapsedMs,
    }),
  });

// Demo 4: State Machine -------------------------------------------------------

type Light =
  | Readonly<{ tag: "Red"; timer: number }>
  | Readonly<{ tag: "Yellow" }>
  | Readonly<{ tag: "Green"; timer: number }>;

const initialLight: Light = { tag: "Red", timer: 5 };

const nextLight = (current: Light): Light =>
  match(current, {
    Red: ({ timer }) =>
      match(toBoolTag(timer > 0), {
        True: () => ({ tag: "Red", timer: timer - 1 } as Light),
        False: () => ({ tag: "Green", timer: 5 } as Light),
      }),
    Yellow: () => ({ tag: "Red", timer: 5 } as Light),
    Green: ({ timer }) =>
      match(toBoolTag(timer > 0), {
        True: () => ({ tag: "Green", timer: timer - 1 } as Light),
        False: () => ({ tag: "Yellow" } as Light),
      }),
  });

const lightLabel = (light: Light): string =>
  match(light, {
    Red: ({ timer }) => `🔴 RED (${timer}s)`,
    Yellow: () => "🟡 YELLOW",
    Green: ({ timer }) => `🟢 GREEN (${timer}s)`,
  });

const stateMachineProgram = () =>
  seq()
    .let("current", () => State.get<Light>())
    .do(({ current }) => Console.op.log(`Current: ${lightLabel(current)}`))
    .let("next", ({ current }) => nextLight(current))
    .do(({ next }) => State.put(next))
    .do(({ next }) => Console.op.log(`Next: ${lightLabel(next)}`))
    .return(({ current, next }) => ({ previous: current, current: next }));

const presentStateMachine = (run: NormalizedRun): DemoRun =>
  match(run.outcome, {
    Ok: ({ value }) => {
      const result = value as Readonly<{ previous: Light; current: Light }>;
      return {
        status: "ok",
        headline: `Transitioned: ${lightLabel(result.previous)} → ${lightLabel(result.current)}`,
        detail: [
          "State machines modeled with discriminated unions",
          "Transitions enforced by pattern matching",
          "Impossible states are type errors",
          "State effect tracks current value",
        ],
        artifacts: [
          { label: "Previous", value: lightLabel(result.previous) },
          { label: "Current", value: lightLabel(result.current) },
        ],
        console: run.console,
        state: run.state,
        timeline: [
          { label: "Read State", message: lightLabel(result.previous) },
          { label: "Transition", message: "Applied nextLight()" },
          { label: "Write State", message: lightLabel(result.current) },
        ],
        elapsedMs: run.elapsedMs,
      };
    },
    Err: ({ error }) => ({
      status: "error",
      headline: "State transition failed",
      detail: ["An error occurred during state machine execution"],
      artifacts: [{ label: "Error", value: jsonStringify(error) }],
      console: run.console,
      state: run.state,
      timeline: [],
      elapsedMs: run.elapsedMs,
    }),
  });

// Demo 5: Async Map -----------------------------------------------------------

type Task = Readonly<{ id: number; name: string; durationMs: number }>;

const tasks: readonly Task[] = [
  { id: 1, name: "Compile", durationMs: 50 },
  { id: 2, name: "Test", durationMs: 30 },
  { id: 3, name: "Deploy", durationMs: 40 },
] as const;

const runTask = (task: Task) =>
  seq()
    .do(() => Console.op.log(`[${task.name}] Starting...`))
    .do(() => Async.op.sleep(task.durationMs))
    .do(() => Console.op.log(`[${task.name}] Completed`))
    .return(() => ({ id: task.id, name: task.name, status: "done" as const }));

const asyncMapProgram = () =>
  seq()
    .do(() => Console.op.log("Starting parallel tasks"))
    .let("results", () => par.map(tasks, runTask))
    .do(({ results }) => Console.op.log(`Completed ${results.length} tasks`))
    .return(({ results }) => results);

const presentAsyncMap = (run: NormalizedRun): DemoRun =>
  match(run.outcome, {
    Ok: ({ value }) => {
      const results = value as readonly Readonly<{ id: number; name: string; status: "done" }>[];
      return {
        status: "ok",
        headline: `Completed ${results.length} tasks in parallel`,
        detail: [
          "par.map() runs tasks concurrently",
          "Results maintain input order",
          "Async effect handles sleep without Promises",
          "All tasks complete before proceeding",
        ],
        artifacts: [
          { label: "Tasks", value: tasks.map((t) => t.name).join(", ") },
          { label: "Results", value: jsonStringify(results) },
        ],
        console: run.console,
        state: run.state,
        timeline: results.map((r) => ({
          label: r.name,
          message: `Task ${r.id}: ${r.status}`,
        })),
        elapsedMs: run.elapsedMs,
      };
    },
    Err: ({ error }) => ({
      status: "error",
      headline: "Parallel execution failed",
      detail: ["One or more tasks encountered an error"],
      artifacts: [{ label: "Error", value: jsonStringify(error) }],
      console: run.console,
      state: run.state,
      timeline: [],
      elapsedMs: run.elapsedMs,
    }),
  });

// Demo 6: Race Condition ------------------------------------------------------

type Competitor = Readonly<{ name: string; speed: number }>;

const competitors: readonly Competitor[] = [
  { name: "Fast", speed: 25 },
  { name: "Medium", speed: 50 },
  { name: "Slow", speed: 75 },
] as const;

const compete = (competitor: Competitor) =>
  seq()
    .do(() => Console.op.log(`${competitor.name} started (${competitor.speed}ms)`))
    .do(() => Async.op.sleep(competitor.speed))
    .do(() => Console.op.log(`${competitor.name} finished!`))
    .return(() => competitor);

const raceProgram = () =>
  seq()
    .do(() => Console.op.log("Race starting..."))
    .let("winner", () => par.race(competitors.map((c) => () => compete(c))))
    .do(({ winner }) => Console.op.log(`Winner: ${winner.name}!`))
    .return(({ winner }) => winner);

const presentRace = (run: NormalizedRun): DemoRun =>
  match(run.outcome, {
    Ok: ({ value }) => {
      const winner = value as Competitor;
      return {
        status: "ok",
        headline: `${winner.name} wins!`,
        detail: [
          "par.race() returns the first completed task",
          "Other tasks are cancelled",
          "Fastest response wins",
          "Great for timeout patterns",
        ],
        artifacts: [
          { label: "Winner", value: winner.name },
          { label: "Speed", value: `${winner.speed}ms` },
          { label: "Competitors", value: competitors.map((c) => c.name).join(", ") },
        ],
        console: run.console,
        state: run.state,
        timeline: [
          { label: "Race Start", message: `${competitors.length} competitors` },
          { label: "Winner", message: `${winner.name} (${winner.speed}ms)` },
        ],
        elapsedMs: run.elapsedMs,
      };
    },
    Err: ({ error }) => ({
      status: "error",
      headline: "Race failed",
      detail: ["All competitors encountered errors"],
      artifacts: [{ label: "Error", value: jsonStringify(error) }],
      console: run.console,
      state: run.state,
      timeline: [],
      elapsedMs: run.elapsedMs,
    }),
  });

// Export additional demos
export const additionalDemos: readonly ShowcaseDemo[] = [
  {
    id: "hello-effects",
    title: "Hello Effects",
    tagline: "Minimal Console + seq() demonstration",
    summary: [
      "Introduces the Console effect with simple logging.",
      "Shows seq() for linear computation flow.",
      "Demonstrates .do() for effects and .let() for bindings.",
    ],
    features: ["seq()", "Console", ".do()", ".let()", ".return()"],
    effectHandlers: ["Console.capture()", "Exception.tryCatch()"],
    code: `const hello = () =>
  seq()
    .do(() => Console.op.log("Starting"))
    .let("count", () => 42)
    .do(({count}) => Console.op.log(\`Answer: \${count}\`))
    .return(({count}) => ({message: "Hello!", count}));`,
    state: null,
    usesAsync: false,
    program: helloProgram,
    present: presentHello,
  },
  {
    id: "pipe-dreams",
    title: "Pipe Dreams",
    tagline: "Function composition with pipe()",
    summary: [
      "Chains transformations in readable left-to-right order.",
      "Each step receives the output of the previous step.",
      "Type-safe composition checked by the compiler.",
    ],
    features: ["pipe()", "seq()", "Console"],
    effectHandlers: ["Console.capture()", "Exception.tryCatch()"],
    code: `const process = () =>
  pipe(
    users,
    filterActive,
    extractNames,
    toUpperCase,
    joinWithComma,
  );`,
    state: null,
    usesAsync: false,
    program: pipeProgram,
    present: presentPipe,
  },
  {
    id: "match-made",
    title: "Match Made",
    tagline: "Exhaustive pattern matching on unions",
    summary: [
      "Demonstrates match() with discriminated unions.",
      "Compiler enforces exhaustive case handling.",
      "Destructures variant fields in each case.",
    ],
    features: ["match()", "pipe()", "Console"],
    effectHandlers: ["Console.capture()", "Exception.tryCatch()"],
    code: `const message = (status: Status): string =>
  match(status, {
    Pending: () => "⏳ Awaiting review",
    Approved: ({by}) => \`✅ By \${by}\`,
    Rejected: ({reason}) => \`❌ \${reason}\`,
  });`,
    state: null,
    usesAsync: false,
    program: matchProgram,
    present: presentMatch,
  },
  {
    id: "state-machine",
    title: "Traffic Light State Machine",
    tagline: "State transitions with match() guards",
    summary: [
      "Models a traffic light as a state machine.",
      "Uses match() to enforce valid transitions.",
      "State effect tracks the current light.",
    ],
    features: ["State", "match()", "seq()", "Console"],
    effectHandlers: ["Console.capture()", "State.with()", "Exception.tryCatch()"],
    code: `const nextLight = (current: Light): Light =>
  match(current, {
    Red: ({timer}) =>
      timer > 0 ? {...current, timer: timer - 1} : {tag: "Green", timer: 5},
    Yellow: () => ({tag: "Red", timer: 5}),
    Green: ({timer}) =>
      timer > 0 ? {...current, timer: timer - 1} : {tag: "Yellow"},
  });`,
    state: { initial: initialLight, label: "Traffic Light" },
    usesAsync: false,
    program: stateMachineProgram,
    present: presentStateMachine,
  },
  {
    id: "async-map",
    title: "Parallel Async Map",
    tagline: "par.map() for concurrent execution",
    summary: [
      "Runs multiple async tasks concurrently with par.map().",
      "Maintains result order matching input order.",
      "All tasks complete before the result is available.",
    ],
    features: ["par.map()", "Async", "Console"],
    effectHandlers: ["Console.capture()", "Async.default()", "Exception.tryCatch()"],
    code: `const runTasks = () =>
  seq()
    .let("results", () =>
      par.map(tasks, runTask)
    )
    .return(({results}) => results);`,
    state: null,
    usesAsync: true,
    program: asyncMapProgram,
    present: presentAsyncMap,
  },
  {
    id: "race-condition",
    title: "Race to the Finish",
    tagline: "par.race() returns the first winner",
    summary: [
      "Demonstrates par.race() with multiple competitors.",
      "First task to complete wins, others are cancelled.",
      "Useful for timeout patterns and fallbacks.",
    ],
    features: ["par.race()", "Async", "Console"],
    effectHandlers: ["Console.capture()", "Async.default()", "Exception.tryCatch()"],
    code: `const race = () =>
  seq()
    .let("winner", () =>
      par.race(competitors.map(c => () => compete(c)))
    )
    .return(({winner}) => winner);`,
    state: null,
    usesAsync: true,
    program: raceProgram,
    present: presentRace,
  },
] as const;
