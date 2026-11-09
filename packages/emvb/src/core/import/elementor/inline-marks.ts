/**
 * W-950: inline formatting kept from Elementor HTML. While a paragraph is read, every character
 * of its raw text carries the formatting around it (bold, italic, colour, link); this turns that
 * into marks over the cleaned text, following `cleanText` step by step so ranges line up.
 */
import { MAX_TEXT_MARKS, type TextMark } from "../../schema/layout.ts";

export type Fmt = { bold?: true; italic?: true; color?: string; href?: string };

// oxlint-disable-next-line no-control-regex -- the control characters cleanText drops
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/;

type Ch = { c: string; f: Fmt | undefined };

/**
 * Marks for `raw` (with one format per UTF-16 unit in `fmts`) once cleaned like `cleanText`.
 * Empty when the cleaned text isn't `expected`: then nothing can be misplaced.
 */
export function marksFromChars(
  raw: string,
  fmts: readonly (Fmt | undefined)[],
  keepBreaks: boolean,
  expected: string,
): TextMark[] {
  let chars: Ch[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i] === "\t" ? " " : (raw[i] as string);
    if (!CONTROL.test(c)) chars.push({ c, f: fmts[i] });
  }
  // [ \u00a0]+ → one space
  chars = chars.reduce<Ch[]>((out, ch) => {
    const space = ch.c === " " || ch.c === "\u00a0";
    if (space && out.at(-1)?.c === " ") return out;
    out.push(space ? { c: " ", f: ch.f } : ch);
    return out;
  }, []);
  // " ?\n ?" → "\n"
  chars = chars.filter(
    (ch, i) => !(ch.c === " " && (chars[i - 1]?.c === "\n" || chars[i + 1]?.c === "\n")),
  );
  // \n{3,} → \n\n
  chars = chars.filter(
    (ch, i) => !(ch.c === "\n" && chars[i - 1]?.c === "\n" && chars[i - 2]?.c === "\n"),
  );
  // trim
  while (chars.length > 0 && /\s/.test(chars[0]?.c ?? "")) chars.shift();
  while (chars.length > 0 && /\s/.test(chars.at(-1)?.c ?? "")) chars.pop();
  if (!keepBreaks) {
    // \n+ → one space
    chars = chars.flatMap((ch, i) =>
      ch.c !== "\n" ? [ch] : chars[i - 1]?.c === "\n" ? [] : [{ c: " ", f: ch.f }],
    );
  }
  if (chars.map((ch) => ch.c).join("") !== expected) return [];
  const marks: TextMark[] = [];
  let at = 0;
  while (at < chars.length) {
    const f = chars[at]?.f;
    const key = JSON.stringify(f ?? {});
    let end = at + 1;
    while (end < chars.length && JSON.stringify(chars[end]?.f ?? {}) === key) end++;
    if (f && (f.bold || f.italic || f.color || f.href)) {
      if (marks.length >= MAX_TEXT_MARKS) break;
      marks.push({ start: at, end, ...f });
    }
    at = end;
  }
  return marks;
}

/** The formatting a stack of open tags gives (inner tags win for colour). */
export function combine(stack: readonly Fmt[], href: string | undefined): Fmt | undefined {
  const out: Fmt = {};
  for (const f of stack) {
    if (f.bold) out.bold = true;
    if (f.italic) out.italic = true;
    if (f.color) out.color = f.color;
  }
  if (href) out.href = href;
  return Object.keys(out).length > 0 ? out : undefined;
}
