/** Shared state of one Elementor import (W-945): ids, globals, icons, limits and the report. */
import { ICON_SVG_MAX } from "../../schema/layout.ts";
import { sanitizeHref } from "../../sanitize/href.ts";
import { sanitizeMediaUrl } from "../../sanitize/media-url.ts";
import { isSafeSvgMarkup } from "../../sanitize/svg.ts";
import { emptyDesign, type DesignSystem } from "../../schema/design.ts";
import { newNodeId, slugify } from "../../tree-ops.ts";
import { validateDesign } from "../../validate.ts";
import type { Layers } from "./classes.ts";
import type { CounterItem } from "./counter-steps.ts";
import { type AtomicSnapshots, emptySnapshots } from "./snapshots.ts";
import { color, fontStack, fontWeight, isRecord, slider, str, type Settings } from "./values.ts";

export type StyleClass = NonNullable<DesignSystem["classes"]>[number];

/** W-958: an Elementor global class as the EmVB class the import adds. */
export type ImportedClass = { id: string; layers: Layers; cls: StyleClass };

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
  /**
   * W-951: the markup of an SVG file the export points to (fetched by the dialog or chosen by the
   * person), so it becomes a recolourable icon instead of an image.
   */
  svg?: (url: string) => string | undefined;
  /**
   * W-958: where a link to a WordPress page (by its post id) goes on this site, such as
   * `/products`; chosen in the import dialog.
   */
  pageLink?: (id: number) => string | undefined;
  /** W-958: an old-site image's copy in the media library (its address and media id). */
  media?: (url: string) => { url: string; id?: string } | undefined;
  /**
   * W-958: point elements at their Elementor global classes as EmVB classes (returned in
   * `classes` for the dialog to add to the site), instead of copying the classes' styles in.
   */
  classes?: boolean;
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

