/**
 * The Outline view names each block of the page after the EmVB element that would build it.
 * An explicit `data-el` wins; otherwise the tag decides.
 */
export const BLOCK_SELECTOR =
  "[data-el], section, h1, h2, h3, p, ul, ol, dl, img, nav, details, figure, pre, a.button";

const TAG_LABELS: Record<string, string> = {
  SECTION: "Section",
  H1: "Heading",
  H2: "Heading",
  H3: "Heading",
  P: "Text",
  UL: "List",
  OL: "List",
  DL: "List",
  IMG: "Image",
  NAV: "Menu",
  DETAILS: "Accordion item",
  FIGURE: "Div Block",
  PRE: "Text",
};

interface BlockLike {
  tagName: string;
  dataset: { el?: string };
  classList: { contains(token: string): boolean };
}

export function blockLabel(el: BlockLike): string | undefined {
  if (el.dataset.el) return el.dataset.el;
  if (el.tagName === "A") return el.classList.contains("button") ? "Button" : undefined;
  return TAG_LABELS[el.tagName];
}
