import { getBundledIcon } from "../../../core/index.ts";
import { fold } from "../../pages/list-kit.tsx";
import type { IconEntry, IconSetFile } from "./set-format.ts";

/**
 * The Icon library (W-235): Lucide, Font Awesome Free, Tabler and Remix Icon, one lazily loaded
 * JSON chunk per set (built by scripts/build-icon-sets.ts). Only the editor imports this; a picked
 * icon is stored on the node as `iconId` + `iconSvg`, so public pages never load a set.
 */
export type IconSetId = "lucide" | "fontawesome" | "tabler" | "remix";

type SetMeta = {
  id: IconSetId;
  label: string;
  license: string;
  styles: readonly { id: string; label: string; prefix: string }[];
};

/** What the sidebar shows before any set is loaded (checked against the set files in tests). */
export const ICON_SETS: readonly SetMeta[] = [
  {
    id: "lucide",
    label: "Lucide",
    license: "ISC",
    styles: [{ id: "lucide", label: "Lucide", prefix: "lucide" }],
  },
  {
    id: "fontawesome",
    label: "Font Awesome",
    license: "CC BY 4.0",
    styles: [
      { id: "solid", label: "Solid", prefix: "fa-solid" },
      { id: "regular", label: "Regular", prefix: "fa-regular" },
      { id: "brands", label: "Brands", prefix: "fa-brands" },
    ],
  },
  {
    id: "tabler",
    label: "Tabler",
    license: "MIT",
    styles: [
      { id: "outline", label: "Outline", prefix: "tabler" },
      { id: "filled", label: "Filled", prefix: "tabler-filled" },
    ],
  },
  {
    id: "remix",
    label: "Remix",
    license: "Apache-2.0",
    styles: [
      { id: "line", label: "Line", prefix: "remix" },
      { id: "fill", label: "Fill", prefix: "remix" },
    ],
  },
];

/** A sidebar entry: everything, one set, or one style of a set. */
export type IconCategory = {
  id: string;
  label: string;
  set?: IconSetId;
  style?: string;
};

export const ALL_ICONS = "all";

export const ICON_CATEGORIES: readonly IconCategory[] = [
  { id: ALL_ICONS, label: "All icons" },
  ...ICON_SETS.flatMap((set): IconCategory[] => [
    { id: set.id, label: set.label, set: set.id },
    ...(set.styles.length > 1
      ? set.styles.map((style) => ({
          id: `${set.id}/${style.id}`,
          label: style.label,
          set: set.id,
          style: style.id,
        }))
      : []),
  ]),
];

/** One icon as the picker shows it. */
export type LibraryIcon = {
  /** Stored as the node's iconId: `${prefix}:${name}`. */
  id: string;
  set: IconSetId;
  setLabel: string;
  style: string;
  styleLabel: string;
  name: string;
  label: string;
  /** Folded label, name, tags, set and style, for the word search. */
  haystack: string;
  /** The complete `<svg>` stored on the node and shown in the tile. */
  markup: string;
};

const LOADERS: Record<IconSetId, () => Promise<{ default: unknown }>> = {
  lucide: () => import("./sets/lucide.json"),
  fontawesome: () => import("./sets/fontawesome.json"),
  tabler: () => import("./sets/tabler.json"),
  remix: () => import("./sets/remix.json"),
};

const attrText = (attrs: Record<string, string>) =>
  Object.entries(attrs)
    .map(([name, value]) => ` ${name}="${value}"`)
    .join("");

/** The icons of one set file, ready for the grid. */
function iconsOf(file: IconSetFile): LibraryIcon[] {
  const styles = file.styles.map((style) => ({ style, root: attrText(style.attrs) }));
  return file.icons.map((entry: IconEntry) => {
    const [name, styleIndex, label, body, tags] = entry;
    const picked = styles[styleIndex] ?? styles[0];
    if (!picked) throw new Error(`EmVB: icon set ${file.id} has no styles`);
    const { style, root } = picked;
    const viewBox = entry[5] ?? style.viewBox;
    return {
      id: `${style.prefix}:${name}`,
      set: file.id as IconSetId,
      setLabel: file.label,
      style: style.id,
      styleLabel: style.label,
      name,
      label,
      haystack: fold(`${label} ${name.replaceAll("-", " ")} ${tags} ${file.label} ${style.label}`),
      markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${root}>${body}</svg>`,
    };
  });
}

const loaded = new Map<IconSetId, Promise<LibraryIcon[]>>();

/** Loads a set once (a separate chunk the first time); later calls share the result. */
export function loadIconSet(id: IconSetId): Promise<LibraryIcon[]> {
  let pending = loaded.get(id);
  if (!pending) {
    pending = LOADERS[id]().then((mod) => iconsOf(mod.default as IconSetFile));
    // A failed load (offline, chunk gone after a deploy) can be tried again.
    pending.catch(() => loaded.delete(id));
    loaded.set(id, pending);
  }
  return pending;
}

/** The sets a category needs. */
export const setsFor = (category: IconCategory): IconSetId[] =>
  category.set ? [category.set] : ICON_SETS.map((set) => set.id);

/** Icons in a category matching the search: every word, any order (as W-217), case and accents aside. */
export function filterIcons(
  icons: readonly LibraryIcon[],
  category: IconCategory,
  query: string,
): LibraryIcon[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return icons.filter(
    (icon) =>
      (!category.set || icon.set === category.set) &&
      (!category.style || icon.style === category.style) &&
      words.every((word) => icon.haystack.includes(word)),
  );
}

const SET_OF_PREFIX = new Map<string, IconSetId>(
  ICON_SETS.flatMap((set) => set.styles.map((style) => [style.prefix, set.id] as const)),
);

/**
 * Where a stored iconId lives: `fa-solid:rocket` → Font Awesome, Solid. A bundled id from before
 * the library ("star") is the Lucide icon of the same name.
 */
export function locateIcon(
  iconId: string,
): { set: IconSetId; style: string; id: string } | undefined {
  const colon = iconId.indexOf(":");
  if (colon < 0)
    return getBundledIcon(iconId)
      ? { set: "lucide", style: "lucide", id: `lucide:${iconId}` }
      : undefined;
  const prefix = iconId.slice(0, colon);
  const set = SET_OF_PREFIX.get(prefix);
  if (!set) return undefined;
  const styles = ICON_SETS.find((item) => item.id === set)?.styles ?? [];
  const style =
    set === "remix"
      ? iconId.endsWith("-fill")
        ? "fill"
        : "line"
      : (styles.find((item) => item.prefix === prefix)?.id ?? set);
  return { set, style, id: iconId };
}
