import { ELEMENTS } from "./index.ts";

/** Words that keep their capitals in running text (acronyms, brands), as element names do. */
const KEEP = /^([A-Z0-9]{2,}s?|YouTube|Vimeo|Lottie|Markdown|Google|OpenStreetMap)$/;

/**
 * W-1091 (#39): plurals English can't guess from the name. Names already plural ("Tabs",
 * "Social icons") are one element each, so several of them are sets.
 */
const PLURALS: Record<string, string> = {
  "call to action": "calls to action",
  "table of contents": "tables of contents",
  tabs: "tab sets",
  hotspots: "hotspot images",
  "social icons": "social icon sets",
  "share buttons": "share button sets",
};

/** "icon-box" → "icon box": the element's name in running text, or its type when it has none. */
export function elementNoun(type: string): string {
  const name = (ELEMENTS as Record<string, { descriptor: { name: string } } | undefined>)[type]
    ?.descriptor.name;
  const words = (name ?? type.replaceAll(/[-_]+/g, " ")).trim().split(/\s+/);
  return words.map((word) => (KEEP.test(word) ? word : word.toLowerCase())).join(" ");
}

/** English plural of the last word: box → boxes, gallery → galleries, SVG → SVGs. */
function pluralWord(word: string): string {
  if (/^[A-Z0-9]{2,}$/.test(word)) return `${word}s`;
  if (/(?:s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

/** "icon boxes": several of an element type, by its name. */
export function elementPlural(type: string): string {
  const noun = elementNoun(type);
  const irregular = PLURALS[noun];
  if (irregular) return irregular;
  const words = noun.split(" ");
  const last = words.pop() ?? noun;
  return [...words, pluralWord(last)].join(" ");
}

/** "icon box" for one, "12 icon boxes" for more. */
export function elementCount(type: string, n: number): string {
  return n === 1 ? elementNoun(type) : `${n} ${elementPlural(type)}`;
}
