// app/showcase.ts
// Declarative showcase programs highlighting typelang capabilities.

import { Async, Console, Exception, State } from "../typelang/effects.ts";
import { handlers, match, par, pipe, seq, stack } from "../typelang/mod.ts";
import type { Handler } from "../typelang/mod.ts";

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

export type DemoArtifact = Readonly<{ label: string; value: string }>;

export type DemoEvent = Readonly<{ label: string; message: string }>;

export type DemoRun = Readonly<{
  status: "ok" | "error";
  headline: string;
  detail: readonly string[];
  artifacts: readonly DemoArtifact[];
  console: DemoConsole;
  state: unknown | null;
  timeline: readonly DemoEvent[];
  elapsedMs: number;
}>;

type DemoState = Readonly<{ initial: unknown; label: string }>;

type ShowcaseDemo = Readonly<{
  id: string;
  title: string;
  tagline: string;
  summary: readonly string[];
  features: readonly string[];
  effectHandlers: readonly string[];
  code: string;
  state: DemoState | null;
  usesAsync: boolean;
  program: () => unknown;
  present: (run: NormalizedRun) => DemoRun;
}>;

// Stage workflow demo -------------------------------------------------------

type Stage =
  | Readonly<{ tag: "Draft" }>
  | Readonly<{ tag: "Review" }>
  | Readonly<{ tag: "Integrate" }>
  | Readonly<{ tag: "Release" }>;

type StageEvent = Readonly<{ tag: "StageChanged"; stage: Stage; note: string }>;

type WorkflowState = Readonly<{ stage: Stage; history: readonly StageEvent[] }>;

const stageDraft: Stage = { tag: "Draft" };
const stageReview: Stage = { tag: "Review" };
const stageIntegrate: Stage = { tag: "Integrate" };
const stageRelease: Stage = { tag: "Release" };

const initialWorkflow: WorkflowState = {
  stage: stageDraft,
  history: [
    { tag: "StageChanged", stage: stageDraft, note: "Proposal sketched" },
  ],
} as const;

const stageNote = (stage: Stage): string =>
  match(stage, {
    Draft: () => "Drafted the typed HTTP surface",
    Review: () => "Reviewed handler stack with peers",
    Integrate: () => "Integrated seq()/par() orchestration",
    Release: () => "Ready to release showcase",
  });

const stageLabel = (stage: Stage): string =>
  match(stage, {
    Draft: () => "Draft",
    Review: () => "Review",
    Integrate: () => "Integrate",
    Release: () => "Release",
  });

const nextStage = (stage: Stage): Stage =>
  match(stage, {
    Draft: () => stageReview,
    Review: () => stageIntegrate,
    Integrate: () => stageRelease,
    Release: () =>
      Exception.op.fail({
        tag: "AlreadyReleased",
        message: "Workflow is already complete",
      }),
  });

const appendEvent = (
  history: readonly StageEvent[],
  event: StageEvent,
): readonly StageEvent[] => pipe(history, (items) => [...items, event]);

const workflowProgram = () =>
  seq()
    .let("state", () => State.get<WorkflowState>())
    .let("stage", ({ state }) => state.stage)
    .let("next", ({ stage }) => nextStage(stage))
    .let("event", ({ next }) => ({
      tag: "StageChanged" as const,
      stage: next,
      note: stageNote(next),
    }))
    .do(({ next }) => Console.op.log(`Stage → ${stageLabel(next)}`))
    .let("history", ({ state, event }) => appendEvent(state.history, event))
    .do(({ next, history }) => State.put<WorkflowState>({ stage: next, history }))
    .return(({ next, history }) => ({ stage: next, history }));

