// app/pages/learn_effects.ts
// Learning path: Effect system deep dive.

import { match } from "../../typelang/match.ts";
import {
  type Badge,
  type CodeBlock,
  renderBadge,
  renderButton,
  renderCodeBlock,
} from "../components/ui.ts";

const escapeHtml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll(
    '"',
    "&quot;",
  )
    .replaceAll("'", "&#039;");

type EffectConcept = Readonly<{
  id: string;
  title: string;
  tagline: string;
  explanation: readonly string[];
  codeExample: string;
  keyPoints: readonly string[];
  tryItUrl: string | null;
}>;

const concepts: readonly EffectConcept[] = [
  {
    id: "what-are-effects",
    title: "What Are Algebraic Effects?",
    tagline: "Understanding effects as capabilities tracked by types",
    explanation: [
      "Effects are capabilities your program needs to execute—like logging, reading state, failing with errors, or waiting on async operations.",
      "In typelang, effects are NOT performed directly. Instead, you create effect operations that describe what you want to do.",
      "The runtime resolves these operations through handlers, keeping your code pure and testable.",
      "Think of effects as 'resumable exceptions'—you can intercept them, transform them, or provide custom behavior without touching the original code.",
    ],
    codeExample: `// Traditional imperative (hidden effects)
function processUser(id: string) {
  console.log(\`Processing \${id}\`);  // Hidden effect!
  const user = fetchUser(id);          // Hidden IO!
  if (!user) throw new Error("404");   // Hidden exception!
  return user;
}

// typelang (explicit effects)
const processUser = (id: string) =>
  seq()
    .do(() => Console.op.log(\`Processing \${id}\`))
    .let("user", () => fetchUser(id))
    .let("result", ({user}) =>
      match(option(user), {
        None: () => Exception.op.fail({tag: "NotFound", id}),
        Some: ({value}) => value,
      })
    )
    .return(({result}) => result);

// Type signature reveals all effects:
// Eff<User, Console | Exception | Http>`,
    keyPoints: [
      "Effects are tracked in the type signature as Eff<A, E>",
      "A is the return value, E is the union of effect capabilities",
      "Operations like Console.op.log() return Eff, not void",
      "Handlers interpret effects at runtime—swap handlers for different contexts",
      "Your code stays pure; side effects happen in handlers",
    ],
    tryItUrl: "/playground?example=what-are-effects",
  },
  {
    id: "defining-effects",
    title: "Defining Custom Effects",
    tagline: "Create your own effect types with defineEffect()",
    explanation: [
      "Custom effects let you model domain-specific capabilities like logging, metrics, HTTP calls, or database access.",
      "Use defineEffect() to declare an effect name and its operation signatures.",
      "The type system tracks which effects your program uses—unhandled effects cause compile errors.",
      "Effect definitions are pure data—no implementation yet. Handlers provide the implementation.",
    ],
    codeExample: `// 1. Define the effect specification
import { defineEffect, type Eff } from "../typelang/mod.ts";

type LogLevel = "debug" | "info" | "warn" | "error";

const Logger = defineEffect<"Logger", {
  log(level: LogLevel, message: string): void;
  metric(name: string, value: number): void;
}>("Logger");

// 2. Use the effect in your program
const recordRequest = (path: string, durationMs: number) =>
  seq()
    .do(() => Logger.op.log("info", \`Request: \${path}\`))
    .do(() => Logger.op.metric("request.duration", durationMs))
    .return(() => ({path, durationMs}));

// 3. Type signature shows Logger capability needed
// recordRequest: (path: string, duration: number) =>
//   Eff<{path: string, durationMs: number}, Capability<"Logger", ...>>

// 4. Provide handler at runtime (next section!)`,
    keyPoints: [
      "defineEffect<Name, Spec>(name) creates an effect definition",
      "Name is a unique string identifier for the effect",
      "Spec defines operations as function signatures",
      "Access operations via effect.op.operationName(...args)",
      "Operations return Eff<ReturnType, Capability<Name, Spec>>",
    ],
    tryItUrl: "/playground?example=define-custom-effect",
  },
  {
    id: "built-in-effects",
    title: "Built-in Effects",
    tagline: "Console, State, Exception, Async, and more",
    explanation: [
      "typelang ships with 5 core effects that cover most use cases: Console, State, Exception, Async, and Env.",
      "Console provides log(), warn(), and error() for structured logging without side effects.",
      "State gives you get(), put(), and modify() for immutable state threading.",
      "Exception enables fail() for typed error handling—no thrown exceptions!",
      "Async offers sleep() and await() for async operations without exposing Promises.",
    ],
    codeExample: `import { Console, State, Exception, Async } from "../typelang/effects.ts";

// Console effect
const greet = (name: string) =>
  seq()
    .do(() => Console.op.log(\`Hello, \${name}!\`))
    .do(() => Console.op.warn("This is a warning"))
    .return(() => \`Greeted \${name}\`);

// State effect
const increment = () =>
  seq()
    .let("current", () => State.get<{count: number}>())
    .let("next", ({current}) => ({count: current.count + 1}))
    .do(({next}) => State.put(next))
    .return(({next}) => next.count);

// Exception effect
const divide = (a: number, b: number) =>
  seq()
    .when(
      () => b === 0,
      () => Exception.op.fail({tag: "DivisionByZero"}),
    )
    .return(() => a / b);

// Async effect
const delay = (ms: number, message: string) =>
  seq()
    .do(() => Async.op.sleep(ms))
    .do(() => Console.op.log(message))
    .return(() => message);

// Combine multiple effects
const complexProgram = () =>
  seq()
    .let("state", () => State.get<{count: number}>())
    .do(({state}) => Console.op.log(\`Count: \${state.count}\`))
    .do(() => Async.op.sleep(100))
    .let("next", ({state}) => ({count: state.count + 1}))
    .do(({next}) => State.put(next))
    .return(({next}) => next);`,
    keyPoints: [
      "Console: log(), warn(), error() for structured logging",
      "State: get(), put(), modify() for immutable state",
      "Exception: fail() for typed errors (no throws!)",
      "Async: sleep(), await() for async operations",
      "Env: getEnv() for environment variable access",
      "All effects compose naturally with seq() and par()",
    ],
    tryItUrl: "/playground?example=built-in-effects",
  },
  {
    id: "effect-composition",
    title: "Composing Multiple Effects",
    tagline: "Combine effects naturally with seq() and par()",
    explanation: [
      "Programs often need multiple effects: logging + state + async + error handling.",
      "The type system tracks the union of all effects used in your program.",
      "seq() threads effects sequentially—each step can use any effect.",
      "par() runs effects concurrently—great for independent operations.",
      "The runtime automatically manages the handler stack for all effects.",
    ],
    codeExample: `// Multi-effect program
type AppState = Readonly<{
  users: readonly User[];
  lastFetch: string;
}>;

const fetchAndCacheUsers = () =>
  seq()
    // Console effect
    .do(() => Console.op.log("Fetching users..."))

    // Async effect (parallel fetch)
    .let("users", () =>
      par.all({
        active: () => fetchActiveUsers(),
        inactive: () => fetchInactiveUsers(),
      })
    )

    // State effect (update cache)
    .let("allUsers", ({users}) => [...users.active, ...users.inactive])
    .do(({allUsers}) =>
      State.put<AppState>({
        users: allUsers,
        lastFetch: new Date().toISOString(),
      })
    )

    // Exception effect (validate)
    .when(
      ({allUsers}) => allUsers.length === 0,
      () => Exception.op.fail({tag: "NoUsers"}),
    )

    // Console effect (success)
    .do(({allUsers}) =>
      Console.op.log(\`Cached \${allUsers.length} users\`)
    )

    .return(({allUsers}) => allUsers);

// Type signature shows all effects:
// Eff<User[], Console | State | Exception | Async>`,
    keyPoints: [
      "Effect types form a union: Eff<A, E1 | E2 | E3>",
      "seq() allows any effect in any step",
      "par() runs effects concurrently when possible",
      "Handlers resolve effects in order—last registered wins",
      "No limit on how many effects you can combine",
    ],
    tryItUrl: "/playground?example=effect-composition",
  },
] as const;

