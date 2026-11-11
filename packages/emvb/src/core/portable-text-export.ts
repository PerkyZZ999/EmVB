// oxlint-disable no-underscore-dangle -- Portable Text names its fields _type, _key and _ref.
import type { Layout, LayoutNode, TextMark } from "./schema/layout.ts";
import { nodeChildren } from "./tree-ops.ts";
import { sanitizeUrl } from "./sanitize/url.ts";

/**
 * W-963: the reverse of Convert to EmVB. A layout becomes EmDash rich text (Portable Text): the
 * words, headings, lists, links and images, in reading order, without the design. What can't be
 * rich text (forms, embeds, icons, dividers, loops) is counted by type, never guessed at.
 */

type Span = { _type: "span"; _key: string; text: string; marks: string[] };
type LinkDef = { _type: "link"; _key: string; href: string; blank?: true };
export type PortableTextBlock =
  | {
      _type: "block";
      _key: string;
      style: string;
      children: Span[];
      markDefs: LinkDef[];
      listItem?: "bullet" | "number";
      level?: number;
    }
  | {
      _type: "image";
      _key: string;
      asset: { url: string; _ref?: string };
      alt?: string;
      width?: number;
      height?: number;
    };

export type PortableTextExport = {
  body: PortableTextBlock[];
  /** Elements that became blocks. */
  converted: number;
  /** Elements left out, by element type (`form: 2`). */
  skipped: Record<string, number>;
};

const LINK_SCHEMES: ReadonlySet<string> = new Set(["https:", "http:", "mailto:", "tel:"]);
const IMAGE_SCHEMES: ReadonlySet<string> = new Set(["https:", "http:"]);

/** Boxes whose children are read in order; they add nothing of their own. */
const BOXES = new Set([
  "container",
  "flexbox",
  "grid",
  "div",
  "div-block",
  "layout-section",
  "accordion",
  "tabs",
]);

/** Leaves with no words (or nothing that rich text can hold), left out without a count. */
const QUIET = new Set(["spacer"]);

/** A relative site path is kept as is; anything else must be a safe absolute URL. */
function safeHref(raw: string | undefined, schemes = LINK_SCHEMES): string | undefined {
  const href = raw?.trim();
  if (!href) return undefined;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (href.startsWith("#")) return href;
  return sanitizeUrl(href, schemes);
}

