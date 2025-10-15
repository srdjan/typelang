// scripts/lint_subset.ts
#!/usr/bin/env -S deno run -A
import { parseModule, walk } from "https://deno.land/x/deno_ast@0.41.2/mod.ts";

const forbidden = {
  ClassDeclaration: "Classes are not allowed",
  ClassExpression: "Classes are not allowed",
  ThisExpr: "`this` is not allowed",
  NewExpr: "`new` is not allowed",
  ForStmt: "`for` loops are not allowed",
  ForInStmt: "`for..in` loops are not allowed",
  ForOfStmt: "`for..of` loops are not allowed",
  WhileStmt: "`while` loops are not allowed",
  DoWhileStmt: "`do..while` loops are not allowed",
  UpdateExpr: "`++`/`--` are not allowed",
  TSEnumDecl: "`enum` is not allowed",
  TSModuleDecl: "`namespace` is not allowed",
  Decorator: "Decorators are not allowed",
} as const;

function msg(path: string, n: any, text: string) {
  const span = n.span?.start ?? 0;
  return `${path}:${span}: ${text}`;
}

async function lintFile(path: string) {
  const src = await Deno.readTextFile(path);
  const mod = parseModule({ specifier: path, source: src });
  const errs: string[] = [];
  walk(mod, (n) => {
    const t = (n.type ?? "") as keyof typeof forbidden;
    if (t in forbidden) errs.push(msg(path, n, forbidden[t]));
    if (n.type === "VarDecl" && n.kind !== "const") errs.push(msg(path, n, "`let`/`var` are not allowed; use `const`"));
    if (n.type === "AssignExpr") errs.push(msg(path, n, "Assignment expressions are not allowed (no mutation)"));
  });
  if (errs.length) {
    console.error(`\nSubset violations in ${path}`);
    for (const e of errs) console.error("  - " + e);
    return false;
  }
  return true;
}

async function* walkFs(root: string): AsyncGenerator<string> {
  const SKIP = new Set([".git", "node_modules", "dist", "build", "coverage", ".deno"]);
  for await (const e of Deno.readDir(root)) {
    const p = `${root}/${e.name}`;
    if (e.isDirectory) {
      if (!SKIP.has(e.name)) yield* walkFs(p);
    } else if (e.isFile && /\.(ts|tsx|mts|cts)$/.test(p)) {
      yield p;
    }
  }
}

if (import.meta.main) {
  let ok = true;
  for await (const f of walkFs(".")) ok = (await lintFile(f)) && ok;
  if (!ok) Deno.exit(1);
}