const renderConcept = (concept: EffectConcept, index: number): string => {
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
      <h3>Understanding ${escapeHtml(concept.title.split(":")[0] || concept.title)}</h3>
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
      return `<li>
        <a
          href="#concept-${concept.id}"
          class="concept-nav-item${activeClass}"
          data-concept="${concept.id}"
        >
          <span class="concept-nav-number">${index + 1}</span>
          <span class="concept-nav-label">${
        escapeHtml(concept.title.split(" ")[0] + " " + concept.title.split(" ")[1])
      }</span>
        </a>
      </li>`;
    })
    .join("");

  return `<aside class="learn-sidebar">
    <div class="learn-sidebar__header">
      <h2>Effects</h2>
      <p>Deep dive into algebraic effects</p>
    </div>
    <nav class="concept-nav">
      <ul>${navItems}</ul>
    </nav>
    <div class="learn-sidebar__footer">
      <p>Previous: <a href="/learn/basics">← Basics</a></p>
      <p>Next: <a href="/learn/handlers">Handlers →</a></p>
    </div>
  </aside>`;
};

export const renderLearnEffectsPage = (): string => {
  const conceptsHtml = concepts.map((concept, index) => renderConcept(concept, index)).join("");
  const sidebar = renderNavSidebar("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Learn Effects - typelang</title>
    <meta name="description" content="Master algebraic effects in typelang: what they are, how to define custom effects, built-in effects, and composition patterns." />
    <meta name="color-scheme" content="light dark" />
    <script src="https://unpkg.com/htmx.org@2.0.3"></script>
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
        <span>Effects</span>
      </nav>
      <h1>Learn Algebraic Effects</h1>
      <p class="learn-header__subtitle">
        Deep dive into typelang's effect system: defining custom effects, using built-in effects,
        and composing multiple effects in real programs.
      </p>
      <div class="learn-header__badges">
        ${renderBadge({ label: "~20 min", variant: "ghost" })}
        ${renderBadge({ label: "Intermediate", variant: "accent" })}
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
        <a href="/learn/basics" class="learn-footer__link learn-footer__link--back">
          ← Back to Basics
        </a>
        <a href="/learn/handlers" class="learn-footer__link learn-footer__link--next">
          Next: Learn Handlers →
        </a>
      </div>
    </footer>
  </body>
</html>`;
};
