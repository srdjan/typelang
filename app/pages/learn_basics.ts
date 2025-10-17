// app/pages/learn_basics.ts
// Learning path: Basic concepts (seq, match, pipe, unions).

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

type Concept = Readonly<{
  id: string;
  title: string;
  tagline: string;
  explanation: readonly string[];
  codeExample: string;
  keyPoints: readonly string[];
  tryItUrl: string | null;
}>;

const concepts: readonly Concept[] = [
  {
    id: "seq",
    title: "Sequential Building with seq()",
    tagline: "Compose computations step by step with automatic context threading",
    explanation: [
      "seq() is typelang's monadic builder for sequential programs. Think of it as a pipeline where each step can access all previous results.",
      "Each .let() step binds a new variable into the context. .do() runs a side effect without binding. .return() produces the final value.",
      "The context is automatically typed—TypeScript infers what's available at each step.",
      "No mutation needed: each step produces a new frozen context object.",
    ],
    codeExample: `// Build a user profile sequentially
const buildProfile = (userId: string) =>
  seq()
    .let("user", () => fetchUser(userId))
    .let("posts", ({user}) => fetchPosts(user.id))
    .let("followers", ({user}) => fetchFollowers(user.id))
    .do(({user}) => Console.op.log(\`Building profile for \${user.name}\`))
    .return(({user, posts, followers}) => ({
      user,
      postCount: posts.length,
      followerCount: followers.length,
    }));

// TypeScript knows the context type at each step:
// After .let("user", ...):   {user: User}
// After .let("posts", ...):  {user: User, posts: Post[]}
// After .let("followers", ...): {user: User, posts: Post[], followers: User[]}`,
    keyPoints: [
      ".let(name, fn) binds the result of fn to name in the context",
      ".do(fn) runs an effect without adding to context",
      ".when(pred, fn) conditionally runs an effect",
      ".return(fn) produces the final value",
      "Context is typed automatically—no manual type annotations needed",
    ],
    tryItUrl: "/playground?example=seq-basic",
  },
  {
    id: "match",
    title: "Pattern Matching with match()",
    tagline: "Exhaustive branching that replaces if/else",
    explanation: [
      "match() is typelang's replacement for if/else. It works on discriminated unions (types with a 'tag' property).",
      "The compiler ensures all cases are handled. Forget a case? Compilation error.",
      "Unlike if/else, match() is an expression—it always returns a value.",
      "Perfect for modeling state machines, error handling, and option types.",
    ],
    codeExample: `// Define a discriminated union
type LoadingState =
  | Readonly<{tag: "Idle"}>
  | Readonly<{tag: "Loading"}>
  | Readonly<{tag: "Success"; data: User}>
  | Readonly<{tag: "Error"; message: string}>;

// Match exhaustively
const renderLoadingState = (state: LoadingState): string =>
  match(state, {
    Idle: () => "Click to load",
    Loading: () => "Loading...",
    Success: ({data}) => \`Welcome, \${data.name}!\`,
    Error: ({message}) => \`Error: \${message}\`,
  });

// Forget a case? TypeScript error!
// match(state, {
//   Idle: () => "...",
//   Loading: () => "...",
//   // Missing Success and Error!
// });`,
    keyPoints: [
      "Works on discriminated unions (objects with 'tag' property)",
      "All cases must be handled (exhaustive checking)",
      "Returns a value (unlike if/else which is a statement)",
      "Destructure fields in each case handler",
      "Compiler catches missing cases at build time",
    ],
    tryItUrl: "/playground?example=match-basic",
  },
  {
    id: "pipe",
    title: "Function Composition with pipe()",
    tagline: "Chain transformations left-to-right",
    explanation: [
      "pipe() chains function calls in a readable, left-to-right flow.",
      "Instead of f(g(h(x))), write pipe(x, h, g, f).",
      "Each function receives the output of the previous function.",
      "Great for data transformations, validation chains, and parsing.",
    ],
    codeExample: `// Traditional nested calls (hard to read)
const result = JSON.stringify(
  Object.fromEntries(
    Object.entries(data)
      .filter(([k, v]) => v !== null)
      .map(([k, v]) => [k.toLowerCase(), v])
  )
);

// With pipe() (reads top to bottom)
const result = pipe(
  data,
  Object.entries,
  (entries) => entries.filter(([k, v]) => v !== null),
  (entries) => entries.map(([k, v]) => [k.toLowerCase(), v]),
  Object.fromEntries,
  JSON.stringify,
);

// Real example: parse and validate
type ParseError = {tag: "InvalidFormat"} | {tag: "OutOfRange"};

const parseAge = (input: string): Age | ParseError =>
  pipe(
    input,
    (s) => parseInt(s, 10),
    (n) => isNaN(n) ? {tag: "InvalidFormat"} : n,
    (n) => n < 0 || n > 150 ? {tag: "OutOfRange"} : n,
  );`,
    keyPoints: [
      "First argument is the initial value",
      "Subsequent arguments are functions to apply in order",
      "Reads naturally left-to-right, top-to-bottom",
      "Type-safe: each function must accept the previous output",
      "Up to 9 functions supported (extend with more overloads if needed)",
    ],
    tryItUrl: "/playground?example=pipe-basic",
  },
  {
    id: "unions",
    title: "Data Modeling with Discriminated Unions",
    tagline: "Make illegal states unrepresentable",
    explanation: [
      "Model your domain with union types instead of classes and inheritance.",
      "Each variant has a 'tag' property to distinguish cases.",
      "The compiler ensures you handle all variants when matching.",
      "Prevents invalid state combinations at the type level.",
    ],
    codeExample: `// Bad: boolean flags create impossible states
type BadUser = {
  name: string;
  isGuest: boolean;
  isPremium: boolean;  // Can be both guest AND premium? 🤔
  email: string | null;
};

// Good: discriminated union
type User =
  | Readonly<{tag: "Guest"; sessionId: string}>
  | Readonly<{tag: "Registered"; email: string; name: string}>
  | Readonly<{tag: "Premium"; email: string; name: string; tier: "gold" | "platinum"}>;

// Now impossible states are impossible!
const getUserEmail = (user: User): string | null =>
  match(user, {
    Guest: () => null,
    Registered: ({email}) => email,
    Premium: ({email}) => email,
  });

// State machine example
type TrafficLight =
  | Readonly<{tag: "Red"; countdown: number}>
  | Readonly<{tag: "Yellow"}>
  | Readonly<{tag: "Green"; countdown: number}>;

const nextLight = (current: TrafficLight): TrafficLight =>
  match(current, {
    Red: ({countdown}) =>
      countdown > 0
        ? {tag: "Red", countdown: countdown - 1}
        : {tag: "Green", countdown: 30},
    Yellow: () => ({tag: "Red", countdown: 45}),
    Green: ({countdown}) =>
      countdown > 0
        ? {tag: "Green", countdown: countdown - 1}
        : {tag: "Yellow"},
  });`,
    keyPoints: [
      "Use 'tag' property to discriminate between variants",
      "Make each variant's shape explicit",
      "Impossible states become type errors",
      "Works perfectly with match() for exhaustive handling",
      "Better than inheritance: no hidden behavior, pure data",
    ],
    tryItUrl: "/playground?example=unions-basic",
  },
] as const;

