import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fromFileUrl } from "https://deno.land/std@0.224.0/path/mod.ts";
import { lintSubset, scan } from "../scripts/lint_subset.ts";

Deno.test("functional subset lint passes on valid code", async () => {
  const root = fromFileUrl(new URL("../", import.meta.url));
  const perm = await Deno.permissions.request({ name: "read", path: root });
  if (perm.state !== "granted") return;
  const ok = await lintSubset(root);
  assert(ok, "Linter should pass on current codebase");
});

Deno.test("scan rejects if statement", () => {
  const source = `const flag = true;
if (flag) {
  console.log(flag);
}`;
  const diagnostics = scan("test.ts", source);
  assertEquals(diagnostics.length, 1);
  assert(diagnostics[0].message.includes("if"));
});

Deno.test("scan rejects else statement", () => {
  const source = `const flag = true;
if (flag) {
  console.log("yes");
} else {
  console.log("no");
}`;
  const diagnostics = scan("test.ts", source);
  assertEquals(diagnostics.length >= 2, true); // Both if and else
  assert(diagnostics.some((d) => d.message.includes("if") || d.message.includes("else")));
});

Deno.test("scan rejects ternary operator", () => {
  const source = `const value = flag ? 1 : 0;`;
  const diagnostics = scan("test.ts", source);
  assertEquals(diagnostics.length, 1);
  assert(diagnostics[0].message.includes("?:"));
});

Deno.test("scan rejects class keyword", () => {
  const source = `class MyClass {
  constructor() {}
}`;
  const diagnostics = scan("test.ts", source);
  assert(diagnostics.length > 0, `Expected violations, got: ${JSON.stringify(diagnostics)}`);
  assert(diagnostics.some((d) => d.message.toLowerCase().includes("class")));
});

Deno.test("scan rejects this keyword", () => {
  const source = `const obj = { method() { return this.value; } };`;
  const diagnostics = scan("test.ts", source);
  assert(diagnostics.some((d) => d.message.includes("this")));
});

Deno.test("scan rejects for loop", () => {
  const source = `for (let i = 0; i < 10; i++) {
  console.log(i);
}`;
  const diagnostics = scan("test.ts", source);
  assert(diagnostics.some((d) => d.message.includes("for")));
});

Deno.test("scan rejects while loop", () => {
  const source = `while (true) {
  break;
}`;
  const diagnostics = scan("test.ts", source);
  assert(diagnostics.some((d) => d.message.includes("while")));
});

Deno.test("scan rejects let declaration", () => {
  const source = `let x = 5;`;
  const diagnostics = scan("test.ts", source);
  assert(diagnostics.some((d) => d.message.includes("let")));
});

Deno.test("scan rejects var declaration", () => {
  const source = `var x = 5;`;
  const diagnostics = scan("test.ts", source);
  assert(diagnostics.some((d) => d.message.includes("var")));
});

Deno.test("scan rejects increment operator", () => {
  const source = `let x = 0; x++;`;
  const diagnostics = scan("test.ts", source);
  assert(diagnostics.some((d) => d.message.includes("++")));
});

Deno.test("scan rejects decrement operator", () => {
  const source = `let x = 10; x--;`;
  const diagnostics = scan("test.ts", source);
  assert(diagnostics.some((d) => d.message.includes("--")));
});

Deno.test("scan allows const declaration", () => {
  const source = `const x = 5;
const y = { a: 1, b: 2 };
export const z = [1, 2, 3];`;
  const diagnostics = scan("test.ts", source);
  assertEquals(diagnostics.length, 0);
});

Deno.test("scan allows new Proxy", () => {
  const source = `const proxy = new Proxy({}, {});`;
  const diagnostics = scan("test.ts", source);
  assertEquals(diagnostics.length, 0);
});

Deno.test("scan rejects new for other constructors", () => {
  const source = `const date = new Date();`;
  const diagnostics = scan("test.ts", source);
  assert(diagnostics.some((d) => d.message.includes("new")));
});

Deno.test("scan ignores violations in comments", () => {
  const source = `// This is a comment with if and class
/* Block comment with while and for */
const x = 5;`;
  const diagnostics = scan("test.ts", source);
  assertEquals(diagnostics.length, 0);
});

Deno.test("scan ignores violations in strings", () => {
  const source = `const msg = "if you use class or while";
const template = \`for loops and let are bad\`;`;
  const diagnostics = scan("test.ts", source);
  assertEquals(diagnostics.length, 0);
});
