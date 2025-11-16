#!/usr/bin/env -S deno run -A
// scripts/lint_subset.ts
// Enforces typelang's functional subset via lightweight lexical scanning.

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", ".deno"]);
const INCLUDE_PATTERNS = [/^\.\/examples\/showcase\/app\//];
const SKIP_FILES = new Set(["./typelang/runtime.ts"]);
const SKIP_PATTERNS = [
  /^\.\/examples\/showcase\/app\/pages\//, // UI rendering code
  /^\.\/examples\/showcase\/app\/components\//, // Reusable UI components
  /^\.\/examples\/showcase\/app\/routes\.ts$/, // Route definitions (allow mutation in render functions)
];

const isIncluded = (path: string) =>
  INCLUDE_PATTERNS.some((p) => p.test(path)) &&
  !SKIP_FILES.has(path) &&
  !SKIP_PATTERNS.some((p) => p.test(path));

const toLocator = (source: string) => {
  const offsets = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === "\n") offsets.push(i + 1);
  return (pos: number) => {
    let low = 0;
    let high = offsets.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const start = offsets[mid];
      const end = mid + 1 < offsets.length ? offsets[mid + 1] : source.length + 1;
      if (pos >= start && pos < end) return { line: mid + 1, column: pos - start + 1 };
      if (pos < start) high = mid - 1;
      else low = mid + 1;
    }
    const last = offsets[offsets.length - 1];
    return { line: offsets.length, column: pos - last + 1 };
  };
};

const isIdentifierStart = (ch: string) => /[A-Za-z$_]/.test(ch);
const isIdentifierPart = (ch: string) => /[A-Za-z0-9$_]/.test(ch);

export type Diagnostic = Readonly<{ message: string; line: number; column: number }>;

