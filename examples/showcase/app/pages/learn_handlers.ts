// app/pages/learn_handlers.ts
// Learning path: Handler composition and advanced patterns.

import { match } from "../../../../typelang/match.ts";
import {
  type Badge,
  type CodeBlock,
  renderBadge,
  renderButton,
  renderCodeBlock,
} from "../components/ui.ts";
import { escapeHtml } from "../lib/patterns.ts";

type HandlerConcept = Readonly<{
  id: string;
  title: string;
  tagline: string;
  explanation: readonly string[];
  codeExample: string;
  keyPoints: readonly string[];
  tryItUrl: string | null;
}>;

const concepts: readonly HandlerConcept[] = [
  {
    id: "what-are-handlers",
    title: "What Are Handlers?",
    tagline: "Interpreters that provide implementations for effects",
    explanation: [
      "Handlers are the runtime interpreters that give meaning to your effects.",
      "Your program describes WHAT effects it needs. Handlers provide HOW those effects execute.",
      "A handler intercepts effect operations and provides custom behavior—like logging to console, updating state, or handling errors.",
      "Handlers are composable: stack multiple handlers to handle different effects, or override default behavior with custom implementations.",
    ],
    codeExample: `import { Handler, stack } from "../typelang/mod.ts";
import { Console } from "../typelang/effects.ts";

// 1. Your program uses Console effect
const greet = (name: string) =>
  seq()
    .do(() => Console.log(\`Hello, \${name}!\`))
    .return(() => \`Greeted \${name}\`);

// 2. Define a handler that interprets Console operations
const consoleHandler = (): Handler => ({
  name: "Console",
  handles: {
    log: (instr, next, ctx) => {
      const [message] = instr.args;
      console.log(\`[LOG] \${message}\`);  // Actual side effect!
      return next(undefined);
    },
    warn: (instr, next, ctx) => {
      const [message] = instr.args;
      console.warn(\`[WARN] \${message}\`);
      return next(undefined);
    },
    error: (instr, next, ctx) => {
      const [message] = instr.args;
      console.error(\`[ERROR] \${message}\`);
      return next(undefined);
    },
  },
});

// 3. Run program with handler
const result = await stack(consoleHandler()).run(() => greet("Alice"));
// Prints: [LOG] Hello, Alice!
// Returns: "Greeted Alice"`,
    keyPoints: [
      "Handlers map effect operations to concrete implementations",
      "Each handler has a name matching an effect type",
      "handles object maps operation names to handler functions",
      "Handler functions receive (instruction, next, ctx) for cancellation support",
      "stack(...handlers).run(program) executes with handler stack",
    ],
    tryItUrl: "/playground?example=basic-handler",
  },
  {
    id: "built-in-handlers",
    title: "Built-in Handlers",
    tagline: "Ready-to-use handlers for common effects",
    explanation: [
      "typelang ships with production-ready handlers for all built-in effects.",
      "Console handlers come in two flavors: live (prints to console) and capture (records to array).",
      "State handler manages immutable state using a closure—no global variables.",
      "Exception handler converts failures to Result<T,E> types—no thrown exceptions leak out.",
      "Async handler integrates Promises and setTimeout without exposing them to your code.",
    ],
    codeExample: `import { handlers, stack, seq } from "../typelang/mod.ts";
import { Console, State, Exception, Async } from "../typelang/effects.ts";

// Console.live() - prints to actual console
const liveProgram = () =>
  seq()
    .do(() => Console.log("This prints to console"))
    .return(() => 42);

await stack(handlers.Console.live()).run(liveProgram);
// Prints to actual console

// Console.capture() - records to array
const captureProgram = () =>
  seq()
    .do(() => Console.log("Captured"))
    .do(() => Console.warn("Also captured"))
    .return(() => "done");

const captured = await stack(handlers.Console.capture()).run(captureProgram);
// captured = { result: "done", logs: ["Captured"], warns: ["Also captured"], errors: [] }

// State.with(initial) - manages state
const stateProgram = () =>
  seq()
    .let(() => State.get<{count: number}>())
    .do((s) => State.put({count: s.count + 1}))
    .return(() => "incremented");

await stack(handlers.State.with({count: 0})).run(stateProgram);
// Returns: { result: "incremented", state: {count: 1} }

// Exception.tryCatch() - converts failures to Result
const failingProgram = () => Exception.fail({tag: "Error", msg: "Oops"});

const result = await stack(handlers.Exception.tryCatch()).run(failingProgram);
// result = { ok: false, error: {tag: "Error", msg: "Oops"} }

// Async.default() - handles sleep and await
const asyncProgram = () =>
  seq()
    .do(() => Async.sleep(100))
    .return(() => "waited");

await stack(handlers.Async.default()).run(asyncProgram);
// Waits 100ms, returns "waited"`,
    keyPoints: [
      "handlers.Console.live() - prints to actual console",
      "handlers.Console.capture() - records logs to array",
      "handlers.State.with(initial) - manages immutable state",
      "handlers.Exception.tryCatch() - converts failures to Result",
      "handlers.Async.default() - handles sleep/await",
      "All handlers are composable via stack()",
    ],
    tryItUrl: "/playground?example=built-in-handlers",
  },
  {
    id: "custom-handlers",
    title: "Writing Custom Handlers",
    tagline: "Implement your own effect interpreters",
    explanation: [
      "Custom handlers let you control exactly how effects execute in your application.",
      "Common use cases: logging to a file, sending metrics to a service, custom state persistence, or test mocks.",
      "Handler functions receive (instruction, next) where instruction contains operation name and args, next resumes the program.",
      "You can transform arguments, intercept operations, or provide completely custom behavior.",
    ],
    codeExample: `import { Handler } from "../typelang/mod.ts";
import { defineEffect } from "../typelang/mod.ts";

// 1. Define custom effect
const Metrics = defineEffect<"Metrics", {
  count(name: string, value: number): void;
  gauge(name: string, value: number): void;
  histogram(name: string, value: number): void;
}>("Metrics");

// 2. Create handler that sends to monitoring service
const datadogMetricsHandler = (apiKey: string): Handler => {
  const send = async (type: string, name: string, value: number) => {
    await fetch("https://api.datadoghq.com/api/v1/series", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "DD-API-KEY": apiKey,
      },
      body: JSON.stringify({
        series: [{ metric: name, points: [[Date.now() / 1000, value]], type }],
      }),
    });
  };

  return {
    name: "Metrics",
    handles: {
      count: (instr, next, ctx) => {
        const [name, value] = instr.args;
        send("count", name, value);  // Fire and forget
        return next(undefined);
      },
      gauge: (instr, next, ctx) => {
        const [name, value] = instr.args;
        send("gauge", name, value);
        return next(undefined);
      },
      histogram: (instr, next, ctx) => {
        const [name, value] = instr.args;
        send("histogram", name, value);
        return next(undefined);
      },
    },
  };
};

// 3. Test handler that records to array (no network calls)
const testMetricsHandler = (): Handler => {
  const recorded: Array<{type: string; name: string; value: number}> = [];

  return {
    name: "Metrics",
    handles: {
      count: (instr, next, ctx) => {
        const [name, value] = instr.args;
        recorded.push({type: "count", name, value});
        return next(undefined);
      },
      gauge: (instr, next, ctx) => {
        const [name, value] = instr.args;
        recorded.push({type: "gauge", name, value});
        return next(undefined);
      },
      histogram: (instr, next, ctx) => {
        const [name, value] = instr.args;
        recorded.push({type: "histogram", name, value});
        return next(undefined);
      },
    },
    // Expose recorded data for test assertions
    recorded,
  };
};

// Use in production
await stack(datadogMetricsHandler(API_KEY)).run(myProgram);

// Use in tests
const mock = testMetricsHandler();
await stack(mock).run(myProgram);
console.log(mock.recorded);  // Check what metrics were sent`,
    keyPoints: [
      "Handler = { name, handles: {...} }",
      "handles maps operation names to (instr, next, ctx) => result",
      "instr.args contains operation arguments as array",
      "next(value) resumes the program with value",
      "ctx provides cancellation signal and cleanup registration",
      "Handlers can have state (closures) for recording/caching",
      "Same effect, different handlers = different behavior",
    ],
    tryItUrl: "/playground?example=custom-handler",
  },
  {
    id: "handler-composition",
    title: "Composing Handler Stacks",
    tagline: "Layer multiple handlers for complex programs",
    explanation: [
      "Real programs use multiple effects, so you need multiple handlers in a stack.",
      "Handlers execute in order—later handlers can override earlier ones for the same effect.",
      "The order matters for effects that interact (e.g., Exception should wrap Console to catch log failures).",
      "stack() takes handlers in order and returns a runner that executes your program with all handlers active.",
    ],
    codeExample: `import { handlers, stack, seq } from "../typelang/mod.ts";
import { Console, State, Exception, Async } from "../typelang/effects.ts";

// Multi-effect program
const complexProgram = () =>
  seq()
    .do(() => Console.log("Starting..."))
    .let(() => State.get<{count: number}>())
    .do(() => Async.sleep(50))
    .when(
      (state) => state.count < 0,
      () => Exception.fail({tag: "NegativeCount"}),
    )
    .do((state) => Console.log(\`Count: \${state.count}\`))
    .do((state) => State.put({count: state.count + 1}))
    .return((state) => state.count + 1);

// Stack handlers in order
const result = await stack(
  handlers.Console.capture(),       // Capture logs
  handlers.State.with({count: 0}),  // Initial state
  handlers.Exception.tryCatch(),    // Convert failures to Result
  handlers.Async.default(),         // Handle sleep
).run(complexProgram);

// Result contains everything:
// {
//   ok: true,
//   value: { result: 1, state: {count: 1} },
//   logs: ["Starting...", "Count: 0"],
//   warns: [],
//   errors: []
// }

// Handler order matters!
// ❌ Wrong: Exception inside State means exception doesn't wrap state
await stack(
  handlers.State.with({count: 0}),
  handlers.Exception.tryCatch(),
).run(program);

// ✅ Right: Exception wraps State so failures capture final state
await stack(
  handlers.Exception.tryCatch(),
  handlers.State.with({count: 0}),
).run(program);`,
    keyPoints: [
      "stack(...handlers) composes multiple handlers",
      "Order matters—later handlers can override earlier ones",
      "Exception handler should be outer to catch all failures",
      "State handler should be inner to track state through failures",
      "Console.capture() should be outer to record all logs",
      "Test with different stacks: production vs development vs test",
    ],
    tryItUrl: "/playground?example=handler-composition",
  },
  {
    id: "cancellation-cleanup",
    title: "Cancellation & Cleanup",
    tagline: "Automatic resource disposal and graceful shutdown",
    explanation: [
      "typelang v0.3.0 introduces automatic cancellation and cleanup inspired by Effection's resource management.",
      "Cancellation is completely transparent: you never pass AbortSignal manually—it's handled automatically through the CancellationContext.",
      "Handlers receive a third parameter 'ctx' that provides access to the cancellation signal and cleanup registration.",
      "When Ctrl-C is pressed (SIGINT/SIGTERM), all registered cleanup callbacks execute in LIFO order (reverse of acquisition).",
      "Parallel operations (par.race, par.all) automatically cancel losing/failed branches and run their cleanup callbacks.",
    ],
    codeExample: `import { Handler, stack } from "../typelang/mod.ts";

// 1. Cancelable HTTP request handler
const httpHandler = (): Handler => ({
  name: "Http",
  handles: {
    get: async (instr, next, ctx) => {
      const [url] = instr.args;
      // Pass ctx.signal to fetch for automatic cancellation
      return await fetch(url, { signal: ctx.signal });
    },
  },
});

// 2. File handler with cleanup
const fileHandler = (): Handler => ({
  name: "File",
  handles: {
    open: async (instr, next, ctx) => {
      const [path] = instr.args;
      const file = await Deno.open(path, { read: true });

      // Register cleanup callback (runs in LIFO order)
      ctx.onCancel(async () => {
        await file.close();
        console.log(\`Cleaned up file: \${path}\`);
      });

      return file;
    },
  },
});

// 3. Timer handler with cancellation
const timerHandler = (): Handler => ({
  name: "Timer",
  handles: {
    after: (instr, next, ctx) =>
      new Promise((resolve) => {
        const [ms, value] = instr.args;
        const timerId = setTimeout(() => resolve(value), ms);

        // Cleanup timer on cancellation
        ctx.onCancel(() => clearTimeout(timerId));
      }),
  },
});

// Usage: Press Ctrl-C → cleanup runs automatically
const program = () =>
  seq()
    .let(() => File.op.open("/tmp/data.txt"))
    .let(() => Timer.op.after(5000, "timeout"))
    .return((result) => result);

await stack(fileHandler(), timerHandler()).run(program);
// Ctrl-C → clearTimeout() and file.close() called in LIFO order`,
    keyPoints: [
      "ctx.signal provides AbortSignal for cancelable APIs (fetch, setTimeout)",
      "ctx.onCancel(cleanup) registers cleanup callbacks in LIFO order",
      "SIGINT/SIGTERM automatically trigger cleanup and graceful shutdown",
      "par.race() cancels losers; par.all() cancels siblings on failure",
      "Cleanup errors are logged but don't propagate (fail-safe)",
      "5-second default timeout prevents hung cleanup callbacks",
      "Register cleanup IMMEDIATELY after resource acquisition",
    ],
    tryItUrl: null,
  },
] as const;

