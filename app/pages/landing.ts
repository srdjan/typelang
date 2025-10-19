// app/pages/landing.ts
// Landing page with hero, value propositions, and quick comparisons.

import { match } from "../../typelang/match.ts";
import {
  type Badge,
  type Button,
  highlightTypeScript,
  renderBadge,
  renderButton,
  renderCard,
} from "../components/ui.ts";

type BoolTag =
  | Readonly<{ tag: "True" }>
  | Readonly<{ tag: "False" }>;

const boolTags: readonly BoolTag[] = [
  { tag: "False" } as const,
  { tag: "True" } as const,
] as const;

const toBoolTag = (flag: boolean): BoolTag => boolTags[Number(flag)];

const escapeHtml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll(
    '"',
    "&quot;",
  )
    .replaceAll("'", "&#039;");

// Comparison examples
type ComparisonExample = Readonly<{
  id: string;
  title: string;
  traditional: Readonly<{ code: string; issues: readonly string[] }>;
  typelang: Readonly<{ code: string; benefits: readonly string[] }>;
}>;

const comparisonExamples: readonly ComparisonExample[] = [
  {
    id: "mutation",
    title: "State Management",
    traditional: {
      code: `// Mutation everywhere
let count = 0;
function increment() {
  count++;  // Side effect!
  console.log(count);  // Another side effect!
  return count;
}`,
      issues: [
        "Hidden mutation makes testing hard",
        "Side effects not tracked in types",
        "No guarantee of execution order",
        "Cannot safely parallelize",
      ],
    },
    typelang: {
      code: `// Pure transformation
const increment = () =>
  seq()
    .let(() => State.get<{count: number}>())
    .let((state) => ({count: state.count + 1}))
    .do((next) => Console.op.log(\`\${next.count}\`))
    .do((next) => State.put(next))
    .return((next) => next.count);`,
      benefits: [
        "All effects tracked in type signature",
        "Pure functions = easy testing",
        "Explicit sequencing with seq()",
        "Handler swapping for different contexts",
      ],
    },
  },
  {
    id: "branching",
    title: "Conditional Logic",
    traditional: {
      code: `// if/else branching
function processConfig(input: string | undefined) {
  if (!input) {
    throw new Error("Missing input");
  }
  if (input === "beta") {
    return { mode: "beta" };
  } else if (input === "stable") {
    return { mode: "stable" };
  } else {
    throw new Error(\`Unknown: \${input}\`);
  }
}`,
      issues: [
        "Throws hidden exceptions",
        "Non-exhaustive cases",
        "Hard to extend",
        "Implicit control flow",
      ],
    },
    typelang: {
      code: `// Pattern matching
type Mode = {tag: "Beta"} | {tag: "Stable"};

const processConfig = (input: string | undefined) =>
  match(presence(input), {
    Missing: () => Exception.op.fail({tag: "MissingInput"}),
    Present: ({value}) =>
      match(identifyMode(value), {
        Beta: () => ({tag: "Beta" as const}),
        Stable: () => ({tag: "Stable" as const}),
        Unknown: ({value: v}) =>
          Exception.op.fail({tag: "UnknownMode", value: v}),
      }),
  });`,
      benefits: [
        "Exhaustive pattern matching",
        "Errors as typed values",
        "No hidden exceptions",
        "Compiler enforces all cases",
      ],
    },
  },
  {
    id: "async",
    title: "Async Orchestration",
    traditional: {
      code: `// Promise hell
async function loadData() {
  try {
    const user = await fetchUser();
    const posts = await fetchPosts(user.id);
    const comments = await fetchComments(posts[0].id);
    return { user, posts, comments };
  } catch (e) {
    console.error(e);  // Side effect!
    throw e;  // Re-throw
  }
}`,
      issues: [
        "Sequential when could be parallel",
        "Side effects in error handling",
        "Exceptions escape type system",
        "Hard to test error paths",
      ],
    },
    typelang: {
      code: `// Effect-based async
const loadData = () =>
  seq()
    .let(() => fetchUser())
    .let((user) =>
      par.all({
        posts: () => fetchPosts(user.id),
        metrics: () => fetchMetrics(user.id),
      })
    )
    .let((parallel) =>
      fetchComments(parallel.posts[0]?.id)
    )
    .return((comments, ctx) => ({
      user: ctx!["v1"],
      posts: (ctx!["v2"] as any).posts,
      comments,
    }));`,
      benefits: [
        "Explicit parallelism with par.all()",
        "No try/catch needed",
        "Exception handler provides Result type",
        "All effects visible in signature",
      ],
    },
  },
] as const;

