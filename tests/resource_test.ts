import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { defineResource, handlers, ok, par, stack, use } from "../typelang/mod.ts";
import { getCurrentScopeController } from "../typelang/runtime.ts";

type TestResource = Readonly<{ label: string }>;

const blueprint = (label: string, events: string[]) => () =>
  defineResource<TestResource, unknown, {}, unknown, {}>(
    () => {
      events.push(`acquire ${label}`);
      return ok({ label });
    },
    (resource) => {
      events.push(`release ${resource.label}`);
      return ok(undefined);
    },
    { label },
  );

Deno.test("use cleans up resources on successful completion", async () => {
  const events: string[] = [];

  const result = await stack(handlers.Resource.scope()).run(() =>
    use(
      {
        file: blueprint("file", events),
      },
    ).in(({ file }) => {
      events.push(`body ${file.label}`);
      return ok("ok");
    })
  ) as unknown as string;

  assertEquals(result, "ok");
  assertEquals(events, ["acquire file", "body file", "release file"]);
});

Deno.test("use disposes multiple resources in LIFO order", async () => {
  const events: string[] = [];

  await stack(handlers.Resource.scope()).run(() =>
    use(
      {
        first: blueprint("first", events),
      },
      {
        second: blueprint("second", events),
      },
      {
        third: blueprint("third", events),
      },
    ).in(({ first, second, third }) => {
      events.push(`body ${first.label}/${second.label}/${third.label}`);
      return ok("done");
    })
  );

  assertEquals(events, [
    "acquire first",
    "acquire second",
    "acquire third",
    "body first/second/third",
    "release third",
    "release second",
    "release first",
  ]);
});

Deno.test("use cleans up when the body throws", async () => {
  const events: string[] = [];

  await assertRejects(
    () =>
      stack(handlers.Resource.scope()).run(() =>
        use(
          {
            file: blueprint("file", events),
          },
        ).in(() => {
          events.push("body error");
          // Return a never-typed expression so the body signature is satisfied while still throwing.
          return ((): never => {
            throw new Error("boom");
          })();
        })
      ),
    Error,
    "boom",
  );

  assertEquals(events, ["acquire file", "body error", "release file"]);
});

Deno.test("use cleans up resources when scope is cancelled", async () => {
  const events: string[] = [];

  await stack(handlers.Resource.scope()).run(async () =>
    par.race([
      () => ok("fast"),
      () =>
        use(
          {
            slow: blueprint("slow", events),
          },
        ).in(async ({ slow }) => {
          events.push(`body ${slow.label}`);
          await new Promise<void>((resolve, reject) => {
            const controller = getCurrentScopeController();
            const timer = setTimeout(resolve, 50);
            controller?.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                reject(new Error("aborted"));
              },
              { once: true },
            );
          }).catch(() => {});
          return ok("slow branch");
        }),
    ])
  );

  await new Promise((resolve) => setTimeout(resolve, 10));

  assert(
    events.includes("release slow"),
    "slow resource should be released after cancellation",
  );
});

Deno.test("nested use scopes clean up inner resources before outer", async () => {
  const events: string[] = [];

  await stack(handlers.Resource.scope()).run(() =>
    use(
      {
        outer: blueprint("outer", events),
      },
    ).in(({ outer }) =>
      use(
        {
          inner: blueprint("inner", events),
        },
      ).in(({ inner }) => {
        events.push(`body ${outer.label}+${inner.label}`);
        return ok("nested");
      })
    )
  );

  assertEquals(events, [
    "acquire outer",
    "acquire inner",
    "body outer+inner",
    "release inner",
    "release outer",
  ]);
});