const presentWorkflow = (run: NormalizedRun): DemoRun =>
  match(run.outcome, {
    Ok: ({ value }) => {
      const snapshot = value as Readonly<{ stage: Stage; history: readonly StageEvent[] }>;
      const timeline = snapshot.history.map((event, index) => ({
        label: `${index + 1}. ${stageLabel(event.stage)}`,
        message: event.note,
      }));

      return {
        status: "ok",
        headline: `Stage advanced to ${stageLabel(snapshot.stage)}`,
        detail: [
          "Pure sequencing with `seq()` updates State without mutation.",
          "Console handler captures the audit trail automatically.",
          "Pattern matching ensures exhaustive stage transitions.",
        ],
        artifacts: [
          { label: "Current Stage", value: stageLabel(snapshot.stage) },
          { label: "History", value: jsonStringify(snapshot.history) },
        ],
        console: run.console,
        state: run.state,
        timeline,
        elapsedMs: run.elapsedMs,
      };
    },
    Err: ({ error }) => ({
      status: "error",
      headline: "Workflow cannot progress",
      detail: [
        "Exception handler safely short-circuited the transition.",
        "Handlers.Exception.tryCatch() produced a typed Result.",
      ],
      artifacts: [{ label: "Error", value: jsonStringify(error) }],
      console: run.console,
      state: run.state,
      timeline: [],
      elapsedMs: run.elapsedMs,
    }),
  });

// Parallel async demo -------------------------------------------------------

type TaskDescriptor = Readonly<
  { id: "console" | "state" | "async"; label: string; delay: number; icon: string }
>;
type TaskResult = Readonly<{ id: TaskDescriptor["id"]; label: string; delay: number }>;

const parallelDescriptors: readonly TaskDescriptor[] = [
  { id: "console", label: "Console logging", delay: 42, icon: "🗒️" },
  { id: "state", label: "State snapshot", delay: 68, icon: "📦" },
  { id: "async", label: "Async orchestration", delay: 24, icon: "⚡" },
] as const;

const runTask = (descriptor: TaskDescriptor) =>
  seq()
    .do(() => Console.op.log(`[${descriptor.label}] scheduled`))
    .do(() => Async.op.sleep(descriptor.delay))
    .do(() => Console.op.log(`[${descriptor.label}] completed`))
    .return(() => ({
      id: descriptor.id,
      label: descriptor.label,
      delay: descriptor.delay,
    }));

type ParallelSnapshot = Readonly<{
  tasks: readonly TaskResult[];
  fastest: TaskResult;
}>;

const parallelProgram = () =>
  seq()
    .let("results", () =>
      par.all({
        console: () => runTask(parallelDescriptors[0]),
        state: () => runTask(parallelDescriptors[1]),
        async: () => runTask(parallelDescriptors[2]),
      }))
    .let("tasks", ({ results }) =>
      pipe(parallelDescriptors, (descriptors) =>
        descriptors.map((descriptor) =>
          results[descriptor.id]
        )))
    .let("fastest", ({ tasks }) =>
      pipe(
        tasks,
        (ts) =>
          ts.reduce(
            (best, current) =>
              match(toBoolTag(current.delay < best.delay), {
                True: () => current,
                False: () => best,
              }),
            tasks[0],
          ),
      ))
    .return(({ tasks, fastest }) => ({ tasks, fastest }));

const presentParallel = (run: NormalizedRun): DemoRun =>
  match(run.outcome, {
    Ok: ({ value }) => {
      const snapshot = value as ParallelSnapshot;
      const timeline = snapshot.tasks.map((task) => ({
        label: `${task.label}`,
        message: `${task.delay}ms via par.all()`,
      }));

      return {
        status: "ok",
        headline: `${snapshot.fastest.label} finished first`,
        detail: [
          "par.all() launches independent effect handlers in parallel.",
          "par.race()-style reduction picks the fastest completion deterministically.",
          "Async handler remains pure at call sites—no direct Promises.",
        ],
        artifacts: [
          {
            label: "Task Durations",
            value: jsonStringify(snapshot.tasks.map((task) => ({
              id: task.id,
              label: task.label,
              delay: `${task.delay}ms`,
            }))),
          },
          {
            label: "Fastest Task",
            value: jsonStringify({
              id: snapshot.fastest.id,
              label: snapshot.fastest.label,
              delay: `${snapshot.fastest.delay}ms`,
            }),
          },
        ],
        console: run.console,
        state: run.state,
        timeline,
        elapsedMs: run.elapsedMs,
      };
    },
    Err: ({ error }) => ({
      status: "error",
      headline: "Parallel execution failed",
      detail: [
        "Async tasks surfaced a rejected effect.",
        "Inspect the error payload to identify the failing branch.",
      ],
      artifacts: [{ label: "Error", value: jsonStringify(error) }],
      console: run.console,
      state: run.state,
      timeline: [],
      elapsedMs: run.elapsedMs,
    }),
  });

