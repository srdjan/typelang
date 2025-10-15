import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fromFileUrl } from "https://deno.land/std@0.224.0/path/mod.ts";
import { lintSubset } from "../scripts/lint_subset.ts";

Deno.test("functional subset lint passes", async () => {
  const root = fromFileUrl(new URL("../", import.meta.url));
  const perm = await Deno.permissions.request({ name: "read", path: root });
  if (perm.state !== "granted") return;
  const ok = await lintSubset(root);
  assert(ok);
});

Deno.test("subset lint rejects if/else constructs", async () => {
  const root = fromFileUrl(new URL("../", import.meta.url));
  const read = await Deno.permissions.request({ name: "read", path: root });
  const tmpUrl = new URL("../app/__lint_tmp__.ts", import.meta.url);
  const tmpPath = fromFileUrl(tmpUrl);
  const write = await Deno.permissions.request({ name: "write", path: tmpPath });
  if (read.state !== "granted" || write.state !== "granted") return;

  try {
    await Deno.writeTextFile(
      tmpPath,
      `const flag = true;
if (flag) {
  console.log(flag);
}
const value = flag ? 1 : 0;
`,
    );
    const ok = await lintSubset(root);
    assertEquals(ok, false);
  } finally {
    try {
      await Deno.remove(tmpPath);
    } catch {
      // ignore cleanup failure
    }
  }
});
