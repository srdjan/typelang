// server/highlight.ts
// Imperative syntax highlighter for showcase code snippets (excluded from subset checks).

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const keywords = new Set([
  "const",
  "return",
  "await",
  "export",
  "type",
  "import",
  "from",
  "as",
  "async",
  "readonly",
  "extends",
]);

const builtIns = new Set(["seq", "par", "match", "pipe"]);
const literals = new Set(["true", "false", "null", "undefined"]);
const effects = new Set(["Console", "State", "Exception", "Async"]);

const isIdentifierStart = (char: string) => /[A-Za-z_$]/.test(char);
const isIdentifierPart = (char: string) => /[A-Za-z0-9_$]/.test(char);
const isNumeric = (char: string) => /[0-9]/.test(char);
const isWhitespace = (char: string) => char === " " || char === "\t";

const skipString = (code: string, start: number) => {
  const quote = code[start];
  let index = start + 1;
  while (index < code.length) {
    const char = code[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === quote) {
      return index + 1;
    }
    index++;
  }
  return code.length;
};

const skipTemplate = (code: string, start: number): number => {
  let index = start + 1;
  while (index < code.length) {
    const char = code[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === "`") {
      return index + 1;
    }
    if (char === "$" && code[index + 1] === "{") {
      index = skipTemplateExpression(code, index + 2);
      continue;
    }
    index++;
  }
  return code.length;
};

const skipTemplateExpression = (code: string, start: number): number => {
  let depth = 1;
  let index = start;
  while (index < code.length && depth > 0) {
    const char = code[index];
    if (char === "'" || char === '"') {
      index = skipString(code, index);
      continue;
    }
    if (char === "`") {
      index = skipTemplate(code, index);
      continue;
    }
    if (char === "{") {
      depth++;
      index++;
      continue;
    }
    if (char === "}") {
      depth--;
      index++;
      if (depth === 0) return index;
      continue;
    }
    if (char === "\\" && index + 1 < code.length) {
      index += 2;
      continue;
    }
    index++;
  }
  return index;
};

const readComment = (code: string, start: number): readonly [string, number, string] => {
  if (code[start + 1] === "/") {
    let index = start + 2;
    while (index < code.length && code[index] !== "\n") index++;
    const value = code.slice(start, index);
    return [value, index, "comment"];
  }
  let index = start + 2;
  while (index < code.length) {
    if (code[index] === "*" && code[index + 1] === "/") {
      index += 2;
      break;
    }
    index++;
  }
  const value = code.slice(start, index);
  return [value, index, "comment"];
};

const readNumber = (code: string, start: number): readonly [string, number] => {
  let index = start;
  let seenDot = false;
  while (index < code.length) {
    const char = code[index];
    if (char === "." && !seenDot) {
      seenDot = true;
      index++;
      continue;
    }
    if (!isNumeric(char)) break;
    index++;
  }
  return [code.slice(start, index), index];
};

const highlightTemplate = (code: string, start: number): readonly [string, number] => {
  const segments: string[] = [`<span class="token string">\`</span>`];
  let index = start + 1;
  let chunkStart = index;

  const flushChunk = (end: number) => {
    if (end <= chunkStart) return;
    const raw = code.slice(chunkStart, end);
    segments.push(`<span class="token string">${escapeHtml(raw)}</span>`);
  };

  while (index < code.length) {
    const char = code[index];
    if (char === "\\") {
      index += 2;
      continue;
    }

    if (char === "$" && code[index + 1] === "{") {
      flushChunk(index);
      const expressionStart = index + 2;
      const expressionEnd = skipTemplateExpression(code, expressionStart);
      const expression = code.slice(expressionStart, expressionEnd - 1);
      segments.push(`<span class="token interpolation">\${</span>`);
      segments.push(highlightCode(expression));
      segments.push(`<span class="token interpolation">}</span>`);
      index = expressionEnd;
      chunkStart = index;
      continue;
    }

    if (char === "`") {
      flushChunk(index);
      segments.push(`<span class="token string">\`</span>`);
      return [segments.join(""), index + 1];
    }

    index++;
  }

  flushChunk(index);
  segments.push(`<span class="token string">\`</span>`);
  return [segments.join(""), code.length];
};

const pushPlain = (tokens: string[], text: string) => {
  if (text.length === 0) return;
  tokens.push(escapeHtml(text));
};

const pushSpan = (tokens: string[], text: string, className: string) => {
  if (text.length === 0) return;
  tokens.push(`<span class="token ${className}">${escapeHtml(text)}</span>`);
};

export const highlightCode = (code: string): string => {
  const tokens: string[] = [];
  const length = code.length;

  let index = 0;
  while (index < length) {
    const char = code[index];

    if (char === "\n") {
      tokens.push("\n");
      index++;
      continue;
    }

    if (isWhitespace(char)) {
      const start = index;
      while (index < length && isWhitespace(code[index])) index++;
      pushPlain(tokens, code.slice(start, index));
      continue;
    }

    if (char === "/" && (code[index + 1] === "/" || code[index + 1] === "*")) {
      const [value, nextIndex, className] = readComment(code, index);
      pushSpan(tokens, value, className);
      index = nextIndex;
      continue;
    }

    if (char === "'" || char === '"') {
      const end = skipString(code, index);
      pushSpan(tokens, code.slice(index, end), "string");
      index = end;
      continue;
    }

    if (char === "`") {
      const [value, end] = highlightTemplate(code, index);
      tokens.push(value);
      index = end;
      continue;
    }

    if (isNumeric(char) || (char === "." && isNumeric(code[index + 1] ?? ""))) {
      const [value, end] = readNumber(code, index);
      pushSpan(tokens, value, "number");
      index = end;
      continue;
    }

    if (isIdentifierStart(char)) {
      let end = index + 1;
      while (end < length && isIdentifierPart(code[end])) end++;
      const value = code.slice(index, end);
      if (keywords.has(value)) {
        pushSpan(tokens, value, "keyword");
      } else if (builtIns.has(value)) {
        pushSpan(tokens, value, "function");
      } else if (effects.has(value)) {
        pushSpan(tokens, value, "effect");
      } else if (literals.has(value)) {
        pushSpan(tokens, value, "literal");
      } else {
        pushSpan(tokens, value, "identifier");
      }
      index = end;
      continue;
    }

    const twoChar = code.slice(index, index + 2);
    const threeChar = code.slice(index, index + 3);

    if (["=>", "==", "!!", "::", "&&", "||", "??"].includes(twoChar)) {
      pushSpan(tokens, twoChar, "operator");
      index += 2;
      continue;
    }

    if (["===", "!=="].includes(threeChar)) {
      pushSpan(tokens, threeChar, "operator");
      index += 3;
      continue;
    }

    pushSpan(tokens, char, "{}()[].,;:+-*/%=&|!<>?".includes(char) ? "operator" : "identifier");
    index++;
  }

  return tokens.join("");
};
