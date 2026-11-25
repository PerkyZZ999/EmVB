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

function splitSelectors(prelude: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < prelude.length; i++) {
    const ch = prelude[i];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      out.push(prelude.slice(start, i));
      start = i + 1;
    }
  }
  out.push(prelude.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
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
  let out = "";
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open === -1) {
      out += css.slice(i);
      break;
    }
    const prelude = css.slice(i, open).trim();
    const end = blockEnd(css, open);
    const body = css.slice(open + 1, end - 1);
    if (GROUPING_AT_RULE.test(prelude)) {
      out += `${prelude}{${scopeWith(body, prefix)}}`;
    } else if (prelude.startsWith("@")) {
      out += css.slice(i, end).trim();
    } else {
      out += `${splitSelectors(prelude)
        .map((selector) => prefix + selector)
        .join(",")}{${body}}`;
    }
    i = end;
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
const CLASS_START = /\.(?=[A-Za-z_\\\u0080-\uffff-])/;

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
    return `${orig.slice(0, k)}${wrapper} ${orig.slice(k)}`;
  }
  if (hasClass(lastCompound(masked))) return orig;
  if (masked === "html" || masked === "body") return wrapper;
  return `${wrapper} ${orig}`;
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
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (depth === 0 && ch === ",") {
      push(k);
      start = k + 1;
    }
  }
  push(to);
  return spans;
}

function rewriteExtensionRange(
  css: string,
  masked: string,
  from: number,
  to: number,
  wrapper: string,
): string {
  let out = "";
  let i = from;
  while (i < to) {
    let p = i;
    while (p < to && /\s/.test(masked[p] ?? "")) p += 1;
    if (p >= to) {
      out += css.slice(i, to);
      break;
    }
    const open = masked.indexOf("{", p);
    const semi = masked.indexOf(";", p);
    // A statement at-rule (`@import`, `@charset`, `@layer a, b;`) ends at its `;`.
    if (masked[p] === "@" && semi !== -1 && semi < to && (open === -1 || semi < open)) {
      out += css.slice(i, semi + 1);
      i = semi + 1;
      continue;
    }
    if (open === -1 || open >= to) {
      out += css.slice(i, to);
      break;
    }
    const end = blockEnd(masked, open);
    let preludeEnd = open;
    while (preludeEnd > p && /\s/.test(masked[preludeEnd - 1] ?? "")) preludeEnd -= 1;
    const prelude = masked.slice(p, preludeEnd);
    if (EXTENSION_GROUPING.test(prelude)) {
      const inner = rewriteExtensionRange(css, masked, open + 1, end - 1, wrapper);
      out += `${css.slice(i, open + 1)}${inner}${css.slice(end - 1, end)}`;
    } else if (prelude[0] === "@") {
      out += css.slice(i, end);
    } else {
      let cursor = p;
      let rule = css.slice(i, p);
      for (const [a, b] of selectorSpans(masked, p, preludeEnd)) {
        rule += css.slice(cursor, a);
        rule += scopeExtensionSelector(css.slice(a, b), masked.slice(a, b), wrapper);
        cursor = b;
      }
      out += `${rule}${css.slice(cursor, end)}`;
    }
    i = end;
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
 * overwrite the site's own variables of the same name, so the build warns about each one.
 */
export function unprefixedGlobalVariables(css: string, prefix: string | undefined): string[] {
  const masked = maskCss(css);
  const found: string[] = [];
  const visit = (from: number, to: number): void => {
    let i = from;
    while (i < to) {
      let p = i;
      while (p < to && /\s/.test(masked[p] ?? "")) p += 1;
      const open = masked.indexOf("{", p);
      const semi = masked.indexOf(";", p);
      if (masked[p] === "@" && semi !== -1 && semi < to && (open === -1 || semi < open)) {
        i = semi + 1;
        continue;
      }
      if (p >= to || open === -1 || open >= to) break;
      const end = blockEnd(masked, open);
      const prelude = masked.slice(p, open).trim();
      if (EXTENSION_GROUPING.test(prelude)) visit(open + 1, end - 1);
      else if (
        prelude[0] !== "@" &&
        selectorSpans(masked, p, open).some(
          ([a, b]) =>
            THEME_HEAD.test(masked.slice(a, b)) && firstCompoundEnd(masked.slice(a, b)) >= b - a,
        )
      ) {
        for (const match of masked.slice(open + 1, end - 1).matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) {
          const name = match[1] ?? "";
          const prefixed = prefix !== undefined && name.startsWith(`--${prefix}`);
          if (!prefixed && !found.includes(name)) found.push(name);
        }
      }
      i = end;
    }
  };
  visit(0, css.length);
  return found;
}
