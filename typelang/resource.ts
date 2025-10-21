// typelang/resource.ts
// Resource Acquisition Is Initialization helpers built on top of the Resource effect.

import { Resource, type ResourceSpec } from "./effects.ts";
import { Capability, Combine, Eff } from "./types.ts";

type UnionToIntersection<U> = (U extends unknown ? (arg: U) => void : never) extends
  (arg: infer I) => void ? I
  : never;

type IntersectionOrEmpty<U> = [U] extends [never] ? {} : UnionToIntersection<U>;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

export type ResourceDescriptor<
  Value,
  AcquireCaps,
  ReleaseCaps,
> = Readonly<{
  readonly acquire: () => Eff<Value, AcquireCaps>;
  readonly release: (resource: Value) => Eff<void, ReleaseCaps>;
  readonly label?: string;
}>;

export type ResourceBlueprint<
  Value,
  AcquireCaps,
  ReleaseCaps,
> = () => ResourceDescriptor<Value, AcquireCaps, ReleaseCaps>;

type AnyDescriptor = ResourceDescriptor<any, unknown, unknown>;
type AnyBlueprint = ResourceBlueprint<any, unknown, unknown>;

type BlueprintRecord = Readonly<Record<string, AnyBlueprint>>;

type MergeBlueprintRecords<Groups extends readonly BlueprintRecord[]> = Simplify<
  IntersectionOrEmpty<Groups[number]>
>;

type DescriptorMap<Providers> = Simplify<
  {
    readonly [K in keyof Providers]: Providers[K] extends ResourceBlueprint<
      infer Value,
      infer AcquireCaps,
      infer ReleaseCaps
    > ? ResourceDescriptor<Value, AcquireCaps, ReleaseCaps>
      : never;
  }
>;

type ResourceValues<Descriptors> = {
  readonly [K in keyof Descriptors]: Descriptors[K] extends ResourceDescriptor<
    infer Value,
    unknown,
    unknown
  > ? Value
    : never;
};

type ResourceCaps<Descriptors> = IntersectionOrEmpty<
  Descriptors[keyof Descriptors] extends ResourceDescriptor<
    any,
    infer AcquireCaps,
    infer ReleaseCaps
  > ? Combine<AcquireCaps, ReleaseCaps>
    : never
>;

type ResourceCapability = Capability<"Resource", ResourceSpec>;

const mergeBlueprints = <Groups extends readonly BlueprintRecord[]>(
  groups: Groups,
): Simplify<Readonly<Record<string, AnyBlueprint>>> => {
  const merged: Record<string, AnyBlueprint> = {};
  for (const group of groups) {
    for (const [key, blueprint] of Object.entries(group)) {
      if (merged[key]) {
        throw new Error(
          `Duplicate resource binding for key "${key}" in use(...) scope`,
        );
      }
      if (typeof blueprint !== "function") {
        throw new Error(
          `Resource binding "${key}" must be a function returning a descriptor`,
        );
      }
      merged[key] = blueprint as AnyBlueprint;
    }
  }
  return Object.freeze({ ...merged });
};

const buildDescriptors = (
  providers: Readonly<Record<string, AnyBlueprint>>,
): Readonly<Record<string, AnyDescriptor>> => {
  const descriptors: Record<string, AnyDescriptor> = {};
  for (const [key, blueprint] of Object.entries(providers)) {
    const descriptor = blueprint();
    if (!descriptor || typeof descriptor.acquire !== "function") {
      throw new Error(`Resource "${key}" blueprint is missing acquire()`);
    }
    if (typeof descriptor.release !== "function") {
      throw new Error(`Resource "${key}" blueprint is missing release()`);
    }
    descriptors[key] = Object.freeze(descriptor) as AnyDescriptor;
  }
  return Object.freeze(descriptors);
};

export const defineResource = <
  Value,
  AcquireCaps,
  ReleaseCaps,
>(
  acquire: () => Eff<Value, AcquireCaps>,
  release: (resource: Value) => Eff<void, ReleaseCaps>,
  options: Readonly<{ label?: string }> = {},
): ResourceDescriptor<Value, AcquireCaps, ReleaseCaps> =>
  Object.freeze({
    acquire,
    release,
    label: options.label,
  });

export const use = <
  Groups extends readonly BlueprintRecord[],
>(...groups: Groups) => {
  const providers = mergeBlueprints(groups);

  type ProviderMap = MergeBlueprintRecords<Groups>;
  type Descriptors = DescriptorMap<ProviderMap>;
  type Values = ResourceValues<Descriptors>;
  type Caps = ResourceCaps<Descriptors>;
  type ScopeCaps = Combine<ResourceCapability, Caps>;

  return {
    in: <Result, BodyCaps>(
      body: (resources: Readonly<Values>) => Eff<Result, BodyCaps>,
    ): Eff<Result, Combine<ScopeCaps, BodyCaps>> => {
      const descriptors = buildDescriptors(providers);
      const scopeBody =
        ((resources: Readonly<Record<string, unknown>>) => body(resources as Readonly<Values>)) as (
          resources: Readonly<Record<string, unknown>>,
        ) => Eff<Result, BodyCaps>;

      return Resource.op.scope(descriptors, scopeBody) as unknown as Eff<
        Result,
        Combine<ScopeCaps, BodyCaps>
      >;
    },
  };
};

export type { ResourceValues };
