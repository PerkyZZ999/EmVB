/**
 * W-950: bold, italic, colour and links on part of a Heading's or Text's words. The text stays
 * plain (search, translation and agents read it as before); `marks` are ranges over it.
 */
import type { VNode } from "./render/vnode.ts";
import { cssColor } from "./sanitize/css.ts";
import { sanitizeHref } from "./sanitize/href.ts";
import type { LayoutNode, TextMark } from "./schema/layout.ts";

/** Distinct colours one element can use in its marks; a mark past them keeps the text colour. */
const MAX_MARK_COLORS = 8;

/** A mark's colour as CSS, or undefined when unset or refused. */
const colorOf = (mark: TextMark) => (mark.color === undefined ? undefined : cssColor(mark.color));

/**
 * The element's mark colours, in first-use order: each becomes `--emvb-mark-<n>` on the element
 * and `.emvb-mark-c<n>` on its words.
 */
export function markColors(marks: readonly TextMark[] | undefined): string[] {
  const out: string[] = [];
  for (const mark of marks ?? []) {
    const css = colorOf(mark);
    if (css && !out.includes(css) && out.length < MAX_MARK_COLORS) out.push(css);
  }
  return out;
}

type Run = {
  text: string;
  bold: boolean;
  italic: boolean;
  color?: number;
  href?: string;
  newTab: boolean;
};

/**
 * The text as nodes: words in marks wrapped in `<strong>`, `<em>`, a colour span and `<a>`
 * (consecutive words with the same link share one). Ranges are clipped to the text, links are
 * checked like any link, and `links: false` (an element that is a link itself) leaves them out.
 */
export function markedChildren(
  text: string,
  marks: readonly TextMark[] | undefined,
  links = true,
): (VNode | string)[] {
  if (!marks || marks.length === 0) return [text];
  const colors = markColors(marks);
  const clipped = marks.flatMap((mark) => {
    const start = Math.max(0, Math.min(mark.start, text.length));
    const end = Math.min(mark.end, text.length);
    return end > start ? [{ ...mark, start, end }] : [];
  });
  if (clipped.length === 0) return [text];
  const cuts = [...new Set([0, text.length, ...clipped.flatMap((m) => [m.start, m.end])])].toSorted(
    (a, b) => a - b,
  );
  const runs: Run[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const from = cuts[i] as number;
    const to = cuts[i + 1] as number;
    const on = clipped.filter((m) => m.start <= from && m.end >= to);
    const colored = on.findLast((m) => colorOf(m) !== undefined);
    const colorIndex = colored ? colors.indexOf(colorOf(colored) as string) : -1;
    const linked = links ? on.find((m) => m.href && sanitizeHref(m.href)) : undefined;
    runs.push({
      text: text.slice(from, to),
      bold: on.some((m) => m.bold),
      italic: on.some((m) => m.italic),
      ...(colorIndex >= 0 ? { color: colorIndex } : {}),
      ...(linked ? { href: sanitizeHref(linked.href as string) } : {}),
      newTab: linked?.newTab === true,
    });
  }
  const out: (VNode | string)[] = [];
  let link: VNode | undefined;
  for (const run of runs) {
    let piece: VNode | string = run.text;
    if (run.color !== undefined)
      piece = { tag: "span", attrs: { class: `emvb-mark-c${run.color}` }, children: [piece] };
    if (run.italic) piece = { tag: "em", attrs: {}, children: [piece] };
    if (run.bold) piece = { tag: "strong", attrs: {}, children: [piece] };
    if (!run.href) {
      link = undefined;
      out.push(piece);
      continue;
    }
    const same =
      link && link.attrs["href"] === run.href && (link.attrs["target"] === "_blank") === run.newTab;
    if (link && same) {
      link.children.push(piece);
      continue;
    }
    link = {
      tag: "a",
      attrs: {
        class: "emvb-mark-link",
        href: run.href,
        ...(run.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {}),
      },
      children: [piece],
    };
    out.push(link);
  }
  return out;
}

/** The CSS for mark colours; sent only on pages whose elements set one. */
export const MARK_CSS = Array.from(
  { length: MAX_MARK_COLORS },
  (_, n) => `.emvb-mark-c${n}{color:var(--emvb-mark-${n})}`,
).join("");