// Exception recovery demo ---------------------------------------------------

type ConfigInput = Readonly<{ featureFlag?: string; throttle?: string; label: string }>;

const configInput: ConfigInput = {
  featureFlag: "beta",
  throttle: "aggressive",
  label: "Nightly experiment",
} as const;

type Presence<T> =
  | Readonly<{ tag: "Missing" }>
  | Readonly<{ tag: "Present"; value: T }>;

const presence = <T>(value: T | undefined): Presence<T> =>
  [
    { tag: "Missing" } as const,
    { tag: "Present", value: value as T } as const,
  ][Number(value !== undefined)];

type FlagName =
  | Readonly<{ tag: "Stable" }>
  | Readonly<{ tag: "Beta" }>
  | Readonly<{ tag: "Other"; value: string }>;

const identifyFlag = (value: string): FlagName => {
  const mapping: Readonly<Record<string, FlagName>> = {
    stable: { tag: "Stable" },
    beta: { tag: "Beta" },
  };
  return mapping[value] ?? { tag: "Other", value };
};

type ConfigError =
  | Readonly<{ tag: "MissingFlag" }>
  | Readonly<{ tag: "UnsupportedFlag"; value: string }>
  | Readonly<{ tag: "UnsupportedThrottle"; value: string }>;

type FeatureMode =
  | Readonly<{ tag: "StableMode" }>
  | Readonly<{ tag: "BetaMode" }>;

const ensureFlag = (value: string | undefined): FeatureMode =>
  match(presence(value), {
    Missing: () => Exception.op.fail({ tag: "MissingFlag" }),
    Present: ({ value: raw }) =>
      match(identifyFlag(raw), {
        Stable: () => ({ tag: "StableMode" } as const),
        Beta: () => ({ tag: "BetaMode" } as const),
        Other: ({ value: unexpected }) =>
          Exception.op.fail({
            tag: "UnsupportedFlag",
            value: unexpected,
          }),
      }),
  });

type Throttle =
  | Readonly<{ tag: "Gentle" }>
  | Readonly<{ tag: "Balanced" }>
  | Readonly<{ tag: "Burst" }>;

const identifyThrottle = (value: string): Throttle =>
  ({ conservative: { tag: "Gentle" }, steady: { tag: "Balanced" } } as const)[value] ?? {
    tag: "Burst",
  };

const ensureThrottle = (value: string | undefined): Throttle =>
  match(presence(value), {
    Missing: () => ({ tag: "Balanced" } as const),
    Present: ({ value: raw }) =>
      match(identifyThrottle(raw), {
        Gentle: () => ({ tag: "Gentle" } as const),
        Balanced: () => ({ tag: "Balanced" } as const),
        Burst: () =>
          Exception.op.fail({
            tag: "UnsupportedThrottle",
            value: raw,
          }),
      }),
  });

type ConfigSnapshot = Readonly<{
  feature: FeatureMode;
  throttle: Throttle;
  label: string;
}>;

const configProgram = () =>
  seq()
    .let("input", () => configInput)
    .do(({ input }) => Console.op.log(`Validating ${input.label}`))
    .let("feature", ({ input }) => ensureFlag(input.featureFlag))
    .let("throttle", ({ input }) => ensureThrottle(input.throttle))
    .return(({ feature, throttle, input }) => ({
      feature,
      throttle,
      label: input.label,
    }));

const modeLabel = (mode: FeatureMode): string =>
  match(mode, {
    StableMode: () => "Stable rollout",
    BetaMode: () => "Beta canary",
  });

