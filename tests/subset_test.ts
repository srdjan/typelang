import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fromFileUrl } from "https://deno.land/std@0.224.0/path/mod.ts";
import { lintSubset } from "../scripts/lint_subset.ts";

Deno.test("functional subset lint passes", async () => {
  const root = fromFileUrl(new URL("../", import.meta.url));
  const perm = await Deno.permissions.request({ name: "read", path: root });
  if (perm.state !== "granted") return;
  const ok = await lintSubset(root);
  assert(ok);
});
