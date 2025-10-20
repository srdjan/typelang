// app/components/ui.ts
// Reusable UI components following typelang subset rules.

import { match } from "../../typelang/match.ts";

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

const escapeHtml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll(
    '"',
    "&quot;",
  )
    .replaceAll("'", "&#039;");

// Simple syntax highlighter for TypeScript
export const highlightTypeScript = (code: string): string => {
  // Combined regex that matches all token types in one pass
  // Order matters: comments, strings, keywords, effects, functions, operators, numbers
  const tokenPattern =
    /(\/\/.*$|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(const|let|var|function|return|if|else|for|while|do|break|continue|async|await|type|interface|class|extends|implements|import|export|from|as|default|case|switch|throw|try|catch|finally|new|this|super|static|public|private|protected|readonly|enum|namespace|declare|module|void|never|unknown|any|null|undefined|true|false)\b|\b(Console|State|Async|Exception)\.op\.[a-zA-Z_$][\w$]*|\b([a-zA-Z_$][\w$]*)\s*(?=\()|(=>|\.\.\.|\?\?|&&|\|\||[+\-*/%<>=!&|^~?:])|\b(\d+\.?\d*|\.\d+)\b/gm;

  const result = code.replace(
    tokenPattern,
    (match, comment, string, keyword, effect, func, operator, number) => {
      const escaped = escapeHtml(match);
      if (comment) return `<span class="token comment">${escaped}</span>`;
      if (string) return `<span class="token string">${escaped}</span>`;
      if (keyword) return `<span class="token keyword">${escaped}</span>`;
      if (effect) return `<span class="token effect">${escaped}</span>`;
      if (func) return `<span class="token function">${escapeHtml(func)}</span>`;
      if (operator) return `<span class="token operator">${escaped}</span>`;
      if (number) return `<span class="token number">${escaped}</span>`;
      return escaped;
    },
  );

  // Escape any remaining unmatched characters and handle template interpolations
  return result
    .split(/(<span[^>]*>.*?<\/span>)/)
    .map((part, i) =>
      i % 2 === 0
        ? escapeHtml(part).replace(/\$\{([^}]+)\}/g, '<span class="token interpolation">$&</span>')
        : part
    )
    .join("");
};

// Button component
type ButtonVariant = "primary" | "outline" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

export type Button = Readonly<{
  label: string;
  variant: ButtonVariant;
  size: ButtonSize;
  href: string | null;
  htmx:
    | Readonly<{
      get: string | null;
      post: string | null;
      target: string | null;
      swap: string | null;
    }>
    | null;
  icon: string | null;
  disabled: boolean;
}>;

const variantClass = (variant: ButtonVariant): string => {
  const mapping: Readonly<Record<ButtonVariant, string>> = {
    primary: "button",
    outline: "button button--outline",
    ghost: "button button--ghost",
  };
  return mapping[variant];
};

const sizeClass = (size: ButtonSize): string => {
  const mapping: Readonly<Record<ButtonSize, string>> = {
    sm: "button--sm",
    md: "",
    lg: "button--lg",
  };
  return mapping[size];
};

export const renderButton = (btn: Button): string => {
  const classes = `${variantClass(btn.variant)} ${sizeClass(btn.size)}`.trim();
  const htmxAttrs = match(option(btn.htmx), {
    None: () => "",
    Some: ({ value }) => {
      const get = match(option(value.get), {
        None: () => "",
        Some: ({ value: v }) => ` hx-get="${escapeHtml(v)}"`,
      });
      const post = match(option(value.post), {
        None: () => "",
        Some: ({ value: v }) => ` hx-post="${escapeHtml(v)}"`,
      });
      const target = match(option(value.target), {
        None: () => "",
        Some: ({ value: v }) => ` hx-target="${escapeHtml(v)}"`,
      });
      const swap = match(option(value.swap), {
        None: () => "",
        Some: ({ value: v }) => ` hx-swap="${escapeHtml(v)}"`,
      });
      return `${get}${post}${target}${swap}`;
    },
  });

  const iconHtml = match(option(btn.icon), {
    None: () => "",
    Some: ({ value }) => `<span class="button__icon">${escapeHtml(value)}</span>`,
  });

  const disabledAttr = match(toBoolTag(btn.disabled), {
    True: () => " disabled",
    False: () => "",
  });

  return match(option(btn.href), {
    None: () =>
      `<button class="${classes}"${htmxAttrs}${disabledAttr}>
        ${iconHtml}
        <span>${escapeHtml(btn.label)}</span>
      </button>`,
    Some: ({ value }) =>
      `<a href="${escapeHtml(value)}" class="${classes}"${htmxAttrs}>
        ${iconHtml}
        <span>${escapeHtml(btn.label)}</span>
      </a>`,
  });
};

// Badge/Pill component
export type Badge = Readonly<{
  label: string;
  variant: "default" | "muted" | "ghost" | "accent" | "ok" | "error";
}>;

const badgeVariantClass = (variant: Badge["variant"]): string => {
  const mapping: Readonly<Record<Badge["variant"], string>> = {
    default: "pill",
    muted: "pill pill--muted",
    ghost: "pill pill--ghost",
    accent: "pill pill--accent",
    ok: "pill pill--ok",
    error: "pill pill--error",
  };
  return mapping[variant];
};

export const renderBadge = (badge: Badge): string =>
  `<span class="${badgeVariantClass(badge.variant)}">${escapeHtml(badge.label)}</span>`;

// Card component
export type Card = Readonly<{
  title: string;
  subtitle: string | null;
  content: string;
  footer: string | null;
  variant: "default" | "highlight" | "demo";
}>;

const cardVariantClass = (variant: Card["variant"]): string => {
  const mapping: Readonly<Record<Card["variant"], string>> = {
    default: "card",
    highlight: "card card--highlight",
    demo: "card card--demo",
  };
  return mapping[variant];
};

export const renderCard = (card: Card): string => {
  const subtitleHtml = match(option(card.subtitle), {
    None: () => "",
    Some: ({ value }) => `<p class="card__subtitle">${escapeHtml(value)}</p>`,
  });

  const footerHtml = match(option(card.footer), {
    None: () => "",
    Some: ({ value }) => `<footer class="card__footer">${value}</footer>`,
  });

  return `<article class="${cardVariantClass(card.variant)}">
    <header class="card__header">
      <h3 class="card__title">${escapeHtml(card.title)}</h3>
      ${subtitleHtml}
    </header>
    <div class="card__content">${card.content}</div>
    ${footerHtml}
  </article>`;
};

// Code block component
export type CodeBlock = Readonly<{
  code: string;
  language: string;
  filename: string | null;
  showLineNumbers: boolean;
  highlightLines: readonly number[];
}>;

export const renderCodeBlock = (block: CodeBlock): string => {
  const filenameLabel: string = match(option(block.filename), {
    None: () => "code",
    Some: ({ value }) => value,
  });

  const lineNumbersClass = match(toBoolTag(block.showLineNumbers), {
    True: () => " code-block--line-numbers",
    False: () => "",
  });

  const highlightedCode = block.language === "typescript" || block.language === "ts"
    ? highlightTypeScript(block.code)
    : escapeHtml(block.code);

  return `<div class="code-block-wrapper">
    <pre class="code-block${lineNumbersClass}"><code class="language-${
    escapeHtml(block.language)
  }" data-filename="${escapeHtml(filenameLabel)}">${highlightedCode}</code></pre>
  </div>`;
};

// Navigation component
export type NavItem = Readonly<{
  label: string;
  href: string;
  active: boolean;
  children: readonly NavItem[];
}>;

const renderNavItem = (item: NavItem, depth: number): string => {
  const activeClass = match(toBoolTag(item.active), {
    True: () => " nav-item--active",
    False: () => "",
  });

  const ariaCurrent = match(toBoolTag(item.active), {
    True: () => ' aria-current="page"',
    False: () => "",
  });

  const childrenHtml = match(toBoolTag(item.children.length > 0), {
    True: () => {
      const items = item.children.map((child) => renderNavItem(child, depth + 1)).join("");
      return `<ul class="nav-submenu">${items}</ul>`;
    },
    False: () => "",
  });

  return `<li class="nav-item nav-item--depth-${depth}">
    <a href="${escapeHtml(item.href)}" class="nav-link${activeClass}"${ariaCurrent}>
      ${escapeHtml(item.label)}
    </a>
    ${childrenHtml}
  </li>`;
};

export const renderNav = (items: readonly NavItem[]): string => {
  const renderedItems = items.map((item) => renderNavItem(item, 0)).join("");
  return `<nav class="main-nav">
    <ul class="nav-list">${renderedItems}</ul>
  </nav>`;
};

// Grid component
export type GridItem = Readonly<{
  content: string;
  span: number;
}>;

export type Grid = Readonly<{
  columns: number;
  gap: "sm" | "md" | "lg";
  items: readonly GridItem[];
}>;

const gapClass = (gap: Grid["gap"]): string => {
  const mapping: Readonly<Record<Grid["gap"], string>> = {
    sm: "grid--gap-sm",
    md: "grid--gap-md",
    lg: "grid--gap-lg",
  };
  return mapping[gap];
};

export const renderGrid = (grid: Grid): string => {
  const items = grid.items
    .map((item) =>
      `<div class="grid-item" style="grid-column: span ${item.span};">${item.content}</div>`
    )
    .join("");

  return `<div class="grid ${
    gapClass(grid.gap)
  }" style="grid-template-columns: repeat(${grid.columns}, 1fr);">
    ${items}
  </div>`;
};

// Tabs component
export type Tab = Readonly<{
  id: string;
  label: string;
  content: string;
  active: boolean;
}>;

export const renderTabs = (tabs: readonly Tab[]): string => {
  const tabButtons = tabs
    .map((tab) => {
      const activeClass = match(toBoolTag(tab.active), {
        True: () => " tab-button--active",
        False: () => "",
      });
      const ariaCurrent = match(toBoolTag(tab.active), {
        True: () => ' aria-selected="true"',
        False: () => ' aria-selected="false"',
      });
      return `<button
        role="tab"
        class="tab-button${activeClass}"
        hx-get="#"
        hx-target="#tab-content-${escapeHtml(tab.id)}"
        hx-swap="show:none"
        data-tab="${escapeHtml(tab.id)}"${ariaCurrent}
      >
        ${escapeHtml(tab.label)}
      </button>`;
    })
    .join("");

  const tabPanels = tabs
    .map((tab) => {
      const activeClass = match(toBoolTag(tab.active), {
        True: () => " tab-panel--active",
        False: () => "",
      });
      return `<div
        role="tabpanel"
        id="tab-content-${escapeHtml(tab.id)}"
        class="tab-panel${activeClass}"
      >
        ${tab.content}
      </div>`;
    })
    .join("");

  return `<div class="tabs">
    <div class="tab-list" role="tablist">${tabButtons}</div>
    <div class="tab-panels">${tabPanels}</div>
  </div>`;
};

// Page layout component
export type PageLayout = Readonly<{
  title: string;
  description: string;
  nav: readonly NavItem[];
  content: string;
  sidebar: string | null;
}>;

export const renderPageLayout = (layout: PageLayout): string => {
  const sidebarHtml = match(option(layout.sidebar), {
    None: () => "",
    Some: ({ value }) => `<aside class="page-sidebar">${value}</aside>`,
  });

  const gridClass = match(option(layout.sidebar), {
    None: () => "page-layout",
    Some: () => "page-layout page-layout--with-sidebar",
  });

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(layout.title)} - typelang</title>
    <meta name="description" content="${escapeHtml(layout.description)}" />
    <meta name="color-scheme" content="light dark" />
    <script src="https://unpkg.com/htmx.org@2.0.7"></script>
    <link rel="stylesheet" href="/static/app.css?v=4" />
  </head>
  <body>
    ${renderNav(layout.nav)}
    <main class="${gridClass}">
      ${sidebarHtml}
      <div class="page-content">
        ${layout.content}
      </div>
    </main>
  </body>
</html>`;
};
