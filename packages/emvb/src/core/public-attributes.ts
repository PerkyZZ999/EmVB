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
