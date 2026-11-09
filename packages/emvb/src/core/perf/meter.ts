import type { DesignSystem } from "../schema/design.ts";
import { isParentNode, type Layout, type LayoutNode } from "../schema/layout.ts";
import { renderPage } from "../render/index.ts";
import type { ThemeDynamicData } from "../theme/dynamic.ts";
import { resolveEmbedUrl } from "../sanitize/embed-url.ts";
import { layoutScripts, SCRIPT_BYTES, type PageScript } from "./scripts.ts";

/** Budgets per page (W-310), in bytes over the wire. Generous for a marketing page. */
export const PERF_BUDGETS = {
  html: 100_000,
  css: 60_000,
  js: 30_000,
  images: 1_500_000,
} as const;

export type PerfKind = keyof typeof PERF_BUDGETS;

export type SectionWeight = {
  id: string;
  type: string;
  label?: string;
  bytes: number;
  images: number;
};

export type PerfReport = {
  bytes: Record<PerfKind, number>;
  /** Which kinds go over their budget. */
  over: PerfKind[];
  scripts: { script: PageScript; bytes: number; nodeIds: string[] }[];
  imageCount: number;
  embeds: number;
  /** Top-level sections, heaviest first. */
  sections: SectionWeight[];
  warnings: string[];
};

/** Bytes a string takes as UTF-8; HTML and CSS gzip to about a quarter, which we apply. */
const utf8 = (text: string) => new TextEncoder().encode(text).length;
const GZIP = 0.25;
/** An image with no size is guessed at a typical optimized photo (W-310). */
const IMAGE_GUESS = 120_000;
/** A YouTube iframe pulls in roughly this much before the visitor presses play. */
const EMBED_BYTES = 500_000;

function imageBytes(node: LayoutNode): number {
  const props = node.props as { width?: unknown; height?: unknown };
  const w = typeof props.width === "number" ? props.width : 0;
  const h = typeof props.height === "number" ? props.height : 0;
  // About 0.25 bytes per pixel for a WebP/AVIF photo at good quality.
  return w > 0 && h > 0 ? Math.max(5_000, Math.round(w * h * 0.25)) : IMAGE_GUESS;
}

type Sheets = { style?: unknown; devices?: Record<string, unknown>; query?: { style?: unknown } };
const sheetsHaveBackground = (owner: Sheets): boolean => {
  // W-645: a container-query override (W-346) can set the background too.
  const sheets = [owner.style, ...Object.values(owner.devices ?? {}), owner.query?.style];
  return sheets.some((style) => {
    const value = (style as { backgroundImage?: unknown } | undefined)?.backgroundImage;
    return typeof value === "string" ? value.length > 0 : Boolean(value);
  });
};

/** Ids of global classes that set a background image (W-635). */
const backgroundClasses = (design: DesignSystem): Set<string> =>
  new Set((design.classes ?? []).filter((c) => sheetsHaveBackground(c)).map((c) => c.id));

/** Its own style or one of its classes sets a background image (W-635). */
const hasBackgroundImage = (node: LayoutNode, bgClasses: Set<string>): boolean =>
  sheetsHaveBackground(node as Sheets) || (node.classes ?? []).some((id) => bgClasses.has(id));

const isPlayerEmbed = (node: LayoutNode): boolean => {
  const url = (node.props as { url?: unknown }).url;
  return typeof url === "string" && resolveEmbedUrl(url)?.kind === "iframe";
};

