/**
 * The search of the URL as the router reads and writes it. A value is text, except `true`, `false` and JSON in quotes
 * or brackets. A number is text: the search schemas read numbers from text. Thus the URL has `window=12` and `q=12`,
 * and both read back as the text "12". The default of the router reads `12` as a number and writes the text "12" as
 * `"12"` in quotes.
 */

const jsonStart = /^["[{]/;

function readValue(text: string): unknown {
  if (text === "true" || text === "false") {
    return text === "true";
  }
  if (!jsonStart.test(text)) {
    return text;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function writeValue(value: unknown): string {
  if (typeof value === "string") {
    return value === "true" || value === "false" || jsonStart.test(value) ? JSON.stringify(value) : value;
  }
  return typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
}

export function parseSearch(text: string): Record<string, unknown> {
  const search: Record<string, unknown> = {};
  for (const [key, value] of new URLSearchParams(text)) {
    search[key] = readValue(value);
  }
  return search;
}

export function stringifySearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value !== undefined) {
      params.set(key, writeValue(value));
    }
  }
  const text = params.toString();
  return text.length > 0 ? `?${text}` : "";
}
