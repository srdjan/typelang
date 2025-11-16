// app/routes.ts
import { Routes } from "../server/types.ts";
import { html, isoNow, json, redirect } from "../server/http.ts";
import { demos, type NormalizedRun, runDemo } from "./showcase.ts";
import type { DemoRun, ShowcaseDemo } from "./showcase.ts";
import { additionalDemos } from "./demos_additional.ts";
import { highlightCode } from "../server/highlight.ts";
import { match } from "../typelang/match.ts";
import { ok, seq } from "../typelang/mod.ts";
import { Console, State } from "../typelang/effects.ts";
import { renderComparisonWidgetPartial, renderLandingPage } from "./pages/landing.ts";
import { renderLearnBasicsPage } from "./pages/learn_basics.ts";
import { renderLearnEffectsPage } from "./pages/learn_effects.ts";
import { renderLearnHandlersPage } from "./pages/learn_handlers.ts";
import { renderComparisonPage } from "./pages/comparison.ts";
import { type BoolTag, escapeHtml, type Option, option, toBoolTag } from "./lib/patterns.ts";

const okResponse = <T>(data: T) => json({ ok: true, data });

type Highlight = Readonly<{
  title: string;
  copy: string;
  bullets: readonly string[];
  cta: Readonly<{ href: string; label: string }>;
}>;

const highlights: readonly Highlight[] = [
  {
    title: "Strict Functional Subset",
    copy:
      "Every module runs inside the same expression-first subset enforced by the custom linter.",
    bullets: [
      "No implicit mutation, classes, or control statements.",
      "Human-readable diffs—business logic reads top-to-bottom.",
      "Guaranteed compatibility with seq()/par() orchestration.",
    ],
    cta: { href: "/learn/basics", label: "Read the subset guide" },
  },
  {
    title: "Algebraic Effects Runtime",
    copy:
      "Stack composable handlers to swap Console, State, Async, Http, and user-defined capabilities.",
    bullets: [
      "Abort- and cleanup-aware cancellation scopes.",
      "Runtime checks ensure every instruction has a handler.",
      "Handlers stay pure—return Result and let the runtime resolve it.",
    ],
    cta: { href: "/learn/effects", label: "Explore effects walkthrough" },
  },
  {
    title: "Lightweight HTTP Server",
    copy:
      "Deno-native server with zero dependencies, middleware chaining, and effect-driven route handlers.",
    bullets: [
      "Composable middleware: logger, CORS, auth, rate-limit, static.",
      "Routes compile to regex once and stay in memory.",
      "HTMX showcase renders progressively via server-side partials.",
    ],
    cta: { href: "/comparison", label: "See the server anatomy" },
  },
  {
    title: "Type-Safe Effect Handling",
    copy: "Design custom interfaces with defineInterface() and interpret them with tiny handlers.",
    bullets: [
      "Capabilities appear explicitly in Result signatures.",
      "swap handler stacks per request for testing or SSR.",
      "Resource scopes clean up on success, failure, or cancel.",
    ],
    cta: { href: "/learn/handlers", label: "Master handler design" },
  },
] as const;

// Helper function to render page - needs access to allDemos
const makeRenderPage =
  (allDemos: readonly ShowcaseDemo[]) => (selected: ShowcaseDemo, run: DemoRun | null): string => {
    const navItems = allDemos.map((demo) => renderNavItem(demo, selected.id)).join("");
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
    <script src="https://unpkg.com/htmx.org@2.0.7"></script>
    <link rel="stylesheet" href="/static/app.css?v=4" />
  </head>
  <body>
    <header class="hero">
      <div class="hero__content">
        <h1>typelang × Deno Showcase</h1>
      </div>
    </header>
    <main class="page">
      <section class="highlights">
        <div class="highlights__grid">
          ${featureCards}
        </div>
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
        Built with TypeLang.
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
  const copy = item.copy.trim().length > 0
    ? `<p class="highlight-card__copy">${escapeHtml(item.copy)}</p>`
    : "";
  const bullets = item.bullets.length > 0
    ? `<ul class="highlight-card__list">${
      item.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")
    }</ul>`
    : "";
  return `<article class="highlight-card">
    <div>
      <h3>${escapeHtml(item.title)}</h3>
      ${copy}
    </div>
    ${bullets}
    <a class="highlight-card__cta" href="${escapeHtml(item.cta.href)}">${
    escapeHtml(item.cta.label)
  }</a>
  </article>`;
};