/**
 * W-950: marks follow an edit of the text. The edit is the changed middle between the unchanged
 * start and end: marks after it move, marks inside it shrink, and a mark left empty is dropped.
 */
export function shiftMarks(before: string, after: string, marks: readonly TextMark[]): TextMark[] {
  if (before === after) return [...marks];
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head++;
  let tail = 0;
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  )
    tail++;
  const removedEnd = before.length - tail;
  const delta = after.length - before.length;
  // Text typed right after a mark stays out of it, and so does text typed right before one.
  const move = (at: number, isEnd: boolean) => {
    if (isEnd ? at <= head : at < head) return at;
    if (at >= removedEnd) return at + delta;
    // Inside the replaced part: a start goes to its end, an end to its start.
    return isEnd ? head : head + (after.length - tail - head);
  };
  return marks.flatMap((mark) => {
    const start = move(mark.start, false);
    const end = Math.max(start, move(mark.end, true));
    return end > start ? [{ ...mark, start, end }] : [];
  });
}

/** The formats a mark can carry; a link's `newTab` goes with its `href`. */
export type MarkFormat = "bold" | "italic" | "color" | "href";

const FORMAT_KEYS: Record<MarkFormat, readonly (keyof TextMark)[]> = {
  bold: ["bold"],
  italic: ["italic"],
  color: ["color"],
  href: ["href", "newTab"],
};

const hasAnyFormat = (mark: TextMark) =>
  mark.bold === true || mark.italic === true || mark.color !== undefined || mark.href !== undefined;

/** True when every character from `start` to `end` has `format`. */
export function hasFormat(
  marks: readonly TextMark[] | undefined,
  start: number,
  end: number,
  format: MarkFormat,
): boolean {
  if (end <= start) return false;
  for (let at = start; at < end; at++) {
    if (!(marks ?? []).some((m) => m.start <= at && m.end > at && m[format] !== undefined))
      return false;
  }
  return true;
}

/** `format` taken off the characters from `start` to `end`; marks around them are split. */
export function unsetFormat(
  marks: readonly TextMark[] | undefined,
  start: number,
  end: number,
  format: MarkFormat,
): TextMark[] {
  return (marks ?? []).flatMap((mark) => {
    if (mark[format] === undefined || mark.end <= start || mark.start >= end) return [mark];
    const parts: TextMark[] = [];
    if (mark.start < start) parts.push({ ...mark, end: start });
    const middle: TextMark = {
      ...mark,
      start: Math.max(mark.start, start),
      end: Math.min(mark.end, end),
    };
    for (const key of FORMAT_KEYS[format]) delete middle[key];
    if (hasAnyFormat(middle)) parts.push(middle);
    if (mark.end > end) parts.push({ ...mark, start: end });
    return parts;
  });
}

/** The characters from `start` to `end` get `format` (replacing any they had). */
export function setFormat(
  marks: readonly TextMark[] | undefined,
  start: number,
  end: number,
  format: Partial<Pick<TextMark, "bold" | "italic" | "color" | "href" | "newTab">>,
): TextMark[] {
  let next = [...(marks ?? [])];
  for (const key of Object.keys(format) as (keyof typeof format)[]) {
    if (key !== "newTab") next = unsetFormat(next, start, end, key);
  }
  return [...next, { start, end, ...format }];
}

/**
 * W-950: after an edit that changed a Heading's or Text's words but not its marks, the marks
 * follow the words (`shiftMarks`); a node left with none drops `marks`.
 */
export function withShiftedMarks(before: LayoutNode, after: LayoutNode): LayoutNode {
  if (after.type !== "heading" && after.type !== "text") return after;
  const was = before.props as { text?: unknown; marks?: TextMark[] };
  const now = after.props as { text?: unknown; marks?: TextMark[] };
  if (!now.marks || now.marks !== was.marks) return after;
  if (typeof was.text !== "string" || typeof now.text !== "string" || was.text === now.text)
    return after;
  const marks = shiftMarks(was.text, now.text, now.marks);
  const props: Record<string, unknown> = { ...after.props };
  if (marks.length > 0) props["marks"] = marks;
  else delete props["marks"];
  return { ...after, props } as LayoutNode;
}
