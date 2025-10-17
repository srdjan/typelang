// app/routes.ts
import { Routes } from "../server/types.ts";
import { html, isoNow, json, redirect } from "../server/http.ts";
import { demos, runDemo } from "./showcase.ts";
import type { DemoRun, ShowcaseDemo } from "./showcase.ts";
import { highlightCode } from "../server/highlight.ts";
import { match } from "../typelang/match.ts";

const ok = <T>(data: T) => json({ ok: true, data });

type BoolTag =
  | Readonly<{ tag: "True" }>
  | Readonly<{ tag: "False" }>;

const boolCases = [
  { tag: "False" } as const,
  { tag: "True" } as const,
] as const;

const toBoolTag = (flag: boolean): BoolTag => boolCases[Number(flag)];

type Option<T> =
  | Readonly<{ tag: "None" }>
  | Readonly<{ tag: "Some"; value: T }>;

const option = <T>(value: T | null | undefined): Option<T> =>
  [
    { tag: "None" } as const,
    { tag: "Some", value: value as T } as const,
  ][Number(value !== null && value !== undefined)];

type Highlight = Readonly<{ title: string; copy: string; bullets: readonly string[] }>;

const highlights: readonly Highlight[] = [
  {
    title: "Strict Functional Subset",
    copy: "No classes, no mutation, no loops—typelang enforces expression-oriented TypeScript.",
    bullets: [
      "Subset linter forbids `if`/`else`, loops, mutation, and `new`.",
      "Pure data builders via `seq()` orchestrate complex workflows.",
      "Pattern matching replaces control flow with exhaustive cases.",
    ],
  },
  {
    title: "Algebraic Effects Runtime",
    copy:
      "Composable handler stack resolves Console, State, Exception, and Async effects at runtime.",
    bullets: [
      "Runtime `stack(...handlers).run()` keeps application code pure.",
      "Handlers capture logs, state snapshots, and structured errors.",
      "Type-safe capabilities surface unhandled effects during dev.",
    ],
  },
  {
    title: "Lightweight HTTP Server",
    copy: "A 250-line Deno server with middleware composition and HTMX-friendly routing.",
    bullets: [
      "Middleware chain: error boundary, logging, CORS, rate limit, auth stub.",
      "Declarative `Routes` array keeps handler code functional and testable.",
      "Static assets served via built-in middleware—zero external deps.",
    ],
  },
  {
    title: "Type-Safe Effect Handling",
    copy:
      "Handlers.Exception.tryCatch() lifts failures into data so UI code never catches thrown errors.",
    bullets: [
      "Console.capture() pipes structured logs into the showcase.",
      "State.with(initial) threads immutable state through seq().",
      "Async.default() integrates timers without exposing Promises.",
    ],
  },
] as const;