const renderConcept = (concept: HandlerConcept, index: number): string => {
  const badges = [
    renderBadge({ label: `Concept ${index + 1}`, variant: "ghost" }),
  ].join("");

  const explanationHtml = concept.explanation
    .map((para) => `<p>${escapeHtml(para)}</p>`)
    .join("");

  const keyPointsHtml = concept.keyPoints
    .map((point) => `<li>${escapeHtml(point)}</li>`)
    .join("");

  const codeBlock: CodeBlock = {
    code: concept.codeExample,
    language: "typescript",
    filename: `${concept.id}-example.ts`,
    showLineNumbers: false,
    highlightLines: [],
  };

  const tryItBtn = concept.tryItUrl
    ? renderButton({
      label: "Try in Playground",
      variant: "primary",
      size: "md",
      href: concept.tryItUrl,
      htmx: null,
      icon: "▶",
      disabled: false,
    })
    : "";

  return `<article class="concept-card" id="concept-${concept.id}">
    <header class="concept-card__header">
      <div>
        <div class="concept-card__badges">${badges}</div>
        <h2 class="concept-card__title">${escapeHtml(concept.title)}</h2>
        <p class="concept-card__tagline">${escapeHtml(concept.tagline)}</p>
      </div>
    </header>

    <section class="concept-card__explanation">
      <h3>Understanding ${escapeHtml(concept.title.split("?")[0] || concept.title)}</h3>
      ${explanationHtml}
    </section>

    <section class="concept-card__code">
      <h3>Code Example</h3>
      ${renderCodeBlock(codeBlock)}
    </section>

    <section class="concept-card__key-points">
      <h3>Key Points</h3>
      <ul class="key-points-list">${keyPointsHtml}</ul>
    </section>

    ${tryItBtn ? `<footer class="concept-card__footer">${tryItBtn}</footer>` : ""}
  </article>`;
};

