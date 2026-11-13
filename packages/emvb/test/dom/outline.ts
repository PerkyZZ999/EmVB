/**
 * W-1009: EmVB's own markup as an indented outline, for snapshot tests that must hold on every
 * supported Kumo (2.6.0 with EmDash 1.4, 2.15.0 with EmDash 1.5). Kept: tags, `emvb-` classes,
 * text, and the attributes EmVB sets or that carry meaning (roles, ARIA, form state, ids).
 * Left out: Kumo's own classes, its internal data attributes and controls, attribute order, and
 * the ids Base UI and React generate (where they sit and in what order differs between Kumo
 * versions; a reference to one reads `(generated)`).
 */
const KEPT =
  /^(data-|aria-|role$|type$|name$|value$|placeholder$|href$|disabled$|checked$|for$|id$|tabindex$|datetime$)/;
/** Kumo/Base UI state that differs between Kumo versions and says nothing about EmVB. */
const KUMO_INTERNAL =
  /^data-(kumo-|base-ui-|activation-direction$|dirty$|orientation$|side$|align$|instant$|starting-style$|ending-style$|panel-open$|index$)/;
/** Controls Kumo adds by itself (tab-row scroll buttons since 2.15). */
const KUMO_ONLY = '[data-kumo-part="overflow-control"]';

export function outline(host: Element, options: { stopAt?: (element: Element) => boolean } = {}) {
  const GENERATED = /base-ui-[\w-]+|«[^»]*»|:r[0-9a-z]+:|_r_[0-9a-z]+_/g;
  const generated = (value: string) => value.replace(GENERATED, "") === "";
  const stable = (value: string) => value.replace(GENERATED, "(generated)");
  const lines: string[] = [];
  const walk = (node: Node, depth: number) => {
    const pad = "  ".repeat(depth);
    if (node.nodeType === 3) {
      const text = node.textContent?.trim();
      if (text) lines.push(`${pad}"${text}"`);
      return;
    }
    if (!(node instanceof Element) || node.matches(KUMO_ONLY)) return;
    // Base UI's hidden native input behind a checkbox or switch: the visible control is outlined.
    if (node.matches('input[aria-hidden="true"][tabindex="-1"]')) return;
    const own = [...node.classList].filter((name) => name.startsWith("emvb-"));
    const attrs = [...node.attributes]
      .filter((attr) => KEPT.test(attr.name) && !KUMO_INTERNAL.test(attr.name))
      .filter((attr) => !(attr.name === "aria-disabled" && attr.value === "false"))
      .filter((attr) => !(attr.name === "id" && generated(attr.value)))
      .map((attr) => `${attr.name}="${stable(attr.value)}"`)
      .toSorted();
    const name = node.tagName.toLowerCase();
    // A plain wrapper (a Kumo layout div or span, no EmVB class, nothing kept) is left out and its
    // children take its place: Kumo versions wrap the same controls differently.
    if ((name === "div" || name === "span") && own.length === 0 && attrs.length === 0) {
      for (const child of node.childNodes) walk(child, depth);
      return;
    }
    const tag = [name, ...own.map((cls) => `.${cls}`)].join("");
    lines.push(`${pad}${[tag, ...attrs].join(" ")}`);
    if (options.stopAt?.(node)) return;
    for (const child of node.childNodes) walk(child, depth + 1);
  };
  for (const child of host.childNodes) walk(child, 0);
  return lines.join("\n");
}
