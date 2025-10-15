// typelang/effects.ts
// Built-in effect declarations aligned with the runtime handler stack.

import { Capability, defineEffect, Eff } from "./mod.ts";

export interface ConsoleSpec {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export const Console = defineEffect<"Console", ConsoleSpec>("Console");

export interface ExceptionSpec {
  fail<E>(error: E): never;
}

export const Exception = defineEffect<"Exception", ExceptionSpec>("Exception");

export interface StateSpec<S> {
  get(): S;
  put(next: S): void;
  modify(update: (state: S) => S): void;
}

type StateCapability<S> = Capability<"State", StateSpec<S>>;

export const State = {
  spec: <S>() => defineEffect<"State", StateSpec<S>>("State"),
  get: <S>() => State.spec<S>().op.get(),
  put: <S>(next: S) => State.spec<S>().op.put(next),
  modify: <S>(update: (state: S) => S) => State.spec<S>().op.modify(update),
};

export interface AsyncSpec {
  sleep(ms: number): Promise<void>;
  await<T>(promise: Promise<T>): T;
}

export const Async = defineEffect<"Async", AsyncSpec>("Async");

export interface EnvSpec {
  getEnv(key: string): string | undefined;
}

export const Env = defineEffect<"Env", EnvSpec>("Env");

export interface TimeSpec {
  now(): number;
}

export const Time = defineEffect<"Time", TimeSpec>("Time");
