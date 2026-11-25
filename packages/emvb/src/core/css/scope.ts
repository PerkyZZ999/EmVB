/**
 * Per-render style scoping (W-112). A public page and each theme part are rendered on their own,
 * and each stylesheet repeats the base rules of the element types it uses. Without a scope, the
 * page's base rules come after a header's local rules on the same specificity and win. Every
 * selector here is prefixed with `:where(.emvb-s-<id>)`, so a sheet styles only the markup it was
 * rendered with. The scope is a class, not a `data-emvb-*` attribute, because published HTML
 * carries no `data-emvb` markers. `:where` adds no specificity, so the cascade inside a sheet and
 * against the host's own CSS stays as it was.
 */

const WRAPPER_CLASS = "emvb-scope";
const scopeClass = (token: string) => `emvb-s-${token}`;

/** A scope token that is safe in an attribute value and an attribute selector. */
export function cssScopeToken(id: string): string | undefined {
  const token = id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
  return token.length > 0 ? token : undefined;
}

/** The wrapper the scoped markup sits in. It takes no part in layout. */
export function scopeWrapperCss(): string {
  return `:where(.${WRAPPER_CLASS}){display:contents}`;
}

/** Classes on the scope wrapper. The editor's vnode and the public HTML both use them. */
export function scopeClassName(token: string): string {
  return `${WRAPPER_CLASS} ${scopeClass(token)}`;
}

/**
 * Reading a stylesheet's structure. Rules are found in a masked copy of the text, where the
 * contents of comments, strings and `url()` are blanked, so a `{`, `}`, `,` or `;` inside them
 * cannot split a rule. The same walk serves theme parts (`scopeCss`) and extensions
 * (`scopeExtensionCss`), and the build checks on an extension's stylesheet.
 */
/**
 * `css` with the contents of comments, strings and unquoted `url()` blanked, same length, so the
 * structure (braces, commas, semicolons) can be read without tripping on them. Comments become
 * spaces; strings and urls become `_`.
 */
function maskCss(css: string): string {
  const out = css.split("");
  const fill = (from: number, to: number, ch: string) => {
    for (let k = from; k < to; k++) out[k] = ch;
  };
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === "/" && css[i + 1] === "*") {
      const close = css.indexOf("*/", i + 2);
      const stop = close === -1 ? css.length : close + 2;
      fill(i, stop, " ");
      i = stop;
    } else if (ch === '"' || ch === "'") {
      let k = i + 1;
      while (k < css.length && css[k] !== ch) k += css[k] === "\\" ? 2 : 1;
      const stop = Math.min(k + 1, css.length);
      fill(i, stop, "_");
      i = stop;
    } else if ((ch === "u" || ch === "U") && /^url\(\s*(?!["'\s])/i.test(css.slice(i, i + 24))) {
      const close = css.indexOf(")", i + 4);
      const stop = close === -1 ? css.length : close;
      fill(i + 4, stop, "_");
      i = stop;
    } else i += 1;
  }
  return out.join("");
}

/** The index just past the `}` that closes the block opened at `open`. */
function blockEnd(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return css.length;
}
/** The `[start, end)` spans of the selectors in a rule's prelude, split at top-level commas. */
function selectorSpans(masked: string, from: number, to: number): [number, number][] {
  const spans: [number, number][] = [];
  let depth = 0;
  let start = from;
  const push = (end: number) => {
    let a = start;
    let b = end;
    while (a < b && /\s/.test(masked[a] ?? "")) a += 1;
    while (b > a && /\s/.test(masked[b - 1] ?? "")) b -= 1;
    if (b > a) spans.push([a, b]);
  };
  for (let k = from; k < to; k++) {
    const ch = masked[k];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      push(k);
      start = k + 1;
    }
  }
  push(to);
  return spans;
}
/**
 * One piece of a stylesheet range. `open` is the index of its `{`, or -1 for text with no block: a
 * statement at-rule (`@import`, `@charset`, `@layer a, b;`) or what is left at the end. `p` is where
 * the prelude starts (after whitespace and comments) and `preludeEnd` where it ends; `start` and
 * `end` bound the whole piece, leading whitespace and comments included.
 */
