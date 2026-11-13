/** Server-enforced budgets (N-005). Real D1 caps rows at 2 MB but local D1 doesn't (K12, S0-8). */
export const MAX_LAYOUT_BYTES = 512 * 1024;
/** Plugin storage compare-and-set fails above 1 MiB (S0-9); the design doc budget stays well below. */
export const MAX_DESIGN_BYTES = 256 * 1024;
export const MAX_DEPTH = 24;
export const MAX_NODES = 2000;
export const MAX_TEXT_LENGTH = 2000;
/** Tabs show at most this many panels; the CSS-only switcher has a rule per tab. */
export const MAX_TABS = 12;
/** W-1024: most links one Social icons element holds. */
export const MAX_SOCIAL_LINKS = 20;

/**
 * W-509: `text` cut to at most `max` UTF-16 units, as schema limits count, without leaving half
 * of an emoji (a lone surrogate), an accent's base letter or half a flag at the end.
 */
export function clipText(text: string, max: number): string {
  if (text.length <= max) return text;
  // W-543: whole characters as people see them, so an accent or half a flag isn't left behind.
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    let end = 0;
    for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
      text.slice(0, max + 32),
    )) {
      if (end + segment.length > max) break;
      end += segment.length;
    }
    return text.slice(0, end);
  }
  const code = text.charCodeAt(max - 1);
  return text.slice(0, code >= 0xd800 && code <= 0xdbff ? max - 1 : max);
}

/**
 * D-065 (W-925): a key this version does not know is kept untouched, on a node, its props and
 * its style records only, and never rendered. These bound what such a key may hold.
 */
export const UNKNOWN_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.:/@-]{0,127}$/;
export const MAX_UNKNOWN_KEYS = 32;
export const MAX_UNKNOWN_DEPTH = 16;

/** W-928: proposals are bounded separately from the resulting page and site styles. */
export const MAX_PROPOSAL_OPS = 100;
export const MAX_PROPOSAL_BYTES = MAX_LAYOUT_BYTES;
export const MAX_PROPOSALS = 100;
/** W-933: one page can't hold the whole store; an agent withdraws or waits for review. */
export const MAX_PENDING_PER_PAGE = 10;
/** W-931: a request to an agent is a short brief, and a page holds a few at a time. */
export const MAX_REQUEST_PROMPT = 2000;
export const MAX_OPEN_REQUESTS_PER_PAGE = 5;
export const MAX_PROPOSAL_DEPTH = MAX_DEPTH * 2 + 16;