const renderDemoCard = (demo: ShowcaseDemo, run: DemoRun | null): string => {
  const summary = demo.summary
    .map((point) => `<li>${escapeHtml(point)}</li>`)
    .join("");
  const features = demo.features
    .map((feature) => `<span class="pill">${escapeHtml(feature)}</span>`)
    .join("");
  const handlers = demo.effectHandlers
    .map((handler) => `<span class="pill pill--muted">${escapeHtml(handler)}</span>`)
    .join("");
  const code = highlightedCodeByDemo.get(demo.id) ?? highlightCode(demo.code);
  const runSection = renderRun(demo, run);
  const stateLabel = match(option(demo.state), {
    Some: ({ value }) => `<span class="pill pill--ghost">${escapeHtml(value.label)} state</span>`,
    None: () => "",
  });
  const buttonId = `run-button-${demo.id}`;
  const indicatorId = `${buttonId}-indicator`;
  const controls = `<button
      id="${escapeHtml(buttonId)}"
      class="button button--ghost"
      type="button"
      hx-post="/showcase/${demo.id}/run"
      hx-trigger="click"
      hx-target="#demo-run-${demo.id}"
      hx-swap="innerHTML"
      hx-disabled-elt="#${escapeHtml(buttonId)}"
      hx-indicator="#${escapeHtml(indicatorId)}"
    >
      <span class="button__spinner" id="${escapeHtml(indicatorId)}" aria-hidden="true"></span>
      <span class="button__text">Run demo</span>
    </button>`;

  return `<div class="demo-card" data-demo="${escapeHtml(demo.id)}">
    <header class="demo-card__header">
      <div>
        <h2>${escapeHtml(demo.title)}</h2>
        <p>${escapeHtml(demo.tagline)}</p>
      </div>
    </header>

    <section class="demo-card__overview">
      <div class="demo-card__summary">
        <h3>Why it matters</h3>
        <ul>${summary}</ul>
      </div>
      <div class="demo-card__meta">
        <div class="demo-card__tags">
          ${features}
          ${handlers}
          ${stateLabel}
        </div>
        <div class="demo-card__controls">
          ${controls}
        </div>
      </div>
    </section>

    <details class="demo-card__panel" open>
      <summary>Program</summary>
      <pre class="code-block"><code class="language-typelang">${code}</code></pre>
    </details>

    <section class="demo-card__result" id="demo-run-${demo.id}">
      ${runSection}
    </section>
  </div>`;
};