export function layoutToPortableText(
  layout: Layout,
  options: {
    /** Synced section layouts by part id, so their words come across too. */
    sectionTemplates?: Readonly<Record<string, Layout>>;
    /** Stable keys for tests. */
    key?: () => string;
  } = {},
): PortableTextExport {
  let counter = 0;
  const key = options.key ?? (() => `k${(counter++).toString(36)}`);
  const body: PortableTextBlock[] = [];
  const skipped: Record<string, number> = {};
  let converted = 0;
  const skip = (type: string) => {
    skipped[type] = (skipped[type] ?? 0) + 1;
  };

  const block = (
    text: string,
    style = "normal",
    marks: readonly TextMark[] = [],
    whole?: { href: string; newTab?: boolean },
  ) => {
    const markDefs: LinkDef[] = [];
    const linkKey = (href: string, newTab?: boolean) => {
      const def: LinkDef = { _type: "link", _key: key(), href, ...(newTab ? { blank: true } : {}) };
      markDefs.push(def);
      return def._key;
    };
    const wholeKey = whole ? linkKey(whole.href, whole.newTab) : undefined;
    const usable = marks.filter((m) => m.end > m.start && m.start < text.length);
    const cuts = new Set([0, text.length]);
    for (const m of usable) {
      cuts.add(Math.min(m.start, text.length));
      cuts.add(Math.min(m.end, text.length));
    }
    const points = [...cuts].toSorted((a, b) => a - b);
    const markKeys = new Map<TextMark, string>();
    const children: Span[] = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const from = points[i] ?? 0;
      const to = points[i + 1] ?? 0;
      if (to <= from) continue;
      const names: string[] = wholeKey ? [wholeKey] : [];
      for (const m of usable) {
        if (m.start > from || m.end < to) continue;
        if (m.bold) names.push("strong");
        if (m.italic) names.push("em");
        const href = wholeKey ? undefined : safeHref(m.href);
        if (href) {
          let k = markKeys.get(m);
          if (!k) {
            k = linkKey(href, m.newTab);
            markKeys.set(m, k);
          }
          names.push(k);
        }
      }
      children.push({ _type: "span", _key: key(), text: text.slice(from, to), marks: names });
    }
    if (children.length === 0) children.push({ _type: "span", _key: key(), text: "", marks: [] });
    body.push({ _type: "block", _key: key(), style, children, markDefs });
  };

  const visit = (node: LayoutNode, seen: ReadonlySet<string>) => {
    // An A/B test's B element repeats what A says; A is kept.
    if (node.variant?.arm === "b") {
      skip("A/B test variant");
      return;
    }
    const props = (node.props ?? {}) as Record<string, unknown>;
    const text = typeof props["text"] === "string" ? props["text"].trim() : "";
    const marks = Array.isArray(props["marks"]) ? (props["marks"] as TextMark[]) : [];
    switch (node.type) {
      case "heading": {
        if (!text) return;
        const href = safeHref(props["href"] as string | undefined);
        block(
          text,
          `h${Number(props["level"]) || 2}`,
          href ? [] : marks,
          href ? { href, newTab: props["newTab"] === true } : undefined,
        );
        converted++;
        return;
      }
      case "text":
      case "label":
      case "span": {
        if (!text) return;
        block(text, "normal", marks);
        converted++;
        return;
      }
      case "link":
      case "button": {
        if (!text) return;
        const href = safeHref(props["href"] as string | undefined);
        block(text, "normal", [], href ? { href, newTab: props["newTab"] === true } : undefined);
        converted++;
        return;
      }
      case "list": {
        const items = Array.isArray(props["items"]) ? props["items"] : [];
        const ordered =
          props["ordered"] === true ||
          (typeof props["marker"] === "string" &&
            !["disc", "circle", "square", "none"].includes(props["marker"]));
        let any = false;
        for (const item of items) {
          if (typeof item !== "string" || !item.trim()) continue;
          block(item.trim());
          const last = body.at(-1);
          if (last?._type === "block") {
            last.listItem = ordered ? "number" : "bullet";
            last.level = 1;
          }
          any = true;
        }
        if (any) converted++;
        return;
      }
      case "image": {
        const src = safeHref(props["src"] as string | undefined, IMAGE_SCHEMES);
        if (!src) {
          skip("image");
          return;
        }
        const alt = typeof props["alt"] === "string" ? props["alt"] : "";
        const mediaId = typeof props["mediaId"] === "string" ? props["mediaId"] : undefined;
        body.push({
          _type: "image",
          _key: key(),
          asset: { url: src, ...(mediaId ? { _ref: mediaId } : {}) },
          ...(alt && props["decorative"] !== true ? { alt } : {}),
          ...(typeof props["width"] === "number" ? { width: props["width"] } : {}),
          ...(typeof props["height"] === "number" ? { height: props["height"] } : {}),
        });
        converted++;
        if (typeof props["caption"] === "string" && props["caption"].trim())
          block(props["caption"].trim());
        return;
      }
      case "accordion-item":
      case "tab-panel": {
        const title = node.type === "accordion-item" ? props["summary"] : props["label"];
        if (typeof title === "string" && title.trim()) {
          block(title.trim(), "h3");
          converted++;
        }
        for (const child of nodeChildren(node)) visit(child, seen);
        return;
      }
      case "part-ref": {
        const partId = typeof props["partId"] === "string" ? props["partId"] : "";
        const synced = options.sectionTemplates?.[partId];
        if (synced && !seen.has(partId)) {
          visit(synced.root, new Set([...seen, partId]));
          return;
        }
        for (const child of nodeChildren(node)) visit(child, seen);
        return;
      }
      default: {
        if (BOXES.has(node.type)) {
          for (const child of nodeChildren(node)) visit(child, seen);
          return;
        }
        if (!QUIET.has(node.type)) skip(node.type);
      }
    }
  };
  visit(layout.root, new Set());
  return { body, converted, skipped };
}
