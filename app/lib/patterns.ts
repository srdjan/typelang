// app/lib/patterns.ts
// Shared helpers for Bool tags, Option values, and HTML escaping.

import { match } from "../../typelang/match.ts";

export type BoolTag =
  | Readonly<{ tag: "True" }>
  | Readonly<{ tag: "False" }>;

const boolTags: readonly BoolTag[] = [
  { tag: "False" } as const,
  { tag: "True" } as const,
] as const;

export const toBoolTag = (flag: boolean): BoolTag => boolTags[Number(flag)];

export type Option<T> =
  | Readonly<{ tag: "Some"; value: T }>
  | Readonly<{ tag: "None" }>;

const optionTags = [
  { tag: "None" } as const,
  { tag: "Some" } as const,
] as const;

export const option = <T>(value: T | null | undefined): Option<T> => {
  const tag = optionTags[Number(value !== null && value !== undefined)];
  return match(tag, {
    Some: () => ({ tag: "Some", value: value as T }),
    None: () => ({ tag: "None" }),
  });
};

export const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