const renderPage = (selected: ShowcaseDemo, run: DemoRun): string => {
  const navItems = demos.map((demo) => renderNavItem(demo, selected.id)).join("");
  const featureCards = highlights.map(renderHighlightCard).join("");
  const showcaseCard = renderDemoCard(selected, run);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>typelang Showcase</title>
    <meta name="description" content="Interactive typelang showcase demonstrating algebraic effects, functional subset enforcement, and the Deno HTTP runtime." />
    <meta name="color-scheme" content="light dark" />
    <script src="https://unpkg.com/htmx.org@2.0.3"></script>
    <link rel="stylesheet" href="/static/app.css" />
  </head>
  <body>
    <header class="hero">
      <div class="hero__content">
        <h1>typelang × Deno Showcase</h1>
        <p>
          Explore a strictly functional TypeScript subset with algebraic effects, sequenced programs,
          and a no-dependency HTTP runtime. Every demo runs on the server and streams structured data
          back to the UI.
        </p>
        <div class="hero__meta">
          <span class="hero__badge">Zero Dependencies</span>
          <span class="hero__badge">Handlers: Console · State · Exception · Async</span>
          <span class="hero__badge">Functional subset enforced by tooling</span>
        </div>
      </div>
      <aside class="hero__cta">
        <div class="hero__card">
          <h2>Server Status</h2>
          <p>Health check endpoint responds with structured JSON.</p>
          <button
            class="button button--outline"
            hx-get="/health"
            hx-trigger="click"
            hx-target="#health-response"
            hx-swap="innerHTML"
          >
            Ping /health
          </button>
          <div id="health-response" class="hero__response"></div>
        </div>
      </aside>
    </header>
    <main class="page">
      <section class="highlights">
        ${featureCards}
      </section>

      <section class="showcase">
        <aside class="showcase__nav" aria-label="Effect demos">
          <h2>Effect Demos</h2>
          <nav>
            <ul>
              ${navItems}
            </ul>
          </nav>
        </aside>

        <article id="demo-card" class="showcase__card" aria-live="polite">
          ${showcaseCard}
        </article>
      </section>
    </main>
    <footer class="footer">
      <p>
        Built with typelang's effect runtime, strict functional subset, and the lightweight Deno server.
        View the docs and tests in <code>docs/</code> and <code>tests/</code>.
      </p>
    </footer>
  </body>
</html>`;
};

const renderNavItem = (demo: ShowcaseDemo, activeId: string): string => {
  const active = toBoolTag(demo.id === activeId);
  const classes = match(active, {
    True: () => "showcase__nav-item showcase__nav-item--active",
    False: () => "showcase__nav-item",
  });
  const aria = match(active, {
    True: () => "page",
    False: () => "false",
  });
  return `<li>
    <a
      href="/showcase/${demo.id}"
      class="${classes}"
      hx-get="/showcase/${demo.id}"
      hx-target="#demo-card"
      hx-swap="innerHTML"
      hx-push-url="false"
      aria-current="${aria}"
    >
      <span>${escapeHtml(demo.title)}</span>
      <small>${escapeHtml(demo.tagline)}</small>
    </a>
  </li>`;
};

const renderHighlightCard = (item: Highlight): string => {
  const bullets = item.bullets
    .map((bullet) => `<li>${escapeHtml(bullet)}</li>`)
    .join("");
  return `<article class="highlight-card">
    <h3>${escapeHtml(item.title)}</h3>
    <p>${escapeHtml(item.copy)}</p>
    <ul>${bullets}</ul>
  </article>`;
};

const renderDemoCard = (demo: ShowcaseDemo, run: DemoRun): string => {
  const summary = demo.summary
    .map((point) => `<li>${escapeHtml(point)}</li>`)
    .join("");
  const features = demo.features
    .map((feature) => `<span class="pill">${escapeHtml(feature)}</span>`)
    .join("");
  const handlers = demo.effectHandlers
    .map((handler) => `<span class="pill pill--muted">${escapeHtml(handler)}</span>`)
    .join("");
  const code = highlightCode(demo.code);
  const runSection = renderRun(demo, run);
  const stateLabel = match(option(demo.state), {
    Some: ({ value }) => `<span class="pill pill--ghost">${escapeHtml(value.label)} state</span>`,
    None: () => "",
  });

  return `<div class="demo-card" data-demo="${escapeHtml(demo.id)}">
    <header class="demo-card__header">
      <div>
        <h2>${escapeHtml(demo.title)}</h2>
        <p>${escapeHtml(demo.tagline)}</p>
      </div>
      <div class="demo-card__tags">
        ${features}
        ${handlers}
        ${stateLabel}
      </div>
    </header>

    <section class="demo-card__summary">
      <h3>Why it matters</h3>
      <ul>${summary}</ul>
    </section>

    <section class="demo-card__code">
      <div class="demo-card__code-header">
        <h3>Program</h3>
        <button
          class="button button--ghost"
          hx-post="/showcase/${demo.id}/run"
          hx-trigger="click"
          hx-target="#demo-run-${demo.id}"
          hx-swap="innerHTML"
        >
          Run demo
        </button>
      </div>
      <pre class="code-block"><code class="language-typelang">${code}</code></pre>
    </section>

    <section class="demo-card__result" id="demo-run-${demo.id}">
      ${runSection}
    </section>
  </div>`;
};

const renderRun = (demo: ShowcaseDemo, run: DemoRun): string => {
  const statusTag = toBoolTag(run.status === "ok");
  const statusClass = match<BoolTag, string>(statusTag, {
    True: () => "demo-run__status--ok",
    False: () => "demo-run__status--error",
  });
  const statusText = match<BoolTag, string>(statusTag, {
    True: () => "Succeeded",
    False: () => "Failed",
  });
  const detailItems = run.detail.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const artifactItems = run.artifacts
    .map((artifact) =>
      `<div class="artifact">
        <span class="artifact__label">${escapeHtml(artifact.label)}</span>
        <span class="artifact__value">${escapeHtml(artifact.value)}</span>
      </div>`
    )
    .join("");
  const timelineItems = match(toBoolTag(run.timeline.length > 0), {
    True: () =>
      run.timeline
        .map((event) =>
          `<li>
            <span class="timeline__label">${escapeHtml(event.label)}</span>
            <span class="timeline__message">${escapeHtml(event.message)}</span>
          </li>`
        )
        .join(""),
    False: () =>
      `<li class="timeline__empty">Timeline is empty—run the demo to generate events.</li>`,
  });

  const consoleLogs = renderConsole(run);
  const stateBlock = renderState(run.state);

  return `<div class="demo-run">
    <div class="demo-run__status ${statusClass}">
      <strong>${escapeHtml(statusText)}</strong>
      <span>${escapeHtml(run.headline)}</span>
      <span class="demo-run__elapsed">${run.elapsedMs}ms</span>
    </div>

    <div class="demo-run__body">
      <aside class="demo-run__insights">
        <h4>What happened</h4>
        <ul>${detailItems}</ul>
        <div class="demo-run__artifacts">${artifactItems}</div>
      </aside>

      <div class="demo-run__timeline">
        <h4>Timeline</h4>
        <ul>${timelineItems}</ul>
      </div>
    </div>

    <div class="demo-run__console">
      <div>
        <h4>Console (Console.capture())</h4>
        ${consoleLogs}
      </div>
      <div>
        <h4>State Snapshot${
    match(option(demo.state), {
      Some: ({ value }) => ` (${escapeHtml(value.label)})`,
      None: () => "",
    })
  }</h4>
        ${stateBlock}
      </div>
    </div>
  </div>`;
};

const renderConsole = (run: DemoRun): string => {
  const blocks = [
    { label: "logs", values: run.console.logs, className: "demo-run__log" },
    { label: "warns", values: run.console.warns, className: "demo-run__warn" },
    { label: "errors", values: run.console.errors, className: "demo-run__error" },
  ];

  const sections = blocks
    .filter((block) => block.values.length > 0)
    .map((block) => {
      const lines = block.values
        .map((value) => `<li>${escapeHtml(value)}</li>`)
        .join("");
      return `<div class="${block.className}">
        <strong>${escapeHtml(block.label)}</strong>
        <ul>${lines}</ul>
      </div>`;
    });

  return match<BoolTag, string>(toBoolTag(sections.length > 0), {
    True: () => sections.join(""),
    False: () => `<p class="demo-run__console-empty">No console output captured.</p>`,
  });
};

const renderState = (state: unknown | null): string => {
  return match<Option<unknown>, string>(option(state), {
    None: () => `<p class="demo-run__state-empty">State handler not in stack.</p>`,
    Some: ({ value }) =>
      `<pre>${escapeHtml(JSON.stringify(value, null, 2) ?? String(value))}</pre>`,
  });
};

export const routes: Routes = [
  { method: "GET", path: "/health", handler: () => ok({ status: "ok", at: isoNow() }) },
  {
    method: "GET",
    path: "/",
    handler: async () => {
      const [first] = demos;
      const run = await runDemo(first);
      return html(renderPage(first, run));
    },
  },
  {
    method: "GET",
    path: "/showcase/:id",
    handler: async ({ params }) => {
      const selected = option(demos.find((d) => d.id === params.id) ?? null);
      return await match(selected, {
        Some: async ({ value }) => {
          const run = await runDemo(value);
          return html(renderDemoCard(value, run));
        },
        None: async () =>
          html(`<div class="demo-card__empty">Demo not found.</div>`, { status: 404 }),
      });
    },
  },
  {
    method: "POST",
    path: "/showcase/:id/run",
    handler: async ({ params }) => {
      const selected = option(demos.find((d) => d.id === params.id) ?? null);
      return await match(selected, {
        Some: async ({ value }) => {
          const run = await runDemo(value);
          return html(renderRun(value, run));
        },
        None: async () =>
          html(`<div class="demo-card__empty">Demo not found.</div>`, { status: 404 }),
      });
    },
  },
  {
    method: "GET",
    path: "/users/:id",
    handler: ({ params, query }) => ok({ id: params.id, query }),
  },
  {
    method: "POST",
    path: "/echo",
    handler: async ({ req }) => {
      const ct = req.headers.get("content-type") ?? "";
      const body = await match(toBoolTag(ct.includes("application/json")), {
        True: async () => await req.json(),
        False: async () => Object.fromEntries((await req.formData()).entries()),
      });
      return html(`<pre class="echo-block">${escapeHtml(JSON.stringify(body, null, 2))}</pre>`);
    },
  },
  {
    method: "GET",
    path: "/api/time",
    handler: () => html(`<div class="time-block">Server time: ${escapeHtml(isoNow())}</div>`),
  },
  { method: "GET", path: "/go", handler: () => redirect("/") },
];

const escapeHtml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll(
    '"',
    "&quot;",
  )
    .replaceAll("'", "&#039;");