type Piece = { start: number; end: number; p: number; preludeEnd: number; open: number };
function* piecesIn(masked: string, from: number, to: number): Generator<Piece> {
  let i = from;
  while (i < to) {
    let p = i;
    while (p < to && /\s/.test(masked[p] ?? "")) p += 1;
    const open = p < to ? masked.indexOf("{", p) : -1;
    const semi = p < to ? masked.indexOf(";", p) : -1;
    // A statement at-rule ends at its `;`, before any block.
    if (masked[p] === "@" && semi !== -1 && semi < to && (open === -1 || semi < open)) {
      yield { start: i, end: semi + 1, p, preludeEnd: semi, open: -1 };
      i = semi + 1;
      continue;
    }
    if (open === -1 || open >= to) {
      yield { start: i, end: to, p, preludeEnd: to, open: -1 };
      return;
    }
    const end = Math.min(blockEnd(masked, open), to);
    let preludeEnd = open;
    while (preludeEnd > p && /\s/.test(masked[preludeEnd - 1] ?? "")) preludeEnd -= 1;
    yield { start: i, end, p, preludeEnd, open };
    i = end;
  }
}
const GROUPING_AT_RULE = /^@(media|supports|container|layer)\b/;
/** Prefixes every style rule in `css`, inside `@media` and `@supports` too. Keyframes stay as they are. */
export function scopeCss(css: string, token: string): string {
  return scopeWith(css, `:where(.${scopeClass(token)}) `);
}
/** W-971: the same, scoped to several renders at once (`:where(.emvb-s-a,.emvb-s-b) `). */
export function scopeCssAll(css: string, tokens: readonly string[]): string {
  return scopeWith(css, `:where(${tokens.map((t) => `.${scopeClass(t)}`).join(",")}) `);
}
function scopeWith(css: string, prefix: string): string {
  const masked = maskCss(css);
  let out = "";
  for (const piece of piecesIn(masked, 0, css.length)) {
    if (piece.open === -1) {
      out += css.slice(piece.start, piece.end);
      continue;
    }
    const prelude = css.slice(piece.p, piece.preludeEnd);
    const body = css.slice(piece.open + 1, piece.end - 1);
    if (GROUPING_AT_RULE.test(prelude)) {
      out += `${prelude}{${scopeWith(body, prefix)}}`;
    } else if (prelude.startsWith("@")) {
      out += css.slice(piece.start, piece.end).trim();
    } else {
      out += `${selectorSpans(masked, piece.p, piece.preludeEnd)
        .map(([a, b]) => prefix + css.slice(a, b))
        .join(",")}{${body}}`;
    }
  }
  return out;
}
/**
 * Extension stylesheets (extensionApi 1.5). An extension's CSS is scoped to its own wrapper, so a
 * kit's base rules (`h1`, `button`, `*`, `html`) cannot restyle the page around the element.
 *
 * Per selector, by its last compound (the element it styles):
 * - a class there (`.btn`, `.card h2:hover` is not one, `.btn:hover` is) leaves the selector alone,
 *   because the class allowlist already limits which classes reach the page;
 * - `html` and `body` become the wrapper itself;
 * - anything else becomes `:where(<wrapper>) <selector>`, which adds no specificity, so the kit's
 *   class rules still win. A class only inside `:not()`, `:is()` or `[attr=".x"]` does not count.
 * - a selector that starts at `:root` or `[data-theme]` stays global when it is only that (theme
 *   variables are declared there); with a descendant, the wrapper goes after it:
 *   `[data-theme=dark] :where(<wrapper>) h1`.
 * At-rules `@media`, `@supports`, `@container`, `@layer` and `@starting-style` are scoped inside;
 * `@keyframes`, `@font-face`, `@import`, `@charset` and the rest are copied as they are. Comments,
 * strings and `url()` are skipped when reading structure, so a `{` or `,` in them cannot split a
 * rule. A rule that changes nothing is copied byte for byte, so an extension that styles only its
 * own classes gets exactly the CSS it wrote.
 */
export const EXTENSION_WRAPPER_CLASS = (token: string): string => `emvb-ext--${token}`;

