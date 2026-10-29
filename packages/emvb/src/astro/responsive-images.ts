import { sanitizeMediaUrl, type Layout } from "../core/index.ts";

/**
 * The part of Astro's `getImage` (astro:assets) this uses. The host passes its own, so EmVB stays
 * free of the virtual module and the host's image service (sharp, Cloudflare Images) does the work.
 */
export type ResponsiveGetImage = (options: {
  src: string;
  width: number;
  height: number;
  widths: number[];
}) => Promise<{
  src: string;
  srcSet?: { values?: { url: string; descriptor?: string }[]; attribute?: string };
}>;

/** EmDash's library file path; only these pictures are the site's own to resize. */
const LIBRARY_PATH = "/_emdash/api/media/file/";
/** The layout allows six extra sizes per Image (W-344). */
const MAX_SOURCES = 6;
const BREAKPOINTS = [640, 960, 1280, 1600, 1920, 2560];

type Source = { src: string; width: number };
type Node = { type: string; props: Record<string, unknown>; children?: Node[] };

/** Widths up to 2x the shown width (for high-density screens), at most six. */
export function sourceWidths(width: number): number[] {
  const cap = Math.min(width * 2, 8000);
  const widths = BREAKPOINTS.filter((w) => w < cap && w !== width).slice(0, MAX_SOURCES - 1);
  return [...widths, cap];
}

function candidates(result: Awaited<ReturnType<ResponsiveGetImage>>): Source[] {
  const values =
    result.srcSet?.values ??
    (result.srcSet?.attribute ?? "").split(", ").map((part) => {
      const [url = "", descriptor] = part.trim().split(/\s+/);
      return { url, descriptor };
    });
  const sources: Source[] = [];
  for (const { url, descriptor } of values) {
    const width = Number(/^(\d+)w$/.exec(descriptor ?? "")?.[1]);
    const safe = sanitizeMediaUrl(url);
    // A space or comma would split into another srcset candidate (W-428).
    if (!safe || safe.length > 2000 || /[\s,]/.test(safe)) continue;
    if (!Number.isInteger(width) || width < 1 || width > 8000) continue;
    if (sources.some((s) => s.width === width)) continue;
    sources.push({ src: safe, width });
  }
  return sources.slice(0, MAX_SOURCES);
}

async function fill(node: Node, getImage: ResponsiveGetImage, origin: string): Promise<void> {
  if (node.type === "image") {
    const { src, width, height, sources } = node.props;
    const own = Array.isArray(sources) && sources.length > 0;
    if (
      !own &&
      typeof src === "string" &&
      src.startsWith(LIBRARY_PATH) &&
      typeof width === "number" &&
      typeof height === "number"
    ) {
      try {
        // Astro's services only resize absolute URLs; the host authorises its origin.
        const absolute = new URL(src, origin).href;
        const result = await getImage({
          src: absolute,
          width,
          height,
          widths: sourceWidths(width),
        });
        // Passed through unchanged: the origin isn't authorised, so a srcset would be a no-op.
        if (result.src && result.src !== absolute) {
          const found = candidates(result);
          if (found.length > 0) node.props = { ...node.props, sources: found };
        }
      } catch {
        // No image service, or it refused this file: the plain <img> stays.
      }
    }
  }
  await Promise.all((node.children ?? []).map((child) => fill(child, getImage, origin)));
}

/**
 * W-915: a copy of the layout whose library Images (with a size and no sizes of their own) get
 * `sources` from the host's image service, so the public <img> has a srcset. Opt-in: only when
 * the host passes `getImage`.
 */
export async function withResponsiveSources(
  layout: Layout,
  getImage: ResponsiveGetImage,
  origin: string,
): Promise<Layout> {
  const copy = structuredClone(layout);
  await fill(copy.root as unknown as Node, getImage, origin);
  return copy;
}
