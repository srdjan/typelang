// app/showcase.ts
// Declarative showcase programs highlighting typelang capabilities.

import { Async, Console, Exception, State } from "../../../typelang/effects.ts";
import { handlers, match, ok, par, pipe, seq, stack } from "../../../typelang/mod.ts";
import type { Handler, Result } from "../../../typelang/mod.ts";
import { type BoolTag, type Option, option, toBoolTag } from "./lib/patterns.ts";

const jsonStringify = (value: unknown): string => JSON.stringify(value, null, 2) ?? String(value);

type Outcome =
  | Readonly<{ tag: "Ok"; value: unknown }>
  | Readonly<{ tag: "Err"; error: unknown }>;

type DemoConsole = Readonly<{
  logs: readonly string[];
  warns: readonly string[];
  errors: readonly string[];
}>;

export type NormalizedRun = Readonly<{
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

const nextStage = (stage: Stage): Result<Stage, unknown, { exception: typeof Exception.spec }> =>
  match(stage, {
    Draft: () => ok(stageReview),
    Review: () => ok(stageIntegrate),
    Integrate: () => ok(stageRelease),
    Release: () =>
      Exception.fail({
        tag: "AlreadyReleased",
        message: "Workflow is already complete",
      }),
  });

const appendEvent = (
  history: readonly StageEvent[],
  event: StageEvent,
): readonly StageEvent[] => pipe(history, (items) => [...items, event]);

// Multi-capability type alias: demonstrates record-based effect composition
// Order-independent, self-documenting, no need for composite type definitions
type WorkflowCaps = Readonly<{
  console: typeof Console.spec;
  state: typeof State.spec;
  exception: typeof Exception.spec;
}>;

const workflowProgram = (): Result<
  Readonly<{ stage: Stage; history: readonly StageEvent[] }>,
  unknown,
  WorkflowCaps
> =>
  seq()
    .let("state", () => State.get<WorkflowState>())
    .then((state) => ok(state.stage))
    .then((stage) => nextStage(stage))
    .let("next", (next) => ok(next))
    .then((next) =>
      ok({
        tag: "StageChanged" as const,
        stage: next,
        note: stageNote(next),
      })
    )
    .let("event", (event) => ok(event))
    .tap((event) => Console.log(`Stage → ${stageLabel(event.stage)}`))
    .tapWith(({ state, event }) => {
      const history = appendEvent(state.history, event);
      return State.put<WorkflowState>({ stage: event.stage, history });
    })
    .returnWith(({ state, event }) => {
      const history = appendEvent(state.history, event);
      return ok({ stage: event.stage, history });
    });

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
          "`seq()` threads workflow state without any mutable branches.",
          "Console + Exception handlers capture an auditable trail on every hop.",
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
        "Exception handler short-circuited the transition with a typed payload.",
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

// Multi-capability type for async operations with logging
// Type annotation demonstrates record-based pattern but is optional due to inference
type ParallelTaskCaps = Readonly<{
  console: typeof Console.spec;
  async: typeof Async.spec;
}>;

const runTask = (descriptor: TaskDescriptor): Result<TaskResult, never, ParallelTaskCaps> =>
  seq()
    .do(() => Console.log(`[${descriptor.label}] scheduled`))
    .do(() => Async.sleep(descriptor.delay))
    .do(() => Console.log(`[${descriptor.label}] completed`))
    .return(() =>
      ok({
        id: descriptor.id,
        label: descriptor.label,
        delay: descriptor.delay,
      })
    );

type ParallelSnapshot = Readonly<{
  tasks: readonly TaskResult[];
  fastest: TaskResult;
}>;

// Multi-capability type demonstrating parallel effect composition
// Type annotation optional due to inference, shown here for documentation
type ParallelProgramCaps = Readonly<{
  console: typeof Console.spec;
  async: typeof Async.spec;
  exception: typeof Exception.spec;
}>;

const parallelProgram = () =>
  seq()
    .let("results", () =>
      par.all({
        console: () => runTask(parallelDescriptors[0]),
        state: () => runTask(parallelDescriptors[1]),
        async: () => runTask(parallelDescriptors[2]),
      }))
    .then((results) =>
      ok(pipe(parallelDescriptors, (descriptors) =>
        descriptors.map((descriptor) =>
          results[descriptor.id]
        )))
    )
    .then((tasks) =>
      ok({
        tasks,
        fastest: pipe(
          tasks,
          (ts) =>
            ts.reduce(
              (best, current) =>
                match(toBoolTag(current.delay < best.delay), {
                  True: () =>
                    current,
                  False: () => best,
                }),
              tasks[0],
            ),
        ),
      })
    )
    .value();

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
          "`par.all()` fans out async work without exposing Promises to the caller.",
          "A deterministic reduction step compares elapsed times to choose the champion.",
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
        "An async branch rejected—inspect the payload for the source descriptor.",
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

// Helper function with Exception capability for validation
const ensureFlag = (
  value: string | undefined,
): Result<FeatureMode, ConfigError, Readonly<{ exception: typeof Exception.spec }>> =>
  match(presence(value), {
    Missing: () => Exception.fail({ tag: "MissingFlag" }),
    Present: ({ value: raw }) =>
      match(identifyFlag(raw), {
        Stable: () => ok({ tag: "StableMode" } as const),
        Beta: () => ok({ tag: "BetaMode" } as const),
        Other: ({ value: unexpected }) =>
          Exception.fail({
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

const ensureThrottle = (
  value: string | undefined,
): Result<Throttle, ConfigError, Readonly<{ exception: typeof Exception.spec }>> =>
  match(presence(value), {
    Missing: () => ok({ tag: "Balanced" } as const),
    Present: ({ value: raw }) =>
      match(identifyThrottle(raw), {
        Gentle: () => ok({ tag: "Gentle" } as const),
        Balanced: () => ok({ tag: "Balanced" } as const),
        Burst: () =>
          Exception.fail({
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

// Multi-capability type for config validation with logging and error handling
type ConfigProgramCaps = Readonly<{
  console: typeof Console.spec;
  exception: typeof Exception.spec;
}>;

const configProgram = (): Result<ConfigSnapshot, ConfigError, ConfigProgramCaps> =>
  seq()
    .let("input", () => ok(configInput))
    .tap((input) => Console.log(`Validating ${input.label}`))
    .let("feature", (input) => ensureFlag(input.featureFlag))
    .let("throttle", (_, ctx) => ensureThrottle(ctx!["input"].throttle))
    .returnWith(({ input, feature, throttle }) =>
      ok({
        feature,
        throttle,
        label: input.label,
      })
    );

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
          "`match()` + `seq()` validate configs without imperative branching.",
          "Exception handler doubles as a typed boundary for invalid input.",
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
          "Exception handler surfaced a structured ConfigError—no thrown errors escaped.",
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
      "`seq()` advances workflow state while keeping data immutable.",
      "Console + Exception handlers yield audit trails automatically.",
    ],
    features: ["seq()", "State", "Console", "match()", "pipe()"],
    effectHandlers: ["Console.capture()", "State.with()", "Exception.tryCatch()"],
    code: `// Multi-capability type alias: record-based effect composition
// Order-independent, self-documenting
type WorkflowCaps = Readonly<{
  console: typeof Console.spec;
  state: ReturnType<typeof State.spec<WorkflowState>>;
  exception: typeof Exception.spec;
}>;

const workflow = (): Eff<WorkflowSnapshot, WorkflowCaps> =>
  seq()
    .let("state", () => State.get<WorkflowState>())
    .then((state) => state.stage)
    .then((stage) => nextStage(stage))
    .let("next", (next) => next)
    .then((next) => ({ stage: next, note: stageNote(next) }))
    .let("event", (event) => event)
    .tap((event) => Console.log(\`Stage → \${stageLabel(event.stage)}\`))
    .tapWith(({ state, event }) => {
      const history = appendEvent(state.history, event);
      return State.put({ stage: event.stage, history });
    })
    .returnWith(({ state, event }) => {
      const history = appendEvent(state.history, event);
      return { stage: event.stage, history };
    });`,
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
      "`par.all()` fans out async computation with typed handlers.",
      "Deterministic reduction highlights the champion task without Promises.",
    ],
    features: ["par.all()", "par.race()", "Async", "Console"],
    effectHandlers: ["Console.capture()", "Exception.tryCatch()", "Async.default()"],
    code: `// Multi-capability type: parallel effect composition
// Combines async operations, logging, and error handling
type ParallelProgramCaps = Readonly<{
  console: typeof Console.spec;
  async: typeof Async.spec;
  exception: typeof Exception.spec;
}>;

const program = (): Eff<ParallelSnapshot, ParallelProgramCaps> =>
  seq()
    .let(() =>
      par.all({
        console: () => runTask(consoleTask),
        state: () => runTask(stateTask),
        async: () => runTask(asyncTask),
      })
    )
    .then((results) =>
      pipe(descriptors, (descriptors) =>
        descriptors.map((descriptor) => results[descriptor.id]))
    )
    .then((tasks) => ({
      tasks,
      fastest: pipe(tasks, (ts) =>
        ts.reduce((best, current) =>
          match(toBoolTag(current.delay < best.delay), {
            True: () => current,
            False: () => best,
          }), tasks[0])
      ),
    }))
    .value();`,
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
      "`match()` replaces `if`/`else` for total validation paths.",
      "Exception handlers return typed errors instead of thrown exceptions.",
    ],
    features: ["Exception", "match()", "seq()", "Console"],
    effectHandlers: ["Console.capture()", "Exception.tryCatch()"],
    code: `// Multi-capability type: validation with logging and error handling
// Demonstrates record-based capabilities for clean composition
type ConfigProgramCaps = Readonly<{
  console: typeof Console.spec;
  exception: typeof Exception.spec;
}>;

const config = (): Eff<ConfigSnapshot, ConfigProgramCaps> =>
  seq()
    .let("input", () => configInput)
    .tap((input) => Console.log(\`Validating \${input.label}\`))
    .let("feature", (input) => ensureFlag(input.featureFlag))
    .let("throttle", (_, ctx) => ensureThrottle(ctx!["input"].throttle))
    .returnWith(({ input, feature, throttle }) => ({
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