const renderConcept = (concept: Concept, index: number): string => {
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
      <h3>Understanding ${escapeHtml(concept.title.split(" with ")[0])}</h3>
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
          <span class="concept-nav-label">${escapeHtml(concept.title.split(" with ")[0])}</span>
        </a>
      </li>`;
    })
    .join("");

  return `<aside class="learn-sidebar">
    <div class="learn-sidebar__header">
      <h2>Basics</h2>
      <p>Core concepts for typelang programming</p>
    </div>
    <nav class="concept-nav">
      <ul>${navItems}</ul>
    </nav>
    <div class="learn-sidebar__footer">
      <p>Next: <a href="/learn/effects">Learn Effects →</a></p>
    </div>
  </aside>`;
};

export const renderLearnBasicsPage = (): string => {
  const conceptsHtml = concepts.map((concept, index) => renderConcept(concept, index)).join("");
  const sidebar = renderNavSidebar("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Learn Basics - typelang</title>
    <meta name="description" content="Master the core concepts of typelang: seq(), match(), pipe(), and discriminated unions." />
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
        <span>Basics</span>
      </nav>
      <h1>Learn the Basics</h1>
      <p class="learn-header__subtitle">
        Master typelang's core building blocks: sequential composition, pattern matching,
        function pipelines, and algebraic data types.
      </p>
      <div class="learn-header__badges">
        ${renderBadge({ label: "~15 min", variant: "ghost" })}
        ${renderBadge({ label: "Beginner Friendly", variant: "ok" })}
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
        <a href="/learn" class="learn-footer__link learn-footer__link--back">
          ← Back to Learning Paths
        </a>
        <a href="/learn/effects" class="learn-footer__link learn-footer__link--next">
          Next: Learn Effects →
        </a>
      </div>
    </footer>
  </body>
</html>`;
};
