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
 * Per selector: a selector with a class is left alone (the allowlist already limits which classes
 * reach the page); `html` and `body` become the wrapper itself; a selector with no class becomes
 * `:where(<wrapper>) <selector>`, which adds no specificity, so the kit's class rules still win.
 * `:root` and `[data-theme]` stay global, because theme variables are declared there. At-rules
 * other than the grouping ones (`@keyframes`, `@font-face`, `@import`) are copied as they are.
 * A rule that changes nothing is copied byte for byte, so an extension that styles only its own
 * classes gets exactly the CSS it wrote.
 */
export const EXTENSION_WRAPPER_CLASS = (token: string): string => `emvb-ext--${token}`;

const GLOBAL_SELECTOR = /:root|\[data-theme/;
const HAS_CLASS = /\.[A-Za-z_-]/;

function extensionSelector(selector: string, wrapper: string): string {
  if (GLOBAL_SELECTOR.test(selector) || HAS_CLASS.test(selector)) return selector;
  if (selector === "html" || selector === "body") return wrapper;
  return `${wrapper} ${selector}`;
}

/**
 * The part of a rule's text before its `{`, split into the comments that lead it (kept as they
 * are) and the prelude itself.
 */
function splitPrelude(raw: string): { lead: string; prelude: string } {
  const cut = raw.lastIndexOf("*/");
  if (cut === -1) return { lead: "", prelude: raw.trim() };
  const after = raw.slice(cut + 2);
  const gap = after.length - after.trimStart().length;
  return { lead: raw.slice(0, cut + 2 + gap), prelude: after.trim() };
}

function rewriteExtensionRules(css: string, wrapper: string): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open === -1) {
      out += css.slice(i);
      break;
    }
    const { lead, prelude } = splitPrelude(css.slice(i, open));
    const end = blockEnd(css, open);
    const whole = css.slice(i, end);
    const body = css.slice(open + 1, end - 1);
    if (GROUPING_AT_RULE.test(prelude)) {
      const inner = rewriteExtensionRules(body, wrapper);
      out += inner === body ? whole : `${lead}${prelude}{${inner}}`;
    } else if (prelude[0] === "@") {
      out += whole;
    } else {
      const selectors = splitSelectors(prelude);
      const mapped = selectors.map((s) => extensionSelector(s, wrapper));
      const changed = mapped.some((m, n) => m !== selectors[n]);
      out += changed ? `${lead}${mapped.join(",")}{${body}}` : whole;
    }
    i = end;
  }
  return out;
}

/** The extension's stylesheet, scoped to the wrapper of render token `token` (see above). */
export function scopeExtensionCss(css: string, token: string): string {
  return rewriteExtensionRules(css, `:where(.${EXTENSION_WRAPPER_CLASS(token)})`);
}

/**
 * Global variables an extension declares outside its own wrapper: `--name` in a `:root` or
 * `[data-theme]` rule that does not start with the extension's prefix. They would overwrite the
 * site's own variables of the same name, so the build warns about each one.
 */
export function unprefixedGlobalVariables(css: string, prefix: string | undefined): string[] {
  const found: string[] = [];
  const visit = (text: string): void => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open === -1) break;
      const { prelude } = splitPrelude(text.slice(i, open));
      const end = blockEnd(text, open);
      const body = text.slice(open + 1, end - 1);
      if (GROUPING_AT_RULE.test(prelude)) visit(body);
      else if (
        !prelude.startsWith("@") &&
        splitSelectors(prelude).some((s) => GLOBAL_SELECTOR.test(s))
      ) {
        for (const match of body.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) {
          const name = match[1] ?? "";
          const prefixed = prefix !== undefined && name.startsWith(`--${prefix}`);
          if (!prefixed && !found.includes(name)) found.push(name);
        }
      }
      i = end;
    }
  };
  visit(css);
  return found;
}
