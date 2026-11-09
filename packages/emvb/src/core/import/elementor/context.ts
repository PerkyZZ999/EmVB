/** Shared state of one Elementor import (W-945): ids, globals, icons, limits and the report. */
import { newNodeId } from "../../tree-ops.ts";
import { type AtomicSnapshots, emptySnapshots } from "./snapshots.ts";
import { color, fontStack, fontWeight, isRecord, slider, str, type Settings } from "./values.ts";

export type NoteKind = "approximated" | "skipped" | "unmapped";

/** One line of the report. Identical notes are counted, not repeated. */
export type ImportNote = { kind: NoteKind; element: string; message: string; count: number };

export type GlobalTypography = {
  fontFamily?: string;
  fontWeight?: unknown;
  fontSize?: unknown;
  lineHeight?: unknown;
  letterSpacing?: unknown;
};

export type ImportOptions = {
  /** The site kit's settings (Elementor's site-settings.json), for exact global colours and fonts. */
  kit?: unknown;
  /** Apply Elementor's default widget colours and fonts when a widget sets none (Elementor's own default). */
  defaults?: boolean;
  /** SVG markup for a library icon id (`fa-solid:star`), from the editor's icon sets. */
  icon?: (id: string) => string | undefined;
  /** Random source for node ids (tests). */
  random?: () => number;
};

/** Elementor's stock kit: what an unstyled site shows. */
const DEFAULT_COLORS: Record<string, string> = {
  primary: "#6ec1e4",
  secondary: "#54595f",
  text: "#7a7a7a",
  accent: "#61ce70",
};

const DEFAULT_TYPOGRAPHY: Record<string, GlobalTypography> = {
  primary: { fontFamily: "Roboto", fontWeight: "600" },
  secondary: { fontFamily: "Roboto Slab", fontWeight: "400" },
  text: { fontFamily: "Roboto", fontWeight: "400" },
  accent: { fontFamily: "Roboto", fontWeight: "500" },
};

/** Notes kept per import; the rest are counted into one line. */
const MAX_NOTES = 300;
/** Leaves room under MAX_NODES (2000) for wrappers added after the budget check. */
const NODE_BUDGET = 1800;

export class ImportContext {
  readonly notes = new Map<string, ImportNote>();
  readonly fonts = new Set<string>();
  readonly htmlIds = new Set<string>();
  /** Elementor 4 global classes and variables, from the export or the kit. */
  readonly atomic: AtomicSnapshots = emptySnapshots();
  readonly icon: ImportOptions["icon"];
  readonly useDefaults: boolean;
  nodes = 0;
  elements = 0;
  mapped = 0;
  private readonly random: () => number;
  private readonly colors = new Map<string, string>();
  private readonly typography = new Map<string, GlobalTypography>();
  private readonly kitGiven: boolean;
  private overflow = 0;

  constructor(options: ImportOptions = {}) {
    this.random = options.random ?? Math.random;
    this.icon = options.icon;
    this.useDefaults = options.defaults ?? true;
    this.kitGiven = this.readKit(options.kit);
  }

  id(): string {
    this.nodes++;
    return newNodeId(this.random);
  }

  note(kind: NoteKind, element: string, message: string): void {
    const key = `${kind}\u0000${element}\u0000${message}`;
    const existing = this.notes.get(key);
    if (existing) {
      existing.count++;
      return;
    }
    if (this.notes.size >= MAX_NOTES) {
      this.overflow++;
      return;
    }
    this.notes.set(key, { kind, element, message, count: 1 });
  }

  /** Notes once that imported images still load from the old site. */
  externalImage(url: string): void {
    if (/^https?:\/\//i.test(url)) {
      this.note(
        "approximated",
        "Images",
        "Images still load from their original address (your old site). Upload them to the media library before that site goes away.",
      );
    }
  }

