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

/** The wrapper's class attribute for a scope token. */
export function scopeAttribute(token: string): string {
  return `class="${WRAPPER_CLASS} ${scopeClass(token)}"`;
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
  const prefix = `:where(.${scopeClass(token)}) `;
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
      out += `${prelude}{${scopeCss(body, token)}}`;
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
