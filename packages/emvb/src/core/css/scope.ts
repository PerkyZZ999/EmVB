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

/** The last compound selector: the element the selector styles. */
function lastCompound(selector: string): string {
  const top = topLevel(selector);
  let start = 0;
  for (let k = 0; k < top.length; k++) if (COMBINATOR.test(top[k] ?? "")) start = k + 1;
  return selector.slice(start);
}

const hasClass = (compound: string): boolean => CLASS_START.test(topLevel(compound));

/** A leading `html` or `body` root (qualifiers allowed), not `html-x` or `bodies`. */
const ROOT_TAG = /^(?:html|body)(?![\w-])/;
/** The document's own root: `:root`, `:where(:root)` or the shadow host. Its variables are the kit's. */
const DOC_ROOT = /^(?::root|:where\(:root\)|:host)(?![\w-])/;
/** A theme attribute at the head of a selector: `[data-theme=dark]`, `[data-emvb-theme="light"]`. */
const THEME_LEAD = /^\[data-(?:emvb-)?theme(?![\w-])/;
const THEME_ATTR = /\[data-(?:emvb-)?theme(?![\w-])/;

/** One compound selector or one run of combinators, with its text as written and as masked. */
type Token = { text: string; masked: string; combinator: boolean };

/** The top-level tokens of a selector: compounds alternating with the combinators between them. */
function tokenize(orig: string, masked: string): Token[] {
  const tokens: Token[] = [];
  let depth = 0;
  let start = 0;
  const flush = (end: number): void => {
    if (end > start)
      tokens.push({
        text: orig.slice(start, end),
        masked: masked.slice(start, end),
        combinator: false,
      });
  };
  let i = 0;
  while (i < masked.length) {
    const ch = masked[i] ?? "";
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (depth === 0 && /[\s>+~]/.test(ch)) {
      flush(i);
      let j = i;
      while (j < masked.length && /[\s>+~]/.test(masked[j] ?? "")) j += 1;
      tokens.push({ text: orig.slice(i, j), masked: masked.slice(i, j), combinator: true });
      start = j;
      i = j;
      continue;
    }
    i += 1;
  }
  flush(masked.length);
  return tokens;
}

/** `:not([data-theme])` also says "no emvb theme", so the host's own choice wins over the OS. */
function guardEmvbTheme(head: string): string {
  return head.replace(/:not\(\[data-theme(?:[^\]]*)?\]\)/g, (m) => `${m}:not([data-emvb-theme])`);
}

/**
 * A selector headed by a theme attribute. It applies when the host root carries the theme (as an
 * ancestor, with `data-theme` or the EmVB `data-emvb-theme`), and when the kit's wrapper or an
 * element inside it carries it itself, so an extension can choose its own theme.
 */
function themeAlternatives(head: string, rest: string, wrapper: string): string {
  const bare = head.replace(/^(?:html|body)/, "");
  const emvb = head.replace(/data-theme/g, "data-emvb-theme");
  const forms = [`${head} ${wrapper}${rest}`];
  if (emvb !== head) forms.push(`${emvb} ${wrapper}${rest}`);
  forms.push(`${wrapper}${bare}${rest}`, `${wrapper} ${bare}${rest}`);
  return forms.join(",");
}

/**
 * The leading `html` and `body` roots of a token run (qualified and chained), removed. Their
 * qualifiers come back apart, and `rest` keeps the combinator that followed the last root:
 * `html.dark > body > main` gives qualifiers `.dark` and rest ` > main`. `undefined` for a sibling
 * combinator (`body + p`), which has no wrapper to map to.
 */
function mapRoots(tokens: Token[]): { qualifiers: string; rest: string } | undefined {
  let qualifiers = "";
  let i = 0;
  let joiner = " ";
  if (tokens[0]?.combinator) {
    if (/[+~]/.test(tokens[0].masked)) return undefined;
    joiner = tokens[0].text;
    i = 1;
  }
  while (i < tokens.length && !tokens[i]?.combinator && ROOT_TAG.test(tokens[i]?.masked ?? "")) {
    const tag = ROOT_TAG.exec(tokens[i]?.masked ?? "")?.[0].length ?? 0;
    qualifiers += (tokens[i]?.text ?? "").slice(tag);
    i += 1;
    const link = tokens[i];
    if (link?.combinator) {
      if (/[+~]/.test(link.masked)) return undefined;
      joiner = link.text;
      i += 1;
    } else joiner = "";
  }
  const tail = tokens
    .slice(i)
    .map((t) => t.text)
    .join("");
  return { qualifiers, rest: tail === "" ? "" : joiner + tail };
}

/**
 * Leading `html` and `body` roots become the wrapper, and their qualifiers move onto it:
 * `body.dark button` is `:where(W).dark button`, `html.dark body button` is `:where(W).dark button`,
 * and `html > body > main` is `:where(W) > main`. The kit's runtime puts such a class on its
 * wrapper; a page's own `dark` class does not reach it.
 */
function mapLeadingRoots(tokens: Token[], wrapper: string): string | undefined {
  const mapped = mapRoots(tokens);
  return mapped && `${wrapper}${mapped.qualifiers}${mapped.rest}`;
}

/** The selector `orig` (whose masked form is `masked`), scoped to `wrapper`. */
function scopeExtensionSelector(orig: string, masked: string, wrapper: string): string {
  const tokens = tokenize(orig, masked);
  const first = tokens[0];
  if (!first || first.combinator) return orig;
  // The document's root: its variables are declared on the kit's wrapper instead, so they can't
  // overwrite the host's. A root headed by `:root` with a class further along is left as written.
  if (DOC_ROOT.test(first.masked)) {
    if (hasClass(lastCompound(masked))) return orig;
    const head = guardEmvbTheme(first.text);
    const after = mapRoots(tokens.slice(1));
    if (!after) return `${wrapper} ${orig}`;
    return `:where(${head}) ${wrapper}${after.qualifiers}${after.rest}`;
  }
  if (
    THEME_LEAD.test(first.masked) ||
    (ROOT_TAG.test(first.masked) && THEME_ATTR.test(first.masked))
  ) {
    if (hasClass(lastCompound(masked))) return orig;
    // Roots after the theme head (`[data-theme=dark] body button`) map to the wrapper as well.
    const rest = mapRoots(tokens.slice(1));
    if (!rest) return `${wrapper} ${orig}`;
    return themeAlternatives(first.text, `${rest.qualifiers}${rest.rest}`, wrapper);
  }
  if (ROOT_TAG.test(first.masked)) return mapLeadingRoots(tokens, wrapper) ?? `${wrapper} ${orig}`;
  if (hasClass(lastCompound(masked))) return orig;
  return `${wrapper} ${orig}`;
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
