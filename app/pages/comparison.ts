// app/pages/comparison.ts
// Dedicated comparison page showing TypeScript vs typelang examples.

import { match } from "../../typelang/match.ts";
import { type Badge, renderBadge } from "../components/ui.ts";

const escapeHtml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll(
    '"',
    "&quot;",
  )
    .replaceAll("'", "&#039;");

type ComparisonExample = Readonly<{
  id: string;
  category: string;
  title: string;
  traditional: Readonly<{ code: string; issues: readonly string[] }>;
  typelang: Readonly<{ code: string; benefits: readonly string[] }>;
}>;

const examples: readonly ComparisonExample[] = [
  {
    id: "mutation",
    category: "State Management",
    title: "Mutable vs Immutable State",
    traditional: {
      code: `// Mutation everywhere
let count = 0;
function increment() {
  count++;  // Side effect!
  console.log(count);  // Another side effect!
  return count;
}

// What if called from multiple places?
// What if count is modified elsewhere?
// How do you test this?`,
      issues: [
        "Hidden mutation makes testing hard",
        "Side effects not tracked in types",
        "No guarantee of execution order",
        "Cannot safely parallelize",
        "Debugging requires tracing all mutations",
      ],
    },
    typelang: {
      code: `// Pure transformation
const increment = () =>
  seq()
    .let("state", () => State.get<{count: number}>())
    .let("next", ({state}) => ({count: state.count + 1}))
    .do(({next}) => Console.op.log(\`\${next.count}\`))
    .do(({next}) => State.put(next))
    .return(({next}) => next.count);

// Type: Eff<number, State | Console>
// Test: swap State handler for mock
// Debug: all state changes explicit`,
      benefits: [
        "All effects tracked in type signature",
        "Pure functions = easy testing",
        "Explicit sequencing with seq()",
        "Handler swapping for different contexts",
        "Time-travel debugging possible",
      ],
    },
  },
  {
    id: "branching",
    category: "Control Flow",
    title: "if/else vs Pattern Matching",
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
}

// Easy to forget a case
// Easy to add bugs when extending
// Exceptions are invisible in types`,
      issues: [
        "Throws hidden exceptions",
        "Non-exhaustive cases",
        "Hard to extend safely",
        "Implicit control flow",
        "Type system doesn't help",
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
  });

// Compiler enforces all cases
// Errors as typed values
// Easy to extend with new modes`,
      benefits: [
        "Exhaustive pattern matching",
        "Errors as typed values",
        "No hidden exceptions",
        "Compiler enforces all cases",
        "Safe to refactor",
      ],
    },
  },
  {
    id: "async",
    category: "Async Operations",
    title: "Promise Chains vs Effect Composition",
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
}

