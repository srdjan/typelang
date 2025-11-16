// typelang/resource.ts
// Resource Acquisition Is Initialization helpers built on top of the Resource effect.

import { Resource } from "./effects.ts";
import { type Result } from "./errors.ts";
import { type Combine } from "./interfaces.ts";

type UnionToIntersection<U> = (U extends unknown ? (arg: U) => void : never) extends
  (arg: infer I) => void ? I
  : never;

type IntersectionOrEmpty<U> = [U] extends [never] ? {} : UnionToIntersection<U>;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

export type ResourceDescriptor<
  Value,
  AcquireError,
  AcquireEffects,
  ReleaseError,
  ReleaseEffects,
> = Readonly<{
  readonly acquire: () => Result<Value, AcquireError, AcquireEffects>;
  readonly release: (resource: Value) => Result<void, ReleaseError, ReleaseEffects>;
  readonly label?: string;
}>;

export type ResourceBlueprint<
  Value,
  AcquireError,
  AcquireEffects,
  ReleaseError,
  ReleaseEffects,
> = () => ResourceDescriptor<Value, AcquireError, AcquireEffects, ReleaseError, ReleaseEffects>;

type AnyDescriptor = ResourceDescriptor<any, unknown, unknown, unknown, unknown>;
type AnyBlueprint = ResourceBlueprint<any, unknown, unknown, unknown, unknown>;

type BlueprintRecord = Readonly<Record<string, AnyBlueprint>>;

type MergeBlueprintRecords<Groups extends readonly BlueprintRecord[]> = Simplify<
  IntersectionOrEmpty<Groups[number]>
>;

type DescriptorMap<Providers> = Simplify<
  {
    readonly [K in keyof Providers]: Providers[K] extends ResourceBlueprint<
      infer Value,
      infer AcquireError,
      infer AcquireEffects,
      infer ReleaseError,
      infer ReleaseEffects
    > ? ResourceDescriptor<Value, AcquireError, AcquireEffects, ReleaseError, ReleaseEffects>
      : never;
  }
>;

type ResourceValues<Descriptors> = {
  readonly [K in keyof Descriptors]: Descriptors[K] extends ResourceDescriptor<
    infer Value,
    unknown,
    unknown,
    unknown,
    unknown
  > ? Value
    : never;
};

type ResourceEffects<Descriptors> = IntersectionOrEmpty<
  Descriptors[keyof Descriptors] extends ResourceDescriptor<
    any,
    any,
    infer AcquireEffects,
    any,
    infer ReleaseEffects
  > ? Combine<AcquireEffects, ReleaseEffects>
    : never
>;

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
  AcquireError,
  AcquireEffects,
  ReleaseError,
  ReleaseEffects,
>(
  acquire: () => Result<Value, AcquireError, AcquireEffects>,
  release: (resource: Value) => Result<void, ReleaseError, ReleaseEffects>,
  options: Readonly<{ label?: string }> = {},
): ResourceDescriptor<Value, AcquireError, AcquireEffects, ReleaseError, ReleaseEffects> =>
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
  type Effects = ResourceEffects<Descriptors>;

  return {
    in: <ResultValue, ResultError, BodyEffects>(
      body: (
        resources: Readonly<Values>,
      ) =>
        | Result<ResultValue, ResultError, BodyEffects>
        | Promise<Result<ResultValue, ResultError, BodyEffects>>,
    ): Result<ResultValue, ResultError, Combine<Effects, BodyEffects>> => {
      const descriptors = buildDescriptors(providers);
      const scopeBody =
        ((resources: Readonly<Record<string, unknown>>) => body(resources as Readonly<Values>)) as (
          resources: Readonly<Record<string, unknown>>,
        ) =>
          | Result<ResultValue, ResultError, BodyEffects>
          | Promise<
            Result<ResultValue, ResultError, BodyEffects>
          >;

      return Resource.scope(descriptors, scopeBody) as unknown as Result<
        ResultValue,
        ResultError,
        Combine<Effects, BodyEffects>
      >;
    },
  };
};

export type { ResourceValues };