const renderRun = (demo: ShowcaseDemo, run: DemoRun | null): string => {
  return match(option(run), {
    None: () => {
      const stateSuffix = match(option(demo.state), {
        Some: ({ value }) => ` and ${escapeHtml(value.label.toLowerCase())} state snapshots`,
        None: () => "",
      });
      const handlerInfo = match(
        option(demo.effectHandlers.length > 0 ? demo.effectHandlers : null),
        {
          None: () => "",
          Some: ({ value }) =>
            `<p class="demo-run__pending-handlers">Handlers: ${escapeHtml(value.join(" · "))}</p>`,
        },
      );
      return `<div class="demo-run demo-run--pending">
        <div class="demo-run__pending">
          <h4>Awaiting execution</h4>
          <p>Console output, timeline events${stateSuffix} will render here after you run the program.</p>
          ${handlerInfo}
        </div>
      </div>`;
    },
    Some: ({ value }) => {
      const statusTag = toBoolTag(value.status === "ok");
      const statusClass = match<BoolTag, string>(statusTag, {
        True: () => "demo-run__status--ok",
        False: () => "demo-run__status--error",
      });
      const statusText = match<BoolTag, string>(statusTag, {
        True: () => "Succeeded",
        False: () => "Failed",
      });
      const detailItems = value.detail.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
      const artifactItems = value.artifacts
        .map((artifact) =>
          `<div class="artifact">
            <span class="artifact__label">${escapeHtml(artifact.label)}</span>
            <span class="artifact__value">${escapeHtml(artifact.value)}</span>
          </div>`
        )
        .join("");
      const timelineBody = match(toBoolTag(value.timeline.length > 0), {
        True: () =>
          `<ul class="timeline-list">${
            value.timeline
              .map((event) =>
                `<li>
                <span class="timeline__label">${escapeHtml(event.label)}</span>
                <span class="timeline__message">${escapeHtml(event.message)}</span>
              </li>`
              )
              .join("")
          }</ul>`,
        False: () =>
          `<p class="timeline__empty">Timeline is empty—run the demo to generate events.</p>`,
      });

      const consoleLogs = renderConsole(value);
      const stateBlock = renderState(value.state);
      const diagnosticsOpen = match(statusTag, {
        True: () => "",
        False: () => " open",
      });
      const stateHeadingSuffix = match(option(demo.state), {
        Some: ({ value: state }) => ` (${escapeHtml(state.label)})`,
        None: () => "",
      });

      return `<div class="demo-run">
        <div class="demo-run__status ${statusClass}">
          <strong>${escapeHtml(statusText)}</strong>
          <span>${escapeHtml(value.headline)}</span>
          <span class="demo-run__elapsed">${value.elapsedMs}ms</span>
        </div>

        <div class="demo-run__glance">
          <div>
            <h4>What happened</h4>
            <ul>${detailItems}</ul>
          </div>
          <div class="demo-run__artifacts">${artifactItems}</div>
        </div>

        <details class="demo-run__details"${diagnosticsOpen}>
          <summary>Inspect diagnostics</summary>
          <div class="demo-run__details-grid">
            <article class="demo-run__panel">
              <h5>Timeline</h5>
              ${timelineBody}
            </article>
            <article class="demo-run__panel">
              <h5>Console (Console.capture())</h5>
              <div class="demo-run__panel-body">${consoleLogs}</div>
            </article>
            <article class="demo-run__panel">
              <h5>State Snapshot${stateHeadingSuffix}</h5>
              <div class="demo-run__panel-body">${stateBlock}</div>
            </article>
          </div>
        </details>
      </div>`;
    },
  });
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

// Merge all demos
const allDemos = [...demos, ...additionalDemos] as const;

const highlightedCodeByDemo = new Map<string, string>(
  allDemos.map((demo) => [demo.id, highlightCode(demo.code)] as const),
);

// Create renderPage with allDemos
const renderPage = makeRenderPage(allDemos);

const demoNotFoundResponse = () =>
  html(`<div class="demo-card__empty">Demo not found.</div>`, { status: 404 });

const findDemo = (id: string): Option<ShowcaseDemo> =>
  option(allDemos.find((demo) => demo.id === id) ?? null);

const respondWithDemo = async (
  id: string,
  onFound: (demo: ShowcaseDemo) => Promise<Response> | Response,
): Promise<Response> =>
  await match(findDemo(id), {
    Some: async ({ value }) => await onFound(value),
    None: async () => demoNotFoundResponse(),
  });

export const routes: Routes = [
  { method: "GET", path: "/health", handler: () => okResponse({ status: "ok", at: isoNow() }) },
  {
    method: "GET",
    path: "/",
    handler: () => html(renderLandingPage()),
  },
  {
    method: "GET",
    path: "/landing",
    handler: () => redirect("/"),
  },
  {
    method: "GET",
    path: "/learn",
    handler: () => redirect("/learn/basics"),
  },
  {
    method: "GET",
    path: "/learn/basics",
    handler: () => html(renderLearnBasicsPage()),
  },
  {
    method: "GET",
    path: "/learn/effects",
    handler: () => html(renderLearnEffectsPage()),
  },
  {
    method: "GET",
    path: "/learn/handlers",
    handler: () => html(renderLearnHandlersPage()),
  },
  {
    method: "GET",
    path: "/comparison",
    handler: () => html(renderComparisonPage()),
  },
  {
    method: "GET",
    path: "/comparison-widget/:id",
    handler: ({ params }) => html(renderComparisonWidgetPartial(params.id)),
  },
  {
    method: "POST",
    path: "/api/mini-demo",
    handler: async () => {
      const miniDemo = {
        id: "mini",
        title: "Mini Counter",
        tagline: "Quick demo",
        summary: [],
        features: [],
        effectHandlers: [],
        code: "",
        state: { initial: { count: 0 }, label: "Counter" },
        usesAsync: false,
        program: () =>
          seq()
            .let(() => State.get<{ count: number }>())
            .let((s) => ok({ count: s.count + 1 }))
            .tap((next) => Console.log(`Count: ${next.count}`))
            .tap((next) => State.put(next))
            .then((next) => ok(next.count))
            .value(),
        present: (run: NormalizedRun) => ({
          status: "ok" as const,
          headline: `Counter incremented`,
          detail: [],
          artifacts: [],
          console: run.console,
          state: run.state,
          timeline: [],
          elapsedMs: run.elapsedMs,
        }),
      };
      const run = await runDemo(miniDemo);
      const consoleItems = match(toBoolTag(run.console.logs.length > 0), {
        True: () =>
          run.console.logs
            .map((log) => `<li>${escapeHtml(log)}</li>`)
            .join(""),
        False: () => `<li class="hero-demo__empty">No Console output this run.</li>`,
      });
      const consoleErrors = match(toBoolTag(run.console.errors.length > 0), {
        True: () =>
          run.console.errors
            .map((msg) => `<li>${escapeHtml(msg)}</li>`)
            .join(""),
        False: () => `<li class="hero-demo__empty">No errors captured.</li>`,
      });
      const stateMarkup = match(option(run.state), {
        Some: ({ value }) =>
          `<pre class="hero-demo__state">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`,
        None: () => `<p class="hero-demo__empty">State handler not attached.</p>`,
      });
      const detailItems = run.detail.length > 0
        ? `<ul>${run.detail.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
        : `<p class="hero-demo__empty">No additional diagnostics.</p>`;
      const cardClass = run.status === "ok"
        ? "hero-demo__result-card hero-demo__result-card--success"
        : "hero-demo__result-card hero-demo__result-card--error";
      const badgeLabel = run.status === "ok" ? `${run.elapsedMs}ms` : "Check logs";
      const summaryCopy = run.status === "ok"
        ? "Console + State handlers in four declarative steps."
        : run.headline;
      const diagnostics = run.status === "ok"
        ? `<div class="hero-demo__result-grid">
            <section class="hero-demo__stack">
              <h4>Console</h4>
              <ul>${consoleItems}</ul>
            </section>
            <section class="hero-demo__stack">
              <h4>State</h4>
              ${stateMarkup}
            </section>
          </div>`
        : `<div class="hero-demo__result-grid">
            <section class="hero-demo__stack">
              <h4>What happened</h4>
              ${detailItems}
            </section>
            <section class="hero-demo__stack">
              <h4>Console errors</h4>
              <ul>${consoleErrors}</ul>
            </section>
          </div>`;
      return html(`<article class="${cardClass}">
        <header class="hero-demo__result-header">
          <div>
            <h3>Mini Counter Run</h3>
            <p>${escapeHtml(summaryCopy)}</p>
          </div>
          <span class="hero-demo__badge">${escapeHtml(badgeLabel)}</span>
        </header>
        ${diagnostics}
      </article>`);
    },
  },
  {
    method: "GET",
    path: "/demos",
    handler: async () => {
      const [first] = allDemos;
      return html(renderPage(first, null));
    },
  },
  {
    method: "GET",
    path: "/showcase/:id",
    handler: async ({ params }) =>
      await respondWithDemo(params.id, (demo) => html(renderDemoCard(demo, null))),
  },
  {
    method: "GET",
    path: "/demos/:id",
    handler: async ({ params }) =>
      await respondWithDemo(params.id, (demo) => html(renderPage(demo, null))),
  },
  {
    method: "POST",
    path: "/showcase/:id/run",
    handler: async ({ params }) =>
      await respondWithDemo(params.id, async (demo) => {
        const run = await runDemo(demo);
        return html(renderRun(demo, run));
      }),
  },
  {
    method: "GET",
    path: "/users/:id",
    handler: ({ params, query }) => okResponse({ id: params.id, query }),
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