const throttleLabel = (throttle: Throttle): string =>
  match(throttle, {
    Gentle: () => "Conservative throttling",
    Balanced: () => "Steady throughput",
    Burst: () => "Bursting",
  });

const presentConfig = (run: NormalizedRun): DemoRun =>
  match(run.outcome, {
    Ok: ({ value }) => {
      const snapshot = value as ConfigSnapshot;
      return {
        status: "ok",
        headline: `${snapshot.label} ready with ${modeLabel(snapshot.feature)}`,
        detail: [
          "Explicit matching replaces `if`/`else` branching.",
          "Exception handler doubles as typed validation boundary.",
          "pipe() keeps the transformation linear and readable.",
        ],
        artifacts: [
          { label: "Feature Mode", value: modeLabel(snapshot.feature) },
          { label: "Throttle", value: throttleLabel(snapshot.throttle) },
        ],
        console: run.console,
        state: run.state,
        timeline: [
          { label: "Feature", message: modeLabel(snapshot.feature) },
          { label: "Throttle", message: throttleLabel(snapshot.throttle) },
        ],
        elapsedMs: run.elapsedMs,
      };
    },
    Err: ({ error }) => {
      const diag = error as ConfigError;
      const headline: string = match(diag, {
        MissingFlag: () => "Feature flag missing",
        UnsupportedFlag: ({ value }) => `Unsupported feature flag: ${value}`,
        UnsupportedThrottle: ({ value }) => `Unsupported throttle: ${value}`,
      });
      return {
        status: "error",
        headline,
        detail: [
          "Handlers.Exception.tryCatch() surfaced a structured ConfigError.",
          "Handle errors as data—no thrown exceptions leak past the runtime.",
        ],
        artifacts: [{ label: "Error detail", value: jsonStringify(diag) }],
        console: run.console,
        state: run.state,
        timeline: [],
        elapsedMs: run.elapsedMs,
      };
    },
  });

// Showcase registry ---------------------------------------------------------

export const demos: readonly ShowcaseDemo[] = [
  {
    id: "workflow",
    title: "Pure Workflow Sequencing",
    tagline: "State + Console + Exception with seq()",
    summary: [
      "Demonstrates State effect orchestration via seq().",
      "Uses pattern matching to enforce total stage coverage.",
      "Captures logs without side-effects thanks to Console handler.",
    ],
    features: ["seq()", "State", "Console", "match()", "pipe()"],
    effectHandlers: ["Console.capture()", "State.with()", "Exception.tryCatch()"],
    code: `const workflow = () =>
  seq()
    .let("state", () => State.get<WorkflowState>())
    .let("stage", ({ state }) => state.stage)
    .let("next", ({ stage }) => nextStage(stage))
    .do(({ next }) => Console.op.log(\`Stage → \${stageLabel(next)}\`))
    .let("history", ({ state, next }) =>
      [...state.history, makeEvent(next)]
    )
    .do(({ next, history }) =>
      State.put<WorkflowState>({ stage: next, history })
    )
    .return(({ next, history }) => ({ stage: next, history }));`,
    state: { initial: initialWorkflow, label: "Workflow" },
    usesAsync: false,
    program: workflowProgram,
    present: presentWorkflow,
  },
  {
    id: "parallel-effects",
    title: "Parallel Effect Handlers",
    tagline: "Async handler + par combinators",
    summary: [
      "Runs three effectful tasks concurrently with par.all().",
      "Reduces results into a champion using exhaustive matching.",
      "Highlights zero Promise usage in application code.",
    ],
    features: ["par.all()", "par.race()", "Async", "Console"],
    effectHandlers: ["Console.capture()", "Exception.tryCatch()", "Async.default()"],
    code: `const program = () =>
  seq()
    .let("results", () =>
      par.all({
        console: () => runTask(consoleTask),
        state: () => runTask(stateTask),
        async: () => runTask(asyncTask),
      })
    )
    .let("tasks", ({ results }) =>
      descriptors.map((descriptor) => results[descriptor.id])
    )
    .let("fastest", ({ tasks }) =>
      tasks.reduce((best, current) =>
        current.delay < best.delay ? current : best
      )
    )
    .return(({ tasks, fastest }) => ({ tasks, fastest }));`,
    state: null,
    usesAsync: true,
    program: parallelProgram,
    present: presentParallel,
  },
  {
    id: "effect-guards",
    title: "Typed Exception Guards",
    tagline: "Total validation with match() + Exception",
    summary: [
      "Validates config inputs without branching statements.",
      "Propagates structured errors through Exception handler.",
      "Keeps transformation linear with seq() and pipe().",
    ],
    features: ["Exception", "match()", "seq()", "Console"],
    effectHandlers: ["Console.capture()", "Exception.tryCatch()"],
    code: `const config = () =>
  seq()
    .let("input", () => configInput)
    .do(({ input }) => Console.op.log(\`Validating \${input.label}\`))
    .let("feature", ({ input }) => ensureFlag(input.featureFlag))
    .let("throttle", ({ input }) => ensureThrottle(input.throttle))
    .return(({ feature, throttle, input }) => ({
      feature,
      throttle,
      label: input.label,
    }));`,
    state: null,
    usesAsync: false,
    program: configProgram,
    present: presentConfig,
  },
] as const;