const renderNavSidebar = (activeId: string): string => {
  const navItems = concepts
    .map((concept, index) => {
      const active = concept.id === activeId;
      const activeClass = active ? " concept-nav-item--active" : "";
      const shortLabel = concept.title.includes("?")
        ? concept.title.split("?")[0] + "?"
        : concept.title.split(" ").slice(0, 2).join(" ");
      return `<li>
        <a
          href="#concept-${concept.id}"
          class="concept-nav-item${activeClass}"
          data-concept="${concept.id}"
        >
          <span class="concept-nav-number">${index + 1}</span>
          <span class="concept-nav-label">${escapeHtml(shortLabel)}</span>
        </a>
      </li>`;
    })
    .join("");

  return `<aside class="learn-sidebar">
    <div class="learn-sidebar__header">
      <h2>Handlers</h2>
      <p>Effect interpretation and composition</p>
    </div>
    <nav class="concept-nav">
      <ul>${navItems}</ul>
    </nav>
    <div class="learn-sidebar__footer">
      <p>Previous: <a href="/learn/effects">← Effects</a></p>
      <p>Next: <a href="/learn/subset">Subset →</a></p>
    </div>
  </aside>`;
};

export const renderLearnHandlersPage = (): string => {
  const conceptsHtml = concepts.map((concept, index) => renderConcept(concept, index)).join("");
  const sidebar = renderNavSidebar("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Learn Handlers - typelang</title>
    <meta name="description" content="Master handler composition in typelang: built-in handlers, writing custom handlers, and composing handler stacks for complex programs." />
    <meta name="color-scheme" content="light dark" />
    <script src="https://unpkg.com/htmx.org@2.0.7"></script>
    <link rel="stylesheet" href="/static/app.css?v=4" />
    <link rel="stylesheet" href="/static/learn.css?v=4" />
  </head>
  <body class="learn-page">
    <header class="learn-header">
      <nav class="learn-breadcrumb">
        <a href="/">Home</a>
        <span>→</span>
        <a href="/learn">Learn</a>
        <span>→</span>
        <span>Handlers</span>
      </nav>
      <h1>Learn Effect Handlers</h1>
      <p class="learn-header__subtitle">
        Master handler composition: understand built-in handlers, write custom interpreters,
        and compose handler stacks for production applications.
      </p>
      <div class="learn-header__badges">
        ${renderBadge({ label: "~25 min", variant: "ghost" })}
        ${renderBadge({ label: "Advanced", variant: "error" })}
      </div>
    </header>

    <div class="learn-layout">
      ${sidebar}
      <main class="learn-content">
        ${conceptsHtml}
      </main>
    </div>

    <footer class="learn-footer">
      <div class="learn-footer__nav">
        <a href="/learn/effects" class="learn-footer__link learn-footer__link--back">
          ← Back to Effects
        </a>
        <a href="/learn/subset" class="learn-footer__link learn-footer__link--next">
          Next: Learn Subset →
        </a>
      </div>
    </footer>
  </body>
</html>`;
};
