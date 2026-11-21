/**
 * The `data-emvb-*` attributes public HTML may carry: hooks a public runtime or host reads, never
 * editor state. docs/system/layout-format.md ("Rendered output") lists the same names; a test
 * keeps the two in step. Editor attributes such as `data-emvb-id` never reach public output.
 */
export const PUBLIC_DATA_ATTRIBUTES: readonly string[] = [
  "data-emvb-theme-part",
  "data-emvb-loop-item",
  "data-emvb-popup",
  "data-emvb-popup-config",
  "data-emvb-popup-dismiss",
  "data-emvb-float",
  "data-emvb-float-dismiss",
  "data-emvb-float-edge",
  // W-1083: the widget and site hooks their opt-in runtimes read (1.2 to 1.4), and an empty Menu.
  "data-emvb-menu-empty",
  "data-emvb-alert-dismiss",
  "data-emvb-lightbox",
  "data-emvb-arrows",
  "data-emvb-dots",
  "data-emvb-autoplay",
  "data-emvb-loop",
  "data-emvb-counter",
  "data-emvb-countdown",
  "data-emvb-map",
  "data-emvb-rotate",
  "data-emvb-share-list",
  "data-emvb-share",
  "data-emvb-theme-toggle",
  "data-emvb-sticky-hide",
  "data-emvb-ext",
];

/**
 * The `data-emvb-*` attribute names on the tags of `html` (not inside `<style>` or `<script>`)
 * that aren't public hooks, each once.
 */
export function editorAttributesIn(html: string): string[] {
  const tags = html.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  const found = new Set<string>();
  for (const tag of tags.match(/<[a-z][^>]*>/gi) ?? []) {
    for (const [, name] of tag.matchAll(/\s(data-emvb-[a-z0-9-]+)(?=[\s=>/])/gi)) {
      if (name && !PUBLIC_DATA_ATTRIBUTES.includes(name)) found.add(name);
    }
  }
  return [...found];
}