// Sequential when could be parallel
// Error handling is imperative
// console.error is hidden side effect`,
      issues: [
        "Sequential when could be parallel",
        "Side effects in error handling",
        "Exceptions escape type system",
        "Hard to test error paths",
        "No structured logging",
      ],
    },
    typelang: {
      code: `// Effect-based async
const loadData = () =>
  seq()
    .let("user", () => fetchUser())
    .let("parallel", ({user}) =>
      par.all({
        posts: () => fetchPosts(user.id),
        metrics: () => fetchMetrics(user.id),
      })
    )
    .let("comments", ({parallel}) =>
      fetchComments(parallel.posts[0]?.id)
    )
    .return(({user, parallel, comments}) => ({
      user,
      posts: parallel.posts,
      comments,
    }));

// Type: Eff<Data, Http | Exception>`,
      benefits: [
        "Explicit parallelism with par.all()",
        "No try/catch needed",
        "Exception handler provides Result type",
        "All effects visible in signature",
        "Easy to add logging/metrics",
      ],
    },
  },
  {
    id: "error-handling",
    category: "Error Handling",
    title: "Exceptions vs Result Types",
    traditional: {
      code: `// Try/catch everywhere
function parseJSON(input: string): User {
  try {
    const data = JSON.parse(input);
    if (!data.id || !data.name) {
      throw new Error("Invalid user");
    }
    return data as User;
  } catch (e) {
    // What type is e?
    throw new Error("Parse failed");
  }
}

// Caller must remember to catch
// No indication of possible failures
// Error types are unknown`,
      issues: [
        "Exceptions not in type signature",
        "Caller must remember try/catch",
        "Error types are unknown",
        "Hard to handle different error cases",
        "Testing error paths is awkward",
      ],
    },
    typelang: {
      code: `// Result types
type ParseError =
  | {tag: "InvalidJSON"; message: string}
  | {tag: "MissingField"; field: string};

const parseJSON = (input: string) =>
  seq()
    .let("parsed", () =>
      match(tryParse(input), {
        Ok: ({value}) => value,
        Err: ({error}) =>
          Exception.op.fail({
            tag: "InvalidJSON",
            message: error
          }),
      })
    )
    .when(
      ({parsed}) => !parsed.id,
      () => Exception.op.fail({
        tag: "MissingField",
        field: "id"
      })
    )
    .return(({parsed}) => parsed as User);

// Use with Exception.tryCatch() handler
// Returns: Result<User, ParseError>`,
      benefits: [
        "Errors as typed data structures",
        "All failures visible in signature",
        "Exhaustive error handling",
        "Easy to test all error cases",
        "No try/catch spaghetti",
      ],
    },
  },
  {
    id: "testing",
    category: "Testing",
    title: "Mocks vs Handler Swapping",
    traditional: {
      code: `// Complex mocking
class UserService {
  constructor(private db: Database) {}

  async getUser(id: string) {
    const user = await this.db.query("SELECT * FROM users");
    console.log(\`Found user \${user.name}\`);
    return user;
  }
}

// Test requires mocking framework
const mockDb = createMock<Database>();
mockDb.query.mockResolvedValue({ id: "1", name: "Alice" });
const consoleLog = jest.spyOn(console, 'log');

const service = new UserService(mockDb);
await service.getUser("1");

expect(mockDb.query).toHaveBeenCalled();
expect(consoleLog).toHaveBeenCalled();`,
      issues: [
        "Requires mocking library",
        "Complex setup with spies/mocks",
        "console.log can't be captured easily",
        "Mocks can diverge from real behavior",
        "Hard to test different scenarios",
      ],
    },
    typelang: {
      code: `// Handler swapping
const getUser = (id: string) =>
  seq()
    .let("user", () => Database.op.query("SELECT * FROM users"))
    .do(({user}) => Console.op.log(\`Found \${user.name}\`))
    .return(({user}) => user);

// Production
await stack(
  handlers.Database.postgres(connectionString),
  handlers.Console.live(),
).run(() => getUser("1"));

// Test
const mockDb = testDatabaseHandler([
  { id: "1", name: "Alice" }
]);
const captured = await stack(
  mockDb,
  handlers.Console.capture(),
).run(() => getUser("1"));

assertEquals(captured.result, { id: "1", name: "Alice" });
assertEquals(captured.logs, ["Found Alice"]);
// No mocking library needed!`,
      benefits: [
        "No mocking library needed",
        "Same code, different handlers",
        "All effects captured naturally",
        "Easy to test edge cases",
        "Test handlers can't diverge",
      ],
    },
  },
  {
    id: "composition",
    category: "Code Organization",
    title: "Classes vs Functions",
    traditional: {
      code: `// Class-based organization
class OrderProcessor {
  private tax = 0.1;

  constructor(
    private db: Database,
    private logger: Logger,
    private mailer: Mailer
  ) {}

  async processOrder(orderId: string) {
    this.logger.log(\`Processing \${orderId}\`);

    const order = await this.db.findOrder(orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    const total = order.amount * (1 + this.tax);
    order.total = total;

    await this.db.updateOrder(order);
    await this.mailer.send(order.email, "Order processed");

    return order;
  }
}`,
      issues: [
        "Hidden mutation of order object",
        "Dependencies injected via constructor",
        "Hard to compose with other classes",
        "Difficult to test in isolation",
        "this keyword everywhere",
      ],
    },
    typelang: {
      code: `// Function composition
type Order = Readonly<{
  id: string;
  amount: number;
  email: string;
}>;

const calculateTotal = (amount: number, taxRate: number) =>
  amount * (1 + taxRate);

const processOrder = (orderId: string, taxRate: number) =>
  seq()
    .do(() => Console.op.log(\`Processing \${orderId}\`))
    .let("order", () => Database.op.findOrder(orderId))
    .let("validated", ({order}) =>
      match(option(order), {
        None: () => Exception.op.fail({tag: "NotFound"}),
        Some: ({value}) => value,
      })
    )
    .let("total", ({validated}) =>
      calculateTotal(validated.amount, taxRate)
    )
    .let("updated", ({validated, total}) => ({
      ...validated,
      total,
    }))
    .do(({updated}) => Database.op.updateOrder(updated))
    .do(({updated}) =>
      Mailer.op.send(updated.email, "Order processed")
    )
    .return(({updated}) => updated);

// Type: Eff<Order, Console | Database | Exception | Mailer>`,
      benefits: [
        "Pure functions, no hidden state",
        "Dependencies via effects, not DI",
        "Easy to compose and reuse",
        "Test with handler swapping",
        "No this, no classes needed",
      ],
    },
  },
] as const;