// Runtime orchestration -----------------------------------------------------

type ConsoleSnapshot = Readonly<{
  result: unknown;
  logs: readonly string[];
  warns: readonly string[];
  errors: readonly string[];
}>;

type StateSnapshot = Readonly<{ result: Outcome; state: unknown }>;

type StateCase =
  | Readonly<{ tag: "WithState"; snapshot: StateSnapshot }>
  | Readonly<{ tag: "WithoutState"; outcome: Outcome }>;

const toStateCase = (value: unknown): StateCase => {
  const record = value as Record<string, unknown>;
  const cases: readonly StateCase[] = [
    { tag: "WithoutState", outcome: value as Outcome },
    { tag: "WithState", snapshot: value as StateSnapshot },
  ];
  return cases[Number("state" in record)];
};

const normalize = (raw: unknown, elapsedMs: number): NormalizedRun => {
  const consoleSnapshot = raw as ConsoleSnapshot;
  const consoleData: DemoConsole = {
    logs: consoleSnapshot.logs,
    warns: consoleSnapshot.warns,
    errors: consoleSnapshot.errors,
  };
  const stateCase = toStateCase(consoleSnapshot.result);

  return match(stateCase, {
    WithState: ({ snapshot }) => ({
      outcome: snapshot.result,
      state: snapshot.state,
      console: consoleData,
      elapsedMs,
    }),
    WithoutState: ({ outcome }) => ({
      outcome,
      state: null,
      console: consoleData,
      elapsedMs,
    }),
  });
};

const buildHandlers = (demo: ShowcaseDemo): readonly Handler[] => {
  const base: readonly Handler[] = [
    handlers.Console.capture(),
  ];

  const withState = match<Option<DemoState>, readonly Handler[]>(option(demo.state), {
    Some: ({ value }) => [handlers.State.with(value.initial)] as readonly Handler[],
    None: () => [] as readonly Handler[],
  });
  const exception = [handlers.Exception.tryCatch()];
  const asyncHandlers = match<BoolTag, readonly Handler[]>(toBoolTag(demo.usesAsync), {
    True: () => [handlers.Async.default()] as readonly Handler[],
    False: () => [] as readonly Handler[],
  });

  return [...base, ...withState, ...exception, ...asyncHandlers];
};

export const runDemo = async (demo: ShowcaseDemo): Promise<DemoRun> => {
  const started = performance.now();
  const handlersList = buildHandlers(demo);
  const raw = await stack(...handlersList).run(demo.program);
  const finished = performance.now();
  const normalized = normalize(raw, Math.round(finished - started));
  return demo.present(normalized);
};

export type { ShowcaseDemo };