const EXTENSION_GROUPING = /^@(media|supports|container|layer|starting-style)\b/;
const THEME_HEAD = /^(?::root|\[data-theme)/;
const COMBINATOR = /[\s>+~]/;
// A class name starts with a letter, `_`, `-`, an escape or a non-ASCII character, never a digit, so
// the `.5` in `:nth-child(2n+1.5)` or `0.5%` is not one.
const CLASS_NAME_IN_SELECTOR =
  /\.((?:[A-Za-z_-]|\\.|[\u0080-\uffff])(?:[\w-]|\\.|[\u0080-\uffff])*)/g;
const CLASS_START = /\.(?=[A-Za-z_\\\u0080-\uffff-])/;

/** `text` with everything inside `(...)` and `[...]` blanked, so only the top level is left. */
function topLevel(text: string): string {
  let depth = 0;
  let out = "";
  for (const ch of text) {
    if (ch === "(" || ch === "[") {
      out += depth === 0 ? ch : "_";
      depth += 1;
    } else if (ch === ")" || ch === "]") {
      depth = Math.max(0, depth - 1);
      out += depth === 0 ? ch : "_";
    } else out += depth === 0 ? ch : "_";
  }
  return out;
}

/** Index just past the end of the first compound selector (the first top-level combinator). */
function firstCompoundEnd(selector: string): number {
  const top = topLevel(selector);
  for (let k = 0; k < top.length; k++) if (COMBINATOR.test(top[k] ?? "")) return k;
  return top.length;
}

/** The last compound selector: the element the selector styles. */
function lastCompound(selector: string): string {
  const top = topLevel(selector);
  let start = 0;
  for (let k = 0; k < top.length; k++) if (COMBINATOR.test(top[k] ?? "")) start = k + 1;
  return selector.slice(start);
}

const hasClass = (compound: string): boolean => CLASS_START.test(topLevel(compound));

/** The selector `orig` (whose masked form is `masked`), scoped to `wrapper`. */
function scopeExtensionSelector(orig: string, masked: string, wrapper: string): string {
  if (THEME_HEAD.test(masked)) {
    const headEnd = firstCompoundEnd(masked);
    // Only the head (`:root`, `[data-theme=dark]`): theme variables, global.
    if (headEnd >= masked.length || hasClass(lastCompound(masked))) return orig;
    let k = headEnd;
    while (k < masked.length && COMBINATOR.test(masked[k] ?? "")) k += 1;
    return `${orig.slice(0, k)}${fromWrapper(orig.slice(k), masked.slice(k), wrapper)}`;
  }
  if (hasClass(lastCompound(masked))) return orig;
  return fromWrapper(orig, masked, wrapper);
}

/**
 * `orig` scoped to `wrapper`, where a leading plain `html` or `body` (or a run of them, `html >
 * body`) is the wrapper itself, because the wrapper stands for the document root of its kit.
 * `body button` becomes `wrapper button`, not `wrapper body button`, which could never match.
 * A root with a qualifier (`html.dark`, `body:not(.x)`) is not a plain root and is left in place.
 */
function fromWrapper(orig: string, masked: string, wrapper: string): string {
  let at = 0;
  let combinator = " ";
  while (true) {
    const root = /^(?:html|body)(?=[\s>]|$)/.exec(masked.slice(at));
    if (!root) break;
    let next = at + root[0].length;
    while (/\s/.test(masked[next] ?? "")) next += 1;
    // A sibling combinator after the root (`body + p`) has nothing to map to; leave it.
    if (masked[next] === "+" || masked[next] === "~") break;
    combinator = masked[next] === ">" ? " > " : " ";
    if (masked[next] === ">") next += 1;
    while (/\s/.test(masked[next] ?? "")) next += 1;
    at = next;
    if (next >= masked.length) return wrapper;
  }
  return at === 0 ? `${wrapper} ${orig}` : `${wrapper}${combinator}${orig.slice(at)}`;
}

/** Calls `visit` for every style rule, inside the grouping at-rules `grouping` matches. */
function eachStyleRule(
  masked: string,
  from: number,
  to: number,
  grouping: RegExp,
  visit: (spans: [number, number][], bodyFrom: number, bodyTo: number) => void,
): void {
  for (const piece of piecesIn(masked, from, to)) {
    if (piece.open === -1) continue;
    const prelude = masked.slice(piece.p, piece.preludeEnd);
    if (grouping.test(prelude))
      eachStyleRule(masked, piece.open + 1, piece.end - 1, grouping, visit);
    else if (prelude[0] !== "@") {
      visit(selectorSpans(masked, piece.p, piece.preludeEnd), piece.open + 1, piece.end - 1);
    }
  }
}
function rewriteExtensionRange(
  css: string,
  masked: string,
  from: number,
  to: number,
  wrapper: string,
): string {
  let out = "";
  for (const piece of piecesIn(masked, from, to)) {
    if (piece.open === -1) {
      out += css.slice(piece.start, piece.end);
      continue;
    }
    const prelude = masked.slice(piece.p, piece.preludeEnd);
    if (EXTENSION_GROUPING.test(prelude)) {
      const inner = rewriteExtensionRange(css, masked, piece.open + 1, piece.end - 1, wrapper);
      out += `${css.slice(piece.start, piece.open + 1)}${inner}${css.slice(piece.end - 1, piece.end)}`;
    } else if (prelude[0] === "@") {
      out += css.slice(piece.start, piece.end);
    } else {
      let cursor = piece.p;
      let rule = css.slice(piece.start, piece.p);
      for (const [a, b] of selectorSpans(masked, piece.p, piece.preludeEnd)) {
        rule += css.slice(cursor, a);
        rule += scopeExtensionSelector(css.slice(a, b), masked.slice(a, b), wrapper);
        cursor = b;
      }
      out += `${rule}${css.slice(cursor, piece.end)}`;
    }
  }
  return out;
}
/** The extension's stylesheet, scoped to the wrapper of render token `token` (see above). */
export function scopeExtensionCss(css: string, token: string): string {
  const wrapper = `:where(.${EXTENSION_WRAPPER_CLASS(token)})`;
  return rewriteExtensionRange(css, maskCss(css), 0, css.length, wrapper);
}
/**
 * Global variables an extension declares outside its own wrapper: `--name` in a rule that is only
 * `:root` or `[data-theme]`, when it does not start with the extension's prefix. They would
 * overwrite the site's own variables of the same name, so the build warns about them.
 */
export function unprefixedGlobalVariables(css: string, prefix: string | undefined): string[] {
  const masked = maskCss(css);
  const found: string[] = [];
  eachStyleRule(masked, 0, css.length, EXTENSION_GROUPING, (spans, from, to) => {
    const global = spans.some(
      ([a, b]) =>
        THEME_HEAD.test(masked.slice(a, b)) && firstCompoundEnd(masked.slice(a, b)) >= b - a,
    );
    if (!global) return;
    for (const match of masked.slice(from, to).matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) {
      const name = match[1] ?? "";
      const prefixed = prefix !== undefined && name.startsWith(`--${prefix}`);
      if (!prefixed && !found.includes(name)) found.push(name);
    }
  });
  return found;
}
/**
 * Classes an extension's stylesheet names that do not start with its class prefix. A class selector
 * is left alone when the stylesheet is scoped, on the assumption that every class in it is the
 * extension's own, so a class like `.page-heading` would style page content outside the extension.
 * The check reads the stylesheet only, so a class that only the extension's runtime adds is covered
 * as well: it has to be named in the CSS to do anything, and it has to carry the prefix.
 */
export function foreignClassSelectors(css: string, prefix: string): string[] {
  const masked = maskCss(css);
  const found: string[] = [];
  eachStyleRule(masked, 0, css.length, EXTENSION_GROUPING, (spans) => {
    for (const [a, b] of spans) {
      for (const match of masked.slice(a, b).matchAll(CLASS_NAME_IN_SELECTOR)) {
        const name = (match[1] ?? "").replace(/\\(.)/g, "$1");
        if (!name.startsWith(prefix) && !found.includes(name)) found.push(name);
      }
    }
  });
  return found;
}
