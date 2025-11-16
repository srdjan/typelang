const EXAMPLES_ROOT = new URL("../examples/", import.meta.url);

type StartFn = () => unknown;

const listExamples = async (): Promise<string[]> => {
  const entries: string[] = [];
  for await (const entry of Deno.readDir(EXAMPLES_ROOT)) {
    if (!entry.isDirectory) continue;
    const mainPath = new URL(`./${entry.name}/main.ts`, EXAMPLES_ROOT);
    try {
      const stat = await Deno.stat(mainPath);
      if (stat.isFile) {
        entries.push(entry.name);
      }
    } catch {
      // Ignore directories without a main.ts
    }
  }
  return entries.sort();
};

const [requested = "showcase"] = Deno.args;
const available = await listExamples();

if (!available.includes(requested)) {
  console.error(
    `Unknown example "${requested}". Available examples: ${available.join(", ") || "(none)"}`,
  );
  Deno.exit(1);
}

const entry = new URL(`./${requested}/main.ts`, EXAMPLES_ROOT);
const module = await import(entry.href);
const start: StartFn | undefined = typeof module.start === "function"
  ? module.start
  : typeof module.default === "function"
  ? module.default
  : typeof module.startShowcase === "function"
  ? module.startShowcase
  : undefined;

if (!start) {
  console.error(`Example "${requested}" does not export a callable start() function.`);
  Deno.exit(1);
}

console.log(`[typelang] Starting "${requested}" example...`);
start();
