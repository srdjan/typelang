# Resource Effect & `use` Scope Design (October 21, 2025)

## Goals

- Provide a Gleam-inspired `use` construct that automatically acquires and disposes resources.
- Integrate with typelang's algebraic effects runtime so resources clean up under normal completion,
  exceptions, and cancellation.
- Guarantee LIFO cleanup order, leverage the existing `CancellationContext`, and keep the public
  surface compliant with typelang's functional subset (no classes, no mutable state exposed).

## High-Level Design

- Introduce a new built-in effect `Resource` with a single `scope` operation. The operation
  receives:
  1. A record of resource descriptors (one per named binding).
  2. The user-supplied body callback that consumes the acquired resources.
- A new module `typelang/resource.ts` exposes helpers:
  - `defineResource(acquire, release, options?)` – declarative descriptor constructor.
  - `use(...descriptors).in(body)` – orchestrates `Resource.scope`, supplying the acquired values to
    `body`.
- Resource descriptors are pure data:
  `{ acquire: () => Eff<Value, CapsA>; release: (value: Value) => Eff<void, CapsR>; label?: string }`.
  - `acquire` runs inside the scope and may use arbitrary effects.
  - `release` runs during cleanup, receives the acquired value, and may use effects as well.

## Runtime Integration

- `Resource` handler lives alongside existing built-ins in `typelang/runtime.ts`.
- The handler wraps each `scope` invocation with `withChildScope`, creating an isolated
  `AbortController`.
- Resources are acquired sequentially. After each acquisition, the handler registers a cleanup with
  `ctx.onCancel`, capturing the value and descriptor.
- Cleanups run via the runtime's existing `runCleanups` machinery, which fires in LIFO order and
  already respects controller cancellation.
- Because `withChildScope` always drains the cleanup stack in its `finally` block, resources are
  disposed on:
  - Normal completion of the body.
  - Exceptions thrown while acquiring or inside the body.
  - External cancellation (controller abort), including the existing `CancellationContext`
    propagation.

## Lifecycle

1. **Acquire** – call `descriptor.acquire()`; freeze and stash the resulting value.
2. **Register** – `ctx.onCancel(async () => await resolveEff(descriptor.release(value)))`.
3. **Use** – invoke the user body with an immutable snapshot of all resource values.
4. **Cleanup** – when the scope exits (for any reason) the runtime executes registered cleanups in
   reverse order. Errors are caught and logged with resource labels; they never propagate.

## Failure & Cancellation Semantics

- Acquisition failures short-circuit the loop; previously registered resources still dispose because
  their cleanups are already enqueued.
- Cleanup errors are logged as `[Resource] Cleanup error for "<label>"` but swallowed, matching the
  requirement to log without propagating.
- If the scope is aborted before or during the body, `withChildScope` still drains cleanups thanks
  to the abort signal. The body can inspect `ctx.signal.aborted` if it needs to detect cancellation.
- `CancellationContext.onCancel()` remains the single registration point, satisfying the requirement
  to reuse the existing cancellation API.

## Type Surface

- `defineResource<A, AcquireCaps, ReleaseCaps>` returns a descriptor with an optional diagnostic
  `label`.
- `use(...records).in` merges multiple descriptor records (supporting the Gleam-style multi-binding
  syntax) and infers:
  - The resource record supplied to the body (`{ readonly [name]: Value }`).
  - The capability requirements: intersection of all acquire/release capabilities plus
    `Capability<"Resource", ResourceSpec>` and whatever `body` needs.
- The helper enforces unique binding names at runtime, throwing early on duplicates to prevent
  accidental overwrites.

## Interop & Nesting

- Works inside `seq`, `par`, and arbitrary handler stacks because it composes purely through
  effects.
- Nested `use` scopes naturally create nested child controllers, giving each scope independent
  cleanup ordering.
- `par` helpers benefit from the controller linkage: canceling parallel branches aborts their
  resource scopes, triggering cleanup automatically.

## Open Questions (deferred)

- Streaming cleanup logs into `Console` effect rather than `console.error`.
- Optional resource timeouts or retries for acquisition.
- API sugar for single-resource scopes (e.g., `using(descriptor, body)`).