const renderComparisonContent = (activeId: string): string => {
  const active = comparisonExamples.find((ex) => ex.id === activeId) ?? comparisonExamples[0];

  const issues = active.traditional.issues
    .map((issue) => `<li class="issue-item">❌ ${escapeHtml(issue)}</li>`)
    .join("");

  const benefits = active.typelang.benefits
    .map((benefit) => `<li class="benefit-item">✅ ${escapeHtml(benefit)}</li>`)
    .join("");

  return `<div class="comparison-split">
    <div class="comparison-side comparison-side--traditional">
      <h4>Traditional TypeScript</h4>
      <pre class="code-preview"><code>${highlightTypeScript(active.traditional.code)}</code></pre>
      <ul class="comparison-notes">${issues}</ul>
    </div>
    <div class="comparison-divider">
      <span class="comparison-arrow">→</span>
    </div>
    <div class="comparison-side comparison-side--typelang">
      <h4>typelang</h4>
      <pre class="code-preview"><code>${highlightTypeScript(active.typelang.code)}</code></pre>
      <ul class="comparison-notes">${benefits}</ul>
    </div>
  </div>`;
};

const renderComparisonWidget = (activeId: string): string => {
  const tabs = comparisonExamples
    .map((ex) => {
      const activeClass = match(toBoolTag(ex.id === activeId), {
        True: () => " comparison-tab--active",
        False: () => "",
      });
      return `<button
        class="comparison-tab${activeClass}"
        hx-get="/comparison-widget/${ex.id}"
        hx-target="#comparison-content"
        hx-swap="innerHTML"
        hx-push-url="false"
      >
        ${escapeHtml(ex.title)}
      </button>`;
    })
    .join("");

  return `<div class="comparison-widget">
    <div class="comparison-tabs">${tabs}</div>
    <div id="comparison-content" class="comparison-content">
      ${renderComparisonContent(activeId)}
    </div>
  </div>`;
};

// Value propositions
type ValueProp = Readonly<{
  icon: string;
  title: string;
  description: string;
  features: readonly string[];
}>;

const valueProps: readonly ValueProp[] = [
  {
    icon: "🔍",
    title: "Effect Tracking",
    description: "All side effects visible in function signatures. No surprises.",
    features: [
      "Type system tracks Console, State, Exception, Async",
      "Compiler errors if effects not handled",
      "Documentation via types",
      "Refactoring confidence",
    ],
  },
  {
    icon: "🛡️",
    title: "Zero Runtime Errors",
    description: "Pattern matching and Result types eliminate exceptions.",
    features: [
      "Exhaustive case analysis",
      "Errors as typed values",
      "No try/catch needed",
      "Test error paths easily",
    ],
  },
  {
    icon: "🧬",
    title: "Enforced Purity",
    description: "Subset linter prevents mutations, loops, and if/else.",
    features: [
      "No classes or inheritance",
      "Immutable data structures",
      "Expression-oriented code",
      "CI-enforced constraints",
    ],
  },
] as const;

const renderValueProp = (prop: ValueProp): string => {
  const features = prop.features
    .map((feature) => `<li>${escapeHtml(feature)}</li>`)
    .join("");

  return `<article class="value-prop">
    <div class="value-prop__icon">${prop.icon}</div>
    <h3 class="value-prop__title">${escapeHtml(prop.title)}</h3>
    <p class="value-prop__description">${escapeHtml(prop.description)}</p>
    <ul class="value-prop__features">${features}</ul>
  </article>`;
};

// Mini demo in hero
const renderHeroDemo = (): string => {
  const miniDemoBtn: Button = {
    label: "Run Mini Demo",
    variant: "primary",
    size: "md",
    href: null,
    htmx: {
      get: null,
      post: "/api/mini-demo",
      target: "#hero-demo-output",
      swap: "innerHTML",
    },
    icon: "▶",
    disabled: false,
  };

  const heroCode = `// Counter with Console + State
const tick = () =>
  seq()
    .let(() => State.get<{count: number}>())
    .let((s) => ({count: s.count + 1}))
    .do((next) => Console.op.log(\`Count: \${next.count}\`))
    .do((next) => State.put(next))
    .return((next) => next.count);`;

  return `<div class="hero-demo">
    <div class="hero-demo__code">
      <pre class="code-preview"><code>${highlightTypeScript(heroCode)}</code></pre>
    </div>
    <div class="hero-demo__controls">
      ${renderButton(miniDemoBtn)}
    </div>
    <div id="hero-demo-output" class="hero-demo__output">
      <p class="hero-demo__placeholder">Click "Run" to see effects in action</p>
    </div>
  </div>`;
};

// Learning paths
type LearningPath = Readonly<{
  title: string;
  description: string;
  href: string;
  icon: string;
  duration: string;
}>;

const learningPaths: readonly LearningPath[] = [
  {
    title: "New to Functional Programming",
    description: "Start with the basics: seq(), match(), pipe(), and simple effects.",
    href: "/learn/basics",
    icon: "🌱",
    duration: "~15 min",
  },
  {
    title: "Experienced FP Developer",
    description: "Jump to algebraic effects, handler composition, and advanced patterns.",
    href: "/learn/effects",
    icon: "⚡",
    duration: "~10 min",
  },
  {
    title: "Interactive Playground",
    description: "Experiment with live code, try examples, and see instant results.",
    href: "/playground",
    icon: "🎮",
    duration: "Explore at your pace",
  },
] as const;

