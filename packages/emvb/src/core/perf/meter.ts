import type { DesignSystem } from "../schema/design.ts";
import { isParentNode, type Layout, type LayoutNode } from "../schema/layout.ts";
import { renderPage } from "../render/index.ts";
import type { ThemeDynamicData } from "../theme/dynamic.ts";
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

const hasBackgroundImage = (node: LayoutNode): boolean => {
  const sheets = [node.style, ...Object.values(node.devices ?? {})];
  return sheets.some((style) => {
    const value = (style as { backgroundImage?: unknown } | undefined)?.backgroundImage;
    return typeof value === "string" ? value.length > 0 : Boolean(value);
  });
};

/** Images and embeds under a node, with their estimated weight. */
function media(node: LayoutNode): { images: number; bytes: number; embeds: number } {
  let images = 0;
  let bytes = 0;
  let embeds = 0;
  const walk = (n: LayoutNode): void => {
    if (n.type === "image" || n.type === "post-image") {
      const src = (n.props as { src?: unknown }).src;
      if (n.type === "post-image" || (typeof src === "string" && src.trim())) {
        images += 1;
        bytes += imageBytes(n);
      }
    }
    if (hasBackgroundImage(n)) {
      images += 1;
      bytes += IMAGE_GUESS;
    }
    if (n.type === "video") {
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
  const all = media(layout.root);
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
    const m = media(child);
    sections.push({
      id: child.id,
      type: child.type,
      ...(child.label ? { label: child.label } : {}),
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

function findFirstImage(node: LayoutNode): LayoutNode | undefined {
  if (node.type === "image") return node;
  if (!isParentNode(node)) return undefined;
  for (const child of node.children) {
    const found = findFirstImage(child);
    if (found) return found;
  }
  return undefined;
}