const renderExample = (example: ComparisonExample): string => {
  const categoryBadge = renderBadge({ label: example.category, variant: "accent" });

  const issues = example.traditional.issues
    .map((issue) => `<li class="issue-item">❌ ${escapeHtml(issue)}</li>`)
    .join("");

  const benefits = example.typelang.benefits
    .map((benefit) => `<li class="benefit-item">✅ ${escapeHtml(benefit)}</li>`)
    .join("");

  return `<article class="comparison-example" id="comparison-${example.id}">
    <header class="comparison-example__header">
      ${categoryBadge}
      <h2>${escapeHtml(example.title)}</h2>
    </header>

    <div class="comparison-example__content">
      <div class="comparison-side comparison-side--traditional">
        <h3>Traditional TypeScript</h3>
        <pre class="code-preview"><code>${escapeHtml(example.traditional.code)}</code></pre>
        <div class="comparison-notes">
          <h4>Issues</h4>
          <ul>${issues}</ul>
        </div>
      </div>

      <div class="comparison-divider">
        <span class="comparison-arrow">→</span>
      </div>

      <div class="comparison-side comparison-side--typelang">
        <h3>typelang</h3>
        <pre class="code-preview"><code>${escapeHtml(example.typelang.code)}</code></pre>
        <div class="comparison-notes">
          <h4>Benefits</h4>
          <ul>${benefits}</ul>
        </div>
      </div>
    </div>
  </article>`;
};

export const renderComparisonPage = (): string => {
  const examplesHtml = examples.map(renderExample).join("");

  const categories = Array.from(new Set(examples.map((ex) => ex.category)));
  const navItems = categories
    .map((cat) => {
      const catExamples = examples.filter((ex) => ex.category === cat);
      const links = catExamples
        .map((ex) => `<li><a href="#comparison-${ex.id}">${escapeHtml(ex.title)}</a></li>`)
        .join("");
      return `<div class="comparison-nav__category">
        <h3>${escapeHtml(cat)}</h3>
        <ul>${links}</ul>
      </div>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>TypeScript vs typelang Comparison - typelang</title>
    <meta name="description" content="Side-by-side comparisons of traditional TypeScript vs typelang: mutation, control flow, async, error handling, testing, and composition." />
    <meta name="color-scheme" content="light dark" />
    <script src="https://unpkg.com/htmx.org@2.0.3"></script>
    <link rel="stylesheet" href="/static/app.css?v=4" />
    <link rel="stylesheet" href="/static/comparison.css?v=4" />
  </head>
  <body class="comparison-page">
    <header class="comparison-header">
      <nav class="learn-breadcrumb">
        <a href="/">Home</a>
        <span>→</span>
        <span>Comparison</span>
      </nav>
      <h1>TypeScript vs typelang</h1>
      <p class="comparison-header__subtitle">
        See the difference: traditional TypeScript patterns vs typelang's functional approach.
        Each example shows real code with pros and cons.
      </p>
      <div class="comparison-header__badges">
        ${renderBadge({ label: `${examples.length} Examples`, variant: "ghost" })}
        ${renderBadge({ label: "Side by Side", variant: "accent" })}
      </div>
    </header>

    <div class="comparison-layout">
      <aside class="comparison-nav">
        <h2>Categories</h2>
        ${navItems}
      </aside>

      <main class="comparison-content">
        ${examplesHtml}
      </main>
    </div>

    <footer class="comparison-footer">
      <div class="comparison-footer__cta">
        <h2>Ready to try typelang?</h2>
        <p>Explore interactive demos or dive into the learning path.</p>
        <div class="comparison-footer__actions">
          <a href="/demos" class="button">View Demos</a>
          <a href="/learn" class="button button--outline">Start Learning</a>
        </div>
      </div>
    </footer>
  </body>
</html>`;
};