const renderLearningPath = (path: LearningPath): string => {
  const badge: Badge = {
    label: path.duration,
    variant: "ghost",
  };

  return `<a href="${escapeHtml(path.href)}" class="learning-path">
    <div class="learning-path__icon">${path.icon}</div>
    <div class="learning-path__content">
      <h3 class="learning-path__title">${escapeHtml(path.title)}</h3>
      <p class="learning-path__description">${escapeHtml(path.description)}</p>
    </div>
    <div class="learning-path__meta">
      ${renderBadge(badge)}
      <span class="learning-path__arrow">→</span>
    </div>
  </a>`;
};

// Main landing page
export const renderLandingPage = (): string => {
  const valuePropsHtml = valueProps.map(renderValueProp).join("");
  const learningPathsHtml = learningPaths.map(renderLearningPath).join("");
  const comparisonWidgetHtml = renderComparisonWidget("mutation");

  const exploreBtn: Button = {
    label: "Explore Demos",
    variant: "primary",
    size: "lg",
    href: "/demos",
    htmx: null,
    icon: null,
    disabled: false,
  };

  const docsBtn: Button = {
    label: "Read the Guide",
    variant: "outline",
    size: "lg",
    href: "/docs",
    htmx: null,
    icon: null,
    disabled: false,
  };

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>typelang - Functional TypeScript with Algebraic Effects</title>
    <meta name="description" content="A strictly functional TypeScript subset with algebraic effects, enforced purity, and zero runtime errors. Build reliable software with effect tracking and exhaustive pattern matching." />
    <meta name="color-scheme" content="light dark" />
    <meta property="og:title" content="typelang - Functional TypeScript with Algebraic Effects" />
    <meta property="og:description" content="Build reliable software with effect tracking, enforced purity, and zero runtime errors." />
    <meta property="og:type" content="website" />
    <script src="https://unpkg.com/htmx.org@2.0.3"></script>
    <link rel="stylesheet" href="/static/app.css?v=4" />
    <link rel="stylesheet" href="/static/landing.css?v=4" />
  </head>
  <body class="landing-page">
    <nav class="landing-header">
      <div class="landing-header__container">
        <a href="/" class="landing-header__logo">typelang</a>
        <a href="https://github.com/srdjan/typelang" class="landing-header__github" aria-label="View on GitHub" target="_blank" rel="noopener noreferrer">
          <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
        </a>
      </div>
    </nav>
    <header class="landing-hero">
      <div class="landing-hero__content">
        <h1 class="landing-hero__title">
          What if TypeScript<br/>was <em>purely functional</em>?
        </h1>
        <p class="landing-hero__subtitle">
          typelang is a strict functional subset of TypeScript with algebraic effects,
          enforced purity, and zero runtime errors. Build reliable software with
          effect tracking and exhaustive pattern matching.
        </p>
        <div class="landing-hero__actions">
          ${renderButton(exploreBtn)}
          ${renderButton(docsBtn)}
        </div>
        <div class="landing-hero__badges">
          ${renderBadge({ label: "Zero Dependencies", variant: "ghost" })}
          ${renderBadge({ label: "100% TypeScript", variant: "ghost" })}
          ${renderBadge({ label: "Effect Tracking", variant: "ghost" })}
          ${renderBadge({ label: "Subset Enforced", variant: "ghost" })}
        </div>
      </div>
      <div class="landing-hero__demo">
        ${renderHeroDemo()}
      </div>
    </header>

    <section class="landing-section landing-section--comparison">
      <div class="landing-section__header">
        <h2>See the Difference</h2>
        <p>Compare traditional TypeScript with typelang's functional approach</p>
      </div>
      ${comparisonWidgetHtml}
    </section>

    <section class="landing-section landing-section--value-props">
      <div class="landing-section__header">
        <h2>Why typelang?</h2>
        <p>Three core principles for reliable software</p>
      </div>
      <div class="value-props-grid">
        ${valuePropsHtml}
      </div>
    </section>

    <section class="landing-section landing-section--learning-paths">
      <div class="landing-section__header">
        <h2>Start Learning</h2>
        <p>Choose your path based on your experience level</p>
      </div>
      <div class="learning-paths-grid">
        ${learningPathsHtml}
      </div>
    </section>

    <section class="landing-section landing-section--cta">
      <div class="landing-cta">
        <h2>Ready to build with effects?</h2>
        <p>
          Explore interactive demos, try the playground, or dive into the comprehensive guide.
        </p>
        ${renderButton(exploreBtn)}
      </div>
    </section>

    <footer class="landing-footer">
      <p>
        Built with typelang's effect runtime, strict functional subset, and lightweight Deno server.
      </p>
      <nav class="landing-footer__nav">
        <a href="/demos">Demos</a>
        <a href="/playground">Playground</a>
        <a href="/docs">Documentation</a>
        <a href="/examples">Examples</a>
        <a href="https://github.com/srdjan/typelang">GitHub</a>
      </nav>
    </footer>
  </body>
</html>`;
};

// Comparison widget partial (for HTMX updates)
export const renderComparisonWidgetPartial = (exampleId: string): string => {
  return renderComparisonContent(exampleId);
};