/** Old-site images listed for copying; an export with more lists the first ones. */
const MAX_IMAGES = 300;

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
  /** W-951: SVG files the export points to whose markup wasn't given (the dialog fetches them). */
  readonly svgFiles = new Set<string>();
  private readonly svg: ImportOptions["svg"];
  private readonly pageLinkOf: ImportOptions["pageLink"];
  private readonly mediaOf: ImportOptions["media"];
  /** W-958: Elementor class id → its EmVB class, or undefined when it can't be one. */
  readonly imported = new Map<string, ImportedClass | undefined>();
  readonly useClasses: boolean;
  /** W-950: site and page CSS for emphasised and bold words inside a class (`wordRules`). */
  wordRules = new Map<string, { color?: string; italic?: boolean; bold?: boolean }>();
  /** W-961: classes whose `::before`/`::after` draws a CSS counter (`counterItems`). */
  counterItems = new Map<string, CounterItem>();
  /** W-958: images on the old site the page uses, so the dialog can copy them. */
  readonly images = new Set<string>();
  /** W-958: WordPress page ids the export links to, so the dialog can ask where each goes. */
  readonly pageLinks = new Set<number>();
  /** W-958: where the old WordPress site lives (the address before `/wp-content/`). */
  private oldSites: URL[] = [];
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
    this.svg = options.svg;
    this.pageLinkOf = options.pageLink;
    this.mediaOf = options.media;
    this.useClasses = options.classes === true;
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

  /**
   * Remembers an image on the old site (W-958: the dialog copies them into the media library) and
   * notes once that the ones not copied still load from there.
   */
  externalImage(url: string): void {
    if (!/^https?:\/\//i.test(url)) return;
    if (this.images.size < MAX_IMAGES) this.images.add(url);
    if (this.copied(url)) return;
    this.note(
      "approximated",
      "Images",
      "Images still load from their original address (your old site). Copy them to the media library in the import dialog, or upload them before that site goes away.",
    );
  }

  /** W-958: the media library copy of an old-site image, when the dialog made one. */
  copied(url: string): { url: string; id?: string } | undefined {
    const found = this.mediaOf?.(url);
    const safe = found ? sanitizeMediaUrl(found.url) : undefined;
    return found && safe ? { ...found, url: safe } : undefined;
  }

  /**
   * W-951: an SVG file's markup, ready to store as an icon's `iconSvg`: anything before `<svg`
   * (an XML declaration, comments) is dropped, and markup the SVG sanitizer refuses or that is over
   * the icon cap is not used. Files without markup are remembered in `svgFiles`.
   */
  svgMarkup(url: string): string | undefined {
    const raw = this.svg?.(url);
    if (raw === undefined) {
      this.svgFiles.add(url);
      return undefined;
    }
    const start = raw.search(/<svg[\s>]/i);
    const markup = start >= 0 ? raw.slice(start).trim() : "";
    if (markup && markup.length <= ICON_SVG_MAX && isSafeSvgMarkup(markup)) return markup;
    this.note(
      "skipped",
      "SVG files",
      "An SVG file is too large or has content EmVB doesn't allow (scripts, styles, links); it stays an image.",
    );
    return undefined;
  }

  /**
   * W-958: finds the old site's address from the uploads the export points to
   * (`https://old.example/blog/wp-content/…` → `https://old.example/blog`).
   */
  findOldSite(text: string): void {
    const found = new Map<string, URL>();
    for (const match of text.matchAll(
      /https?:\/\/[^"'<>\s/\\]+(?:\/[^"'<>/\\]*)*?(?=\/wp-content\/)/gi,
    )) {
      try {
        const url = new URL(match[0]);
        found.set(url.href.toLowerCase(), url);
      } catch {
        // Not an address: ignore it.
      }
      if (found.size >= 5) break;
    }
    this.oldSites = [...found.values()];
  }

  /**
   * An export's link, made safe. W-958: a link to a page on the old site becomes the same path on
   * this one (`https://old.example/blog/contact/` → `/contact`), so it works once those pages are
   * imported with the same slugs; files, admin pages and `?p=` links keep their address.
   */
  href(raw: string): string | undefined {
    const local = this.localPath(raw.trim());
    if (local === undefined) return sanitizeHref(raw);
    const safe = sanitizeHref(local);
    if (safe)
      this.note(
        "approximated",
        "Links",
        "Links to pages on your old site now point to the same address on this site; import or create those pages with the same slugs.",
      );
    return safe;
  }

  /** W-958: a WordPress page link's address here, made safe; every id is remembered. */
  pageLink(id: number): string | undefined {
    if (this.pageLinks.size < 100) this.pageLinks.add(id);
    const chosen = this.pageLinkOf?.(id)?.trim();
    return chosen ? sanitizeHref(chosen) : undefined;
  }

  private localPath(raw: string): string | undefined {
    if (this.oldSites.length === 0 || !/^https?:\/\//i.test(raw)) return undefined;
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return undefined;
    }
    for (const site of this.oldSites) {
      if (url.origin.toLowerCase() !== site.origin.toLowerCase()) continue;
      const base = site.pathname.replace(/\/+$/, "").toLowerCase();
      const path = url.pathname;
      const lower = path.toLowerCase();
      if (lower !== base && !lower.startsWith(`${base}/`)) continue;
      let rest = path.slice(base.length) || "/";
      if (/^\/(?:wp-content|wp-admin|wp-json|wp-includes)(?:\/|$)|\.php$/i.test(rest))
        return undefined;
      if (/[?&](?:p|page_id|post_type)=/i.test(url.search)) return undefined;
      if (rest.length > 1) rest = rest.replace(/\/+$/, "") || "/";
      return `${rest}${url.search}${url.hash}`;
    }
    return undefined;
  }

  /**
   * W-958: the EmVB class for an Elementor global class, made once per import: named by its
   * label, with an id from it, and only when it is a valid class (else elements stay inline).
   */
  importedClass(id: string, look: () => Layers, label?: string): ImportedClass | undefined {
    if (this.imported.has(id)) return this.imported.get(id);
    if (this.imported.size >= 100) return undefined;
    const layers = look();
    const name = (label ?? "").trim().slice(0, 60) || id.slice(0, 60);
    const taken = new Set([...this.imported.values()].map((c) => c?.id));
    const base = slugify(name).slice(0, 34).replace(/-+$/, "") || "elementor";
    let classId = base;
    for (let n = 2; taken.has(classId); n++) classId = `${base}-${n}`;
    const cls: StyleClass = { id: classId, name, style: layers.desktop };
    const devices = {
      ...(Object.keys(layers.laptop).length > 0 ? { laptop: layers.laptop } : {}),
      ...(Object.keys(layers.tablet).length > 0 ? { tablet: layers.tablet } : {}),
      ...(Object.keys(layers.mobile).length > 0 ? { mobile: layers.mobile } : {}),
    };
    if (Object.keys(devices).length > 0) cls.devices = devices;
    const states = {
      ...(Object.keys(layers.hover).length > 0 ? { hover: layers.hover } : {}),
      ...(Object.keys(layers.focus).length > 0 ? { focus: layers.focus } : {}),
      ...(Object.keys(layers.active).length > 0 ? { active: layers.active } : {}),
    };
    if (Object.keys(states).length > 0) cls.states = states as StyleClass["states"];
    const valid = validateDesign({ ...emptyDesign(), classes: [cls] }).ok;
    const made = valid ? { id: classId, layers, cls } : undefined;
    this.imported.set(id, made);
    if (made)
      this.note(
        "approximated",
        "Classes",
        "Elementor classes are added to your site's classes when you import. Existing classes are never changed: an identical one is reused, a different one with the same name is added as a numbered copy.",
      );
    return made;
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

/** An imported SVG file's icon id: its file name, so the editor shows where it came from. */
export function svgFileId(url: string): string {
  const file = url.split(/[?#]/)[0]?.split("/").pop() ?? "";
  const base = file.replace(/\.svg$/i, "").replace(/[^\w.-]+/g, "-") || "svg";
  return `file:${base}`.slice(0, 64);
}