  report(): ImportNote[] {
    const list = [...this.notes.values()];
    if (this.overflow > 0) {
      list.push({
        kind: "skipped",
        element: "Report",
        message: `${this.overflow} more notes were left out of this report.`,
        count: 1,
      });
    }
    return list;
  }

  get overBudget(): boolean {
    return this.nodes >= NODE_BUDGET;
  }

  /** "globals/colors?id=primary" or a plain id → hex, from the kit or Elementor's defaults. */
  globalColor(ref: unknown): string | undefined {
    const id = globalId(ref, "colors");
    if (!id) return undefined;
    const found = this.colors.get(id) ?? DEFAULT_COLORS[id];
    if (found && !this.kitGiven)
      this.note(
        "approximated",
        "Global colours",
        "Global colours use Elementor's default kit; add your site kit for exact colours.",
      );
    if (!found)
      this.note(
        "approximated",
        "Global colours",
        `Global colour "${id}" isn't in the kit; its elements keep their own colour.`,
      );
    return found;
  }

  globalTypography(ref: unknown): GlobalTypography | undefined {
    const id = globalId(ref, "typography");
    if (!id) return undefined;
    const found = this.typography.get(id) ?? DEFAULT_TYPOGRAPHY[id];
    if (found && !this.kitGiven)
      this.note(
        "approximated",
        "Global fonts",
        "Global fonts use Elementor's default kit; add your site kit for exact fonts.",
      );
    return found;
  }

  /** A font family the page uses, for the report's "load these fonts" line. */
  useFont(family: unknown): string | undefined {
    const stack = fontStack(family);
    const name = str(family)?.trim();
    if (stack && name) this.fonts.add(name);
    return stack;
  }

  private readKit(raw: unknown): boolean {
    const root = isRecord(raw) && isRecord(raw["settings"]) ? raw["settings"] : raw;
    if (!isRecord(root)) return false;
    let any = false;
    for (const key of ["system_colors", "custom_colors"]) {
      const list = root[key];
      if (!Array.isArray(list)) continue;
      for (const entry of list.slice(0, 200)) {
        if (!isRecord(entry)) continue;
        const id = str(entry["_id"]);
        const hex = color(entry["color"]);
        if (id && hex) {
          this.colors.set(id, hex);
          any = true;
        }
      }
    }
    for (const key of ["system_typography", "custom_typography"]) {
      const list = root[key];
      if (!Array.isArray(list)) continue;
      for (const entry of list.slice(0, 200)) {
        if (!isRecord(entry)) continue;
        const id = str(entry["_id"]);
        if (!id) continue;
        this.typography.set(id, {
          fontFamily: str(entry["typography_font_family"]),
          fontWeight: entry["typography_font_weight"],
          fontSize: entry["typography_font_size"],
          lineHeight: entry["typography_line_height"],
          letterSpacing: entry["typography_letter_spacing"],
        });
        any = true;
      }
    }
    return any;
  }
}

function globalId(ref: unknown, kind: "colors" | "typography"): string | undefined {
  const raw = str(ref);
  if (!raw) return undefined;
  const match = new RegExp(`^globals/${kind}\\?id=([A-Za-z0-9_-]{1,64})$`).exec(raw);
  if (match) return match[1];
  return /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : undefined;
}

/** A widget's `__globals__` reference for a setting key, if any. */
export function globalRef(settings: Settings, key: string): unknown {
  const globals = settings["__globals__"];
  return isRecord(globals) ? globals[key] : undefined;
}

/** Typography values from a global entry, as style keys. */
export function typographyFromGlobal(
  ctx: ImportContext,
  entry: GlobalTypography,
): Record<string, unknown> {
  const style: Record<string, unknown> = {};
  const family = ctx.useFont(entry.fontFamily);
  if (family) style["fontFamily"] = family;
  const weight = fontWeight(entry.fontWeight);
  if (weight !== undefined) style["fontWeight"] = weight;
  const size = slider(entry.fontSize);
  if (size) style["fontSize"] = size;
  return style;
}