/** Images and embeds under a node, with their estimated weight. */
function media(
  node: LayoutNode,
  bgClasses: Set<string>,
  dynamic?: ThemeDynamicData,
): { images: number; bytes: number; embeds: number } {
  let images = 0;
  let bytes = 0;
  let embeds = 0;
  const seen = new Set<Layout>();
  /** W-671: a synced section or Loop Item part the canvas loaded is weighed with the page. */
  const part = (n: LayoutNode): Layout | undefined => {
    const props = n.props as { partId?: unknown };
    const found =
      n.type === "part-ref" && typeof props.partId === "string"
        ? dynamic?.sectionTemplates?.[props.partId.trim()]
        : n.type === "loop" && typeof props.partId === "string"
          ? dynamic?.loopTemplates?.[props.partId.trim()]
          : undefined;
    if (!found || seen.has(found)) return undefined;
    seen.add(found);
    return found;
  };
  const walk = (n: LayoutNode): void => {
    const template = part(n);
    if (template) walk(template.root);
    if (n.type === "image" || n.type === "post-image") {
      const src = (n.props as { src?: unknown }).src;
      if (n.type === "post-image" || (typeof src === "string" && src.trim())) {
        images += 1;
        bytes += imageBytes(n);
      }
    }
    if (hasBackgroundImage(n, bgClasses)) {
      images += 1;
      bytes += IMAGE_GUESS;
    }
    // W-508: only a YouTube or Vimeo player is a third-party embed; a media-library video loads
    // its metadata only, and a missing or refused URL renders nothing.
    if (n.type === "video" && isPlayerEmbed(n)) {
      embeds += 1;
      bytes += EMBED_BYTES;
    }
    if (isParentNode(n)) for (const child of n.children) walk(child);
  };
  walk(node);
  return { images, bytes, embeds };
}

const kb = (bytes: number) => `${Math.round(bytes / 1000)} KB`;

/**
 * The page's weight against its budget (W-310): HTML and CSS as rendered (gzipped estimate),
 * the scripts it loads, and its images, with the heaviest top-level section first.
 */
export function measurePage(
  layout: Layout,
  design: DesignSystem,
  dynamic?: ThemeDynamicData,
): PerfReport {
  const rendered = renderPage(layout, design, dynamic ? { dynamic } : {});
  const scripts = [...layoutScripts(layout)].map(([script, nodeIds]) => ({
    script,
    bytes: SCRIPT_BYTES[script],
    nodeIds,
  }));
  const bgClasses = backgroundClasses(design);
  const all = media(layout.root, bgClasses, dynamic);
  const bytes: Record<PerfKind, number> = {
    html: Math.round(utf8(rendered.html) * GZIP),
    css: Math.round(utf8(rendered.css) * GZIP),
    js: scripts.reduce((sum, s) => sum + s.bytes, 0),
    images: all.bytes,
  };
  const over = (Object.keys(PERF_BUDGETS) as PerfKind[]).filter((k) => bytes[k] > PERF_BUDGETS[k]);
  const opts = dynamic ? { dynamic } : {};
  const sections: SectionWeight[] = [];
  for (const child of layout.root.children.slice(0, 100)) {
    const alone: Layout = {
      schemaVersion: layout.schemaVersion,
      root: Object.assign({}, layout.root, { children: [child] }),
    };
    const one = renderPage(alone, design, opts);
    const m = media(child, bgClasses, dynamic);
    sections.push({
      id: child.id,
      type: child.type,
      ...(child.editorLabel ? { label: child.editorLabel } : {}),
      bytes: Math.round(utf8(one.html) * GZIP) + m.bytes,
      images: m.images,
    });
  }
  sections.sort((a, b) => b.bytes - a.bytes);
  const warnings: string[] = [];
  for (const kind of over) {
    warnings.push(
      `${kind.toUpperCase()} is ${kb(bytes[kind])}, over the ${kb(PERF_BUDGETS[kind])} budget.`,
    );
  }
  if (all.embeds > 0) {
    warnings.push(
      `${all.embeds} video embed${all.embeds === 1 ? "" : "s"} load a third-party player (about ${kb(EMBED_BYTES)} each).`,
    );
  }
  const first = layout.root.children[0];
  const firstImage = first ? findFirstImage(first) : undefined;
  if (firstImage && !(firstImage.props as { priority?: unknown }).priority) {
    warnings.push(
      "The first section's image isn't marked Priority, so it loads late; mark the hero image Priority.",
    );
  }
  return { bytes, over, scripts, imageCount: all.images, embeds: all.embeds, sections, warnings };
}

/** W-574: the first image that renders; an Image with no picture yet shows nothing to load. */
function findFirstImage(node: LayoutNode): LayoutNode | undefined {
  if (node.type === "image") {
    const src = (node.props as { src?: unknown }).src;
    if (typeof src === "string" && src.trim()) return node;
  }
  if (!isParentNode(node)) return undefined;
  for (const child of node.children) {
    const found = findFirstImage(child);
    if (found) return found;
  }
  return undefined;
}