export const scan = (path: string, source: string): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const locate = toLocator(source);

  type State = "normal" | "single" | "double" | "template" | "line-comment" | "block-comment";
  let state: State = "normal";
  const stateStack: State[] = [];
  const templateExpr: number[] = [];

  const pushDiagnostic = (message: string, index: number) =>
    diagnostics.push({ message, ...locate(index) });

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1] ?? "";
    const prev = source[i - 1] ?? "";

    if (state === "line-comment") {
      if (ch === "\n") state = stateStack.pop() ?? "normal";
      continue;
    }

    if (state === "block-comment") {
      if (ch === "*" && next === "/") {
        state = stateStack.pop() ?? "normal";
        i++;
      }
      continue;
    }

    if (state === "single") {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === "'") state = stateStack.pop() ?? "normal";
      continue;
    }

    if (state === "double") {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === '"') state = stateStack.pop() ?? "normal";
      continue;
    }

    if (state === "template") {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === "`" && templateExpr.length === 0) {
        state = stateStack.pop() ?? "normal";
        continue;
      }
      if (ch === "$" && next === "{") {
        templateExpr.push(0);
        stateStack.push("template");
        state = "normal";
        i++;
      }
      continue;
    }

    if (state === "normal") {
      if (templateExpr.length) {
        if (ch === "{") templateExpr[templateExpr.length - 1]++;
        else if (ch === "}") {
          if (templateExpr[templateExpr.length - 1] === 0) {
            templateExpr.pop();
            stateStack.pop();
            state = "template";
            continue;
          }
          templateExpr[templateExpr.length - 1]--;
        }
      }

      if (ch === "/" && next === "/") {
        stateStack.push(state);
        state = "line-comment";
        i++;
        continue;
      }
      if (ch === "/" && next === "*") {
        stateStack.push(state);
        state = "block-comment";
        i++;
        continue;
      }
      if (ch === "'") {
        stateStack.push(state);
        state = "single";
        continue;
      }
      if (ch === '"') {
        stateStack.push(state);
        state = "double";
        continue;
      }
      if (ch === "`") {
        stateStack.push(state);
        templateExpr.length = 0;
        state = "template";
        continue;
      }

      if (ch === "+" && next === "+") {
        pushDiagnostic("`++`/`--` are not allowed", i);
        i++;
        continue;
      }
      if (ch === "-" && next === "-") {
        pushDiagnostic("`++`/`--` are not allowed", i);
        i++;
        continue;
      }
      if (ch === "@") {
        pushDiagnostic("Decorators are not allowed", i);
        continue;
      }
      if (ch === "=") {
        if (next === "=" || next === ">") continue;
        if (prev === "=" || prev === "!" || prev === "<" || prev === ">") continue;
        const segmentStart = source.lastIndexOf("\n", i - 1) + 1;
        const before = source.slice(segmentStart, i).trimStart();
        const normalized = before.replace(/\s+/g, " ");
        const isConstDecl = /^(?:export\s+)?const\b/.test(normalized);
        const isTypeAlias = /^(?:export\s+)?type\b/.test(normalized);
        const inTemplateLiteral = before.includes("`");
        if (isConstDecl || isTypeAlias || inTemplateLiteral) continue;
        pushDiagnostic("Assignment expressions are not allowed (no mutation)", i);
        continue;
      }
      if (ch === "?") {
        if (next === "?" || next === ".") continue;
        if (prev === "?") continue;
        if (next === ":") continue;
        pushDiagnostic("`?:` conditional is not allowed; use `match()`", i);
        continue;
      }

      if (isIdentifierStart(ch)) {
        let j = i + 1;
        while (j < source.length && isIdentifierPart(source[j])) j++;
        const word = source.slice(i, j);
        const propertyAccess = source[i - 1] === ".";
        switch (word) {
          case "class":
            if (source[j] === "=") break;
            pushDiagnostic("Classes are not allowed", i);
            break;
          case "this":
            pushDiagnostic("`this` is not allowed", i);
            break;
          case "if":
            if (propertyAccess) break;
            pushDiagnostic("`if`/`else` are not allowed; use `match()`", i);
            break;
          case "else":
            if (propertyAccess) break;
            pushDiagnostic("`if`/`else` are not allowed; use `match()`", i);
            break;
          case "new": {
            const rest = source.slice(j);
            const match = /^[\s]+([A-Za-z0-9_$.]+)/.exec(rest);
            if (!match || match[1] !== "Proxy") pushDiagnostic("`new` is not allowed", i);
            break;
          }
          case "for":
            if (propertyAccess) break;
            pushDiagnostic("`for` loops are not allowed", i);
            break;
          case "while":
            if (propertyAccess) break;
            pushDiagnostic("`while` loops are not allowed", i);
            break;
          case "do":
            if (propertyAccess) break;
            pushDiagnostic("`do..while` loops are not allowed", i);
            break;
          case "enum":
            pushDiagnostic("`enum` is not allowed", i);
            break;
          case "namespace":
            pushDiagnostic("`namespace` is not allowed", i);
            break;
          case "let":
          case "var":
            if (propertyAccess) break;
            pushDiagnostic("`let`/`var` are not allowed; use `const`", i);
            break;
        }
        i = j - 1;
        continue;
      }
    }
  }

  return diagnostics;
};

const lintFile = async (path: string): Promise<Diagnostic[]> => {
  if (!isIncluded(path)) return [];
  const source = await Deno.readTextFile(path);
  return scan(path, source);
};

async function* walk(root: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(root)) {
    const full = `${root}/${entry.name}`;
    if (entry.isDirectory) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(full);
    } else if (entry.isFile && /\.(ts|tsx|mts|cts)$/.test(entry.name)) {
      yield full;
    }
  }
}

export const lintSubset = async (root: string = "."): Promise<boolean> => {
  let ok = true;
  for await (const file of walk(root)) {
    const diagnostics = await lintFile(file);
    if (diagnostics.length) {
      ok = false;
      console.error(`\nSubset violations in ${file}`);
      for (const d of diagnostics) console.error(`  - ${file}:${d.line}:${d.column}: ${d.message}`);
    }
  }
  return ok;
};

if (import.meta.main) {
  const ok = await lintSubset(".");
  if (!ok) Deno.exit(1);
}
