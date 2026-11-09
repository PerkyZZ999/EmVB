import { FlatStyleProps } from "../../../../core/index.ts";

/** Style keys a container-query style may set (W-398). */
export const QUERY_STYLE_KEYS: readonly string[] = Object.keys(FlatStyleProps.shape).toSorted();

/** A stored style value as one line of text: `16px`, `auto`, `#112233`, `var(--name)` (W-398). */
export function formatStyleValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).length === 2 &&
      typeof record["value"] === "number" &&
      typeof record["unit"] === "string"
    ) {
      return `${record["value"]}${record["unit"]}`;
    }
    // W-696: a length or font variable carries `from`; it showed as raw JSON.
    if (
      typeof record["var"] === "string" &&
      Object.keys(record).every((k) => k === "var" || k === "from")
    ) {
      return `var(--${record["var"]})`;
    }
  }
  return JSON.stringify(value);
}

// W-695: numbers read as in the Style tab's length fields: ".5rem", "+2px", "1.5 rem" and "2."
// were refused here though the Style tab takes them.
const NUMBER = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)`;
const LENGTH = new RegExp(String.raw`^(${NUMBER})\s*([a-z%]+)$`, "i");
const BARE = new RegExp(`^${NUMBER}$`);

/** Readings of `text` to try, most specific first. */
/**
 * W-696: the variable kinds `key` reads, most likely first. A bare `{ var }` is a colour, so
 * "var(--space-4)" on a padding stored a colour reference and the style was silently dropped.
 */
function varKinds(key: string): (string | undefined)[] {
  if (key === "color" || key === "backgroundColor" || key === "borderColor") return [undefined];
  if (key === "fontFamily") return ["font"];
  if (key === "fontSize") return ["fontSize", "spacing"];
  return ["spacing", "fontSize"];
}

function candidates(text: string, key: string): unknown[] {
  const out: unknown[] = [];
  const length = LENGTH.exec(text);
  if (length) out.push({ value: Number(length[1]), unit: (length[2] as string).toLowerCase() });
  const variable = /^var\(--([a-z0-9-]{1,40})\)$/.exec(text);
  if (variable) {
    for (const from of varKinds(key))
      out.push(from ? { var: variable[1], from } : { var: variable[1] });
  }
  if (BARE.test(text)) {
    out.push(Number(text));
    // W-404: a bare number on a length property means px, as in the Style tab.
    out.push({ value: Number(text), unit: "px" });
  }
  // W-404: keywords are lowercase in the schema; AUTO or Row should still work.
  if (/^[A-Za-z-]+$/.test(text) && text !== text.toLowerCase()) out.push(text.toLowerCase());
  if (text === "true" || text === "false") out.push(text === "true");
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      out.push(JSON.parse(text));
    } catch {
      // not JSON; the plain string reading below reports the error
    }
  }
  out.push(text);
  return out;
}

/** The value `key` would store for `text`, or why it can't (W-398). */
export function parseStyleValue(key: string, text: string): { value: unknown } | { error: string } {
  // W-542: an inherited name ("constructor") is not a style property; it used to throw.
  const shape = FlatStyleProps.shape as Record<
    string,
    { safeParse: (v: unknown) => { success: boolean } }
  >;
  const schema = Object.hasOwn(shape, key) ? shape[key] : undefined;
  if (!schema) return { error: `${key} isn't a style property.` };
  const trimmed = text.trim();
  if (trimmed === "") return { error: "Enter a value." };
  if (/^[+-]?\d*,\d+\s*[a-z%]*$/i.test(trimmed))
    return { error: "Use a dot for decimals, such as 1.5." };
  for (const candidate of candidates(trimmed, key)) {
    if (candidate !== undefined && schema.safeParse(candidate).success) return { value: candidate };
  }
  return { error: `"${trimmed.slice(0, 40)}" isn't a value ${key} accepts.` };
}
