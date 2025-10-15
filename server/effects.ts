// server/effects.ts
// Optional: bridge to typelang effect declarations (not used by server core)
import { defineEffect } from "../typelang/mod.ts";
export interface ConsoleSpec { log(msg: string): void }
export const Console = defineEffect<"Console", ConsoleSpec>("Console");
export interface ExceptionSpec { fail<E>(e: E): never }
export const Exception = defineEffect<"Exception", ExceptionSpec>("Exception");
export interface EnvSpec { getEnv(k: string): string | undefined }
export const Env = defineEffect<"Env", EnvSpec>("Env");
export interface TimeSpec { now(): number }
export const Time = defineEffect<"Time", TimeSpec>("Time");
