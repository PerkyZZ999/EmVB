import { clipText } from "../limits.ts";
import type { DesignSystem } from "../schema/design.ts";
import { isParentNode, type Layout, type LayoutNode } from "../schema/layout.ts";
import { boxBecomesLink } from "../render/extras.ts";
import { ICON_ANIMATION_LIMIT_MS, iconAnimationRuns } from "../icons/animation-runs.ts";
import { updateNode } from "../tree-ops.ts";

/**
 * W-572: text as a screen reader says it: invisible format characters (zero-width space, word
 * joiner, BOM, bidi marks, soft hyphen) and blank-looking fillers go, then spaces are trimmed.
 * A label of only those reads as nothing.
 */
const spoken = (value: unknown): string =>
  String(value ?? "")
    .replace(/[\p{Cf}\u115F\u1160\u2800\u3164\uFFA0]/gu, "")
    .trim();

export type A11yFix =
  | { kind: "heading-level"; level: number }
  | { kind: "decorative" }
  | { kind: "text-color"; color: string }
  | { kind: "drop-aria-hidden" };

export type A11yIssue = {
  /** Stable per node and rule, for React keys and tests. */
  id: string;
  nodeId: string;
  rule:
    | "image-alt"
    | "heading-order"
    | "multiple-h1"
    | "no-h1"
    | "link-name"
    | "vague-link"
    | "contrast"
    | "hidden-focusable"
    | "new-tab"
    | "image-sizes"
    | "control-name"
    | "empty-heading"
    | "landmark-name"
    | "motion";
  severity: "error" | "warning";
  message: string;
  /** The one-click fix, when there is a safe one. */
  fix?: A11yFix;
  fixLabel?: string;
};

export type A11yReport = { score: number; issues: A11yIssue[] };

const WEIGHT = { error: 12, warning: 4 } as const;

/** Alt text that names a file or says nothing a screen reader user can use. */
// W-431: camera and screenshot file names as people get them, spaces included
// ("Screenshot 2026-10-01 at 10.00.00", "WhatsApp Image 2024-…"), not only with _ or -.
const USELESS_ALT =
  /^(?:image|img|photo|picture|graphic|logo|icon|untitled|\s*)$|\.(?:jpe?g|png|gif|webp|avif|svg)$|^(?:img|dsc|pxl|screen ?shot|whatsapp image)[\s_-]?\d+/i;
/** Link text that makes no sense out of context. */
/** W-411: trailing punctuation and arrows ("Read more…", "Learn more →", "Click here!") too. */
// W-432: the other common "more" phrasings ("See more", "More info", "Continue reading"…).
const VAGUE =
  /^(?:click here|here|read more|more|learn more|link|this|go|see more|view more|more info(?:rmation)?|details|find out more|continue reading|read more here|click here to (?:read|learn) more)\s*[.!…:»›→>\u2192\u203a\u00bb-]*$/i;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** A style colour as hex: literal, or a site colour variable; undefined when unknown. */
function hexOf(value: unknown, design: DesignSystem): string | undefined {
  if (typeof value === "string" && HEX.test(value)) return value;
  if (value && typeof value === "object" && "var" in value) {
    const id = (value as { var: unknown }).var;
    return design.variables.colors.find((c) => c.id === id)?.value;
  }
  return undefined;
}

function rgb(hex: string): [number, number, number] {
  let h = hex.slice(1);
  if (h.length <= 4) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const lum = (hex: string) => {
  const [r, g, bl] = rgb(hex).map(channel) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
};

/**
 * W-412: `top` painted over opaque `bottom`, as 6-digit hex. A colour's alpha (#rgba,
 * #rrggbbaa) used to be dropped, so faint text counted as full strength.
 */
function over(top: string, bottom: string, fade = 1): string {
  let h = top.slice(1);
  if (h.length <= 4) h = [...h].map((c) => c + c).join("");
  // W-415: `fade` is the element's opacity times its ancestors'.
  const alpha = (h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1) * fade;
  if (alpha >= 1) return `#${h.slice(0, 6)}`;
  const a = rgb(`#${h.slice(0, 6)}`);
  const b = rgb(bottom);
  return `#${a
    .map((c, i) => Math.round(c * alpha + (b[i] ?? 0) * (1 - alpha)))
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** WCAG contrast ratio between two hex colours, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].toSorted((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_TYPES = new Set([
  "heading",
  "text",
  "link",
  "label",
  "list",
  "post-title",
  "post-excerpt",
]);
const FIELD_TYPES = new Set(["text-input", "textarea", "select", "checkbox", "radio"]);
const LINKISH = new Set(["link", "button", "menu-item"]);

function px(value: unknown, design?: DesignSystem): number | undefined {
  // W-651: a font size variable counts at its size; a fluid one at its smallest, where the text
  // is hardest to read.
  if (design && value && typeof value === "object" && "var" in value) {
    const found = design.variables.fontSizes?.find((v) => v.id === (value as { var: unknown }).var);
    if (!found) return undefined;
    return found.fluid ? Math.min(found.fluid.min, found.fluid.max) : px(found.value);
  }
  if (!value || typeof value !== "object" || !("unit" in value)) return undefined;
  const v = value as { value: number; unit: string };
  if (v.unit === "px") return v.value;
  if (v.unit === "rem" || v.unit === "em") return v.value * 16;
  return undefined;
}

/** Browser default heading sizes in px, H1 to H6 (all bold). */
const HEADING_PX = [32, 24, 18.72, 16, 13.28, 10.72];

const headingLevel = (node: LayoutNode): number | undefined => {
  if (node.type !== "heading") return undefined;
  const level = (node.props as { level?: unknown }).level;
  return typeof level === "number" && level >= 1 && level <= 6 ? level : 2;
};

/**
 * The site's starting styles for the tag (W-639), then global classes in stylesheet order, then
 * the element's own style (W-637, W-638).
 */
function effectiveStyle(
  node: LayoutNode,
  design: DesignSystem,
): Record<string, unknown> | undefined {
  const level = headingLevel(node);
  const tagDefaults =
    level === undefined
      ? undefined
      : (design.defaults?.[`h${level}` as "h1"] as Record<string, unknown> | undefined);
  const classIds = new Set(node.classes ?? []);
  if (classIds.size === 0 && !tagDefaults) return node.style as Record<string, unknown> | undefined;
  const fromClasses = (design.classes ?? [])
    .filter((c) => classIds.has(c.id))
    .reduce<Record<string, unknown>>((acc, c) => Object.assign(acc, c.style), { ...tagDefaults });
  return { ...fromClasses, ...(node.style as Record<string, unknown> | undefined) };
}

/** Each device's style with the node's classes under the node's own (W-882). */
function deviceStyles(node: LayoutNode, design: DesignSystem): Record<string, unknown>[] {
  const ids = new Set(node.classes ?? []);
  const merged: Record<string, Record<string, unknown>> = {};
  const layers = [
    ...(design.classes ?? []).filter((c) => ids.has(c.id)).map((c) => c.devices),
    node.devices,
  ];
  for (const devices of layers) {
    for (const [key, st] of Object.entries(devices ?? {})) {
      merged[key] = { ...merged[key], ...(st as Record<string, unknown>) };
    }
  }
  return Object.values(merged);
}

/** Large text (24 px, or 18.66 px bold) needs 3:1; other text 4.5:1. H4 to H6 are not large (W-639). */
function largeText(node: LayoutNode, design: DesignSystem): boolean {
  const style = effectiveStyle(node, design) as
    | { fontSize?: unknown; fontWeight?: unknown }
    | undefined;
  const level = headingLevel(node);
  const size =
    px(style?.fontSize, design) ?? (level === undefined ? 16 : (HEADING_PX[level - 1] ?? 24));
  const weight =
    typeof style?.fontWeight === "number" ? style.fontWeight : node.type === "heading" ? 700 : 400;
  return size >= 24 || (size >= 18.66 && weight >= 700);
}

/**
 * Checks a page for common accessibility problems (W-317): image alt text, heading order and
 * the single H1, link names, vague link text, text contrast against its background, focusable
 * elements hidden with aria-hidden, and unannounced new tabs. Each issue points at an element; most have a safe fix.
 */
/**
 * W-798: whether a linked box has anything inside for its link name: text, a heading, a label, a
 * non-decorative image's alt, or an icon's or SVG's title. Bound and dynamic content counts, as
 * its text isn't known here.
 */
function boxHasName(node: LayoutNode): boolean {
  if (node.bind || node.type.startsWith("post-") || node.type === "loop" || node.type === "section")
    return true;
  const props = node.props as Record<string, unknown>;
  const decorative = props["decorative"] === true;
  const named =
    node.type === "image" || node.type === "icon" || node.type === "svg"
      ? !decorative && spoken(node.type === "image" ? props["alt"] : props["title"]) !== ""
      : ["text", "title", "label", "summary", "caption"].some((key) => spoken(props[key]) !== "");
  if (named) return true;
  return isParentNode(node) && node.children.some(boxHasName);
}

export function auditPage(layout: Layout, design: DesignSystem): A11yReport {
  const issues: A11yIssue[] = [];
  const add = (issue: Omit<A11yIssue, "id">) =>
    issues.push({ ...issue, id: `${issue.rule}:${issue.nodeId}` });
  let lastLevel = 0;
  // W-444: H1s counted per device, so a desktop H1 and a mobile H1 that swap places aren't two.
  const DEVICES = ["desktop", "tablet", "mobile"] as const;
  let h1s = [0, 0, 0];
  let shownOn = [true, true, true];
  // W-446: aria-hidden on a box hides everything inside it from screen readers, links included.
  let ariaHiddenAbove = false;
  // W-312 variants are alternatives: B is judged as if it stood where A does, so a page whose
  // A/B pair each have an H1 doesn't count two.
  const beforeA = new Map<string, [number[], number]>();
  const afterA = new Map<string, [number[], number]>();
  let fade = 1;
  // W-445: per device, like H1s, so a desktop menu and a mobile menu may share a name.
  const menuNames = [new Set<string>(), new Set<string>(), new Set<string>()];
  const walk = (node: LayoutNode, bg: string | undefined, color: string | undefined): void => {
    // W-413: an element hidden on every device (and what's inside it) is never shown or read.
    if (
      node !== layout.root &&
      (["desktop", "tablet", "mobile"] as const).every((d) => node.hiddenOn?.includes(d))
    ) {
      return;
    }
    const variant = node.variant;
    if (variant?.arm === "a") beforeA.set(variant.test, [[...h1s], lastLevel]);
    const before = variant?.arm === "b" ? beforeA.get(variant.test) : undefined;
    if (before) [h1s, lastLevel] = [[...before[0]], before[1]];
    const outerFade = fade;
    const opacity = effectiveStyle(node, design)?.opacity;
    if (typeof opacity === "number" && opacity >= 0 && opacity < 1) fade *= opacity;
    const outerShown = shownOn;
    shownOn = shownOn.map((shown, i) => shown && !node.hiddenOn?.includes(DEVICES[i] ?? "desktop"));
    visitNode(node, bg, color);
    fade = outerFade;
    shownOn = outerShown;
    if (variant?.arm === "a") afterA.set(variant.test, [[...h1s], lastLevel]);
    const after = variant?.arm === "b" ? afterA.get(variant.test) : undefined;
    if (after) [h1s, lastLevel] = [[...after[0]], after[1]];
  };
  const visitNode = (node: LayoutNode, bg: string | undefined, color: string | undefined): void => {
    const props = node.props as Record<string, unknown>;
    const style = effectiveStyle(node, design) as
      | {
          backgroundColor?: unknown;
          color?: unknown;
          backgroundImage?: unknown;
          backgroundVideo?: unknown;
          gradient?: unknown;
        }
      | undefined;
    // A background image, video or gradient hides the colour behind the text: contrast can't be
    // judged below it (W-633: a gradient or video was judged against the colour under it).
    const covered = style?.backgroundImage || style?.backgroundVideo || style?.gradient;
    const ownBg = covered ? "unknown" : hexOf(style?.backgroundColor, design);
    const nextBg =
      ownBg && ownBg !== "unknown" && bg && bg !== "unknown" ? over(ownBg, bg) : (ownBg ?? bg);
    const nextColor = hexOf(style?.color, design) ?? color;
    // W-386: a linked image's alt text is the link's name, so it can't be decorative.
    const imageLinked =
      node.type === "image" && typeof props["href"] === "string" && props["href"].trim() !== "";
    if (node.type === "image" && imageLinked && props["decorative"] === true) {
      add({
        nodeId: node.id,
        rule: "link-name",
        severity: "error",
        message: "This image is a link but is marked decorative, so the link has no name.",
      });
    } else if (node.type === "image" && props["decorative"] !== true) {
      const alt = typeof props["alt"] === "string" ? spoken(props["alt"]) : "";
      if (USELESS_ALT.test(alt)) {
        add({
          nodeId: node.id,
          rule: "image-alt",
          severity: "error",
          message: alt
            ? `The alt text "${clipText(alt, 40)}" doesn't describe the image.`
            : "This image has no alt text.",
          ...(imageLinked
            ? {}
            : { fix: { kind: "decorative" as const }, fixLabel: "Mark as decorative" }),
        });
      }
    }
    // W-786: a non-decorative SVG renders role="img"; with no Title and no <title> in its markup
    // it reached visitors with no name.
    if (
      node.type === "svg" &&
      props["decorative"] !== true &&
      !spoken(props["title"]) &&
      !/<title\b[^>]*>\s*[^<\s]/i.test(String(props["markup"] ?? ""))
    ) {
      add({
        nodeId: node.id,
        rule: "image-alt",
        severity: "error",
        message: "This SVG has no title, so screen readers can't say what it shows.",
        fix: { kind: "decorative" as const },
        fixLabel: "Mark as decorative",
      });
    }
    // W-791: motion visitors can't pause breaks WCAG 2.2.2 past 5 seconds, unless it is essential.
    // W-848: a spin or pulse now stops by itself after about 5 s, so only one whose single run
    // (a pulse's there and back) is longer than that is still flagged.
    // W-882: an animation from a class counts too, and the element's own style wins over it.
    const tooLong = [effectiveStyle(node, design), ...deviceStyles(node, design)].some((st) => {
      const anim = (
        st as { iconAnimation?: { type?: unknown; duration?: unknown; loop?: unknown } } | undefined
      )?.iconAnimation;
      if (anim?.type !== "spin" && anim?.type !== "pulse") return false;
      // W-853: Loop forever is motion without end, so it is flagged like before W-848.
      if (anim.loop === true) return true;
      const ms = typeof anim.duration === "number" ? anim.duration : 0;
      return iconAnimationRuns(anim.type, ms) * ms > ICON_ANIMATION_LIMIT_MS;
    });
    if (tooLong) {
      add({
        nodeId: node.id,
        rule: "motion",
        severity: "warning",
        message:
          "This icon animates for more than 5 seconds and visitors can't pause it. Shorten the duration, or keep it only if the motion is essential.",
      });
    }
    // W-403: with extra sizes but no Width, the main image is left out of srcset, so wide screens
    // can only get the listed copies.
    if (node.type === "image" && Array.isArray(props["sources"]) && props["sources"].length > 0) {
      const width = props["width"];
      const widthSet = typeof width === "number" && Number.isInteger(width) && width >= 1;
      const mainListed = (props["sources"] as { src?: unknown }[]).some(
        (s) => typeof s?.src === "string" && s.src === props["src"],
      );
      if (!widthSet && !mainListed) {
        add({
          nodeId: node.id,
          rule: "image-sizes",
          severity: "warning",
          message:
            "This image has extra sizes but no Width (px), so the main image is left out of the list the browser picks from.",
        });
      }
    }
    if (
      imageLinked &&
      props["newTab"] === true &&
      !/new (tab|window)/i.test(String(props["alt"] ?? ""))
    ) {
      add({
        nodeId: node.id,
        rule: "new-tab",
        severity: "warning",
        message: "This image link opens a new tab without saying so; say so in the alt text.",
      });
    }
    // W-408: a blank tab label or accordion title renders a tab or summary with no name.
    // W-416: a form field with no label (a placeholder is not one: it goes once you type).
    if (FIELD_TYPES.has(node.type) && !spoken(props["label"]) && !node.bind) {
      add({
        nodeId: node.id,
        rule: "control-name",
        severity: "error",
        message: spoken(props["placeholder"])
          ? "This field has only a placeholder, which disappears once you type; give it a label."
          : "This field has no label, so screen readers can't say what it's for.",
      });
    }
    const NAME_PROP = {
      "tab-panel": "label",
      "accordion-item": "summary",
      video: "title",
    } as const;
    if (node.type === "tab-panel" || node.type === "accordion-item" || node.type === "video") {
      const name = spoken(props[NAME_PROP[node.type]]);
      if (!name && !node.bind) {
        add({
          nodeId: node.id,
          rule: "control-name",
          severity: "error",
          message:
            node.type === "tab-panel"
              ? "This tab's label is blank, so the tab has no name."
              : node.type === "video"
                ? // W-410: the title names the player for screen readers.
                  "This video's title is blank, so the player has no name."
                : "This accordion item's title is blank, so it has no name.",
        });
      }
    }
    // W-424: two menus with the same name are two "Menu navigation" landmarks nobody can tell apart.
    if (node.type === "menu" && (node.children?.length ?? 0) > 0) {
      const name = spoken(props["label"]) || "Menu";
      const key = name.toLowerCase();
      if (menuNames.some((names, i) => shownOn[i] && names.has(key))) {
        add({
          nodeId: node.id,
          rule: "landmark-name",
          severity: "warning",
          message: `Another menu on this page is also named "${name}"; give each menu its own label.`,
        });
      }
      menuNames.forEach((names, i) => {
        if (shownOn[i]) names.add(key);
      });
    }
    // W-419: an empty heading still shows up in screen readers' heading list, with nothing to say.
    if (node.type === "heading" && !spoken(props["text"]) && !node.bind) {
      add({
        nodeId: node.id,
        rule: "empty-heading",
        severity: "warning",
        message: "This heading is empty; screen readers list it as a heading with no words.",
      });
    }
    if (node.type === "heading") {
      const level = typeof props["level"] === "number" ? props["level"] : 2;
      if (level === 1) {
        h1s = h1s.map((count, i) => count + (shownOn[i] ? 1 : 0));
        if (h1s.some((count, i) => shownOn[i] && count > 1)) {
          add({
            nodeId: node.id,
            rule: "multiple-h1",
            severity: "warning",
            message: "The page already has an H1; screen readers use it as the page title.",
            fix: { kind: "heading-level", level: 2 },
            fixLabel: "Make it H2",
          });
        }
      } else if (level > Math.max(lastLevel, 1) + 1) {
        // The site layout may give the page its H1, so an H2 may come first.
        const to = Math.max(2, lastLevel + 1);
        add({
          nodeId: node.id,
          rule: "heading-order",
          severity: "warning",
          message: `This H${level} skips a level after ${lastLevel ? `an H${lastLevel}` : "the page start"}.`,
          fix: { kind: "heading-level", level: to },
          fixLabel: `Make it H${to}`,
        });
      }
      lastLevel = level;
    }
    if (boxBecomesLink(node) && !boxHasName(node)) {
      add({
        nodeId: node.id,
        rule: "link-name",
        severity: "error",
        message: "This box is a link, but nothing inside it has text, so the link has no name.",
      });
    }
    if (LINKISH.has(node.type) || (node.type === "icon" && props["href"])) {
      const text = spoken(props["text"] ?? props["title"]);
      const hasHref = typeof props["href"] === "string" && props["href"].trim() !== "";
      if (!text && !node.bind) {
        add({
          nodeId: node.id,
          rule: "link-name",
          severity: "error",
          message:
            node.type === "icon"
              ? "This icon link has no title, so it has no name."
              : node.type === "button" && !hasHref
                ? // W-400: without a URL this is a <button>, not a link.
                  props["iconId"]
                  ? "This icon-only button has no text or title, so it has no name."
                  : "This button has no text."
                : "This link has no text.",
        });
      } else if (hasHref && VAGUE.test(text)) {
        add({
          nodeId: node.id,
          rule: "vague-link",
          severity: "warning",
          message: `"${text}" doesn't say where the link goes; screen reader users often list links alone.`,
        });
      }
      if (hasHref && props["newTab"] === true && !/new (tab|window)/i.test(text)) {
        add({
          nodeId: node.id,
          rule: "new-tab",
          severity: "warning",
          message: "This link opens a new tab without saying so; add “(opens in a new tab)”.",
        });
      }
    }
    if (TEXT_TYPES.has(node.type) && nextColor && nextBg && nextBg !== "unknown") {
      const ratio = contrastRatio(over(nextColor, nextBg, fade), nextBg);
      const needed = largeText(node, design) ? 3 : 4.5;
      if (ratio < needed) {
        const black = contrastRatio("#000000", nextBg);
        const white = contrastRatio("#ffffff", nextBg);
        const better = black >= white ? "#111111" : "#ffffff";
        // W-421: when opacity is what fades the text, a new colour can't fix it; say so instead
        // of offering a fix that leaves the issue in place.
        const fixable = contrastRatio(over(better, nextBg, fade), nextBg) >= needed;
        // W-772: round down, so 4.48:1 reads "4.4:1", never "4.5:1; it needs 4.5:1".
        const shown = (Math.floor(ratio * 10) / 10).toFixed(1);
        add({
          nodeId: node.id,
          rule: "contrast",
          severity: "error",
          message: fixable
            ? `Text contrast is ${shown}:1; it needs ${needed}:1.`
            : `Text contrast is ${shown}:1; it needs ${needed}:1. Opacity on this element or a parent fades it; raise the opacity.`,
          ...(fixable
            ? {
                fix: { kind: "text-color" as const, color: better },
                fixLabel: better === "#ffffff" ? "Use white text" : "Use dark text",
              }
            : {}),
        });
      }
    }
    // W-650: every form control takes keyboard focus, not just a text box.
    const focusable =
      LINKISH.has(node.type) ||
      FIELD_TYPES.has(node.type) ||
      node.type === "submit" ||
      Boolean(props["href"]);
    const ownAriaHidden = (node.attributes ?? []).some(
      (a) => a.name === "aria-hidden" && a.value === "true",
    );
    if (focusable && ownAriaHidden) {
      add({
        nodeId: node.id,
        rule: "hidden-focusable",
        severity: "error",
        message: "aria-hidden hides this from screen readers, but the keyboard still reaches it.",
        fix: { kind: "drop-aria-hidden" },
        fixLabel: "Remove aria-hidden",
      });
    } else if (focusable && ariaHiddenAbove) {
      add({
        nodeId: node.id,
        rule: "hidden-focusable",
        severity: "error",
        message:
          "This sits inside an element with aria-hidden, so screen readers skip it, but the keyboard still reaches it.",
      });
    }
    const outerHidden = ariaHiddenAbove;
    if (ownAriaHidden) ariaHiddenAbove = true;
    if (isParentNode(node)) for (const child of node.children) walk(child, nextBg, nextColor);
    ariaHiddenAbove = outerHidden;
  };
  walk(layout.root, undefined, undefined);
  if (h1s.every((count) => count === 0) && layout.root.children.length > 0) {
    issues.unshift({
      id: `no-h1:${layout.root.id}`,
      nodeId: layout.root.id,
      rule: "no-h1",
      severity: "warning",
      message: "The page has no H1. Pages that use the site layout may get one from it.",
    });
  }
  const penalty = issues.reduce((sum, issue) => sum + WEIGHT[issue.severity], 0);
  return { score: Math.max(0, 100 - penalty), issues };
}

/** Applies one issue's fix (W-317). Unchanged when the issue has none. */
export function applyA11yFix(layout: Layout, issue: A11yIssue): Layout {
  const fix = issue.fix;
  if (!fix) return layout;
  return updateNode(layout, issue.nodeId, (node) => {
    switch (fix.kind) {
      case "heading-level":
        return { ...node, props: { ...node.props, level: fix.level } } as LayoutNode;
      case "decorative":
        return { ...node, props: { ...node.props, decorative: true } } as LayoutNode;
      case "text-color":
        return { ...node, style: { ...node.style, color: fix.color } } as LayoutNode;
      case "drop-aria-hidden": {
        const attributes = (node.attributes ?? []).filter((a) => a.name !== "aria-hidden");
        const { attributes: _a, ...rest } = node;
        return (attributes.length > 0 ? { ...rest, attributes } : rest) as LayoutNode;
      }
    }
  });
}

/** Applies every issue's fix at once (W-317). */
export function applyAllA11yFixes(layout: Layout, issues: A11yIssue[]): Layout {
  const fixed = issues.reduce((next, issue) => applyA11yFix(next, issue), layout);
  // W-773: each heading-order fix was worked out against the page before any fix, so H1, H4,
  // H6 became H1, H2, H5 and the H5 still skipped. Re-chain the fixed headings in page order.
  const order = new Set(issues.filter((i) => i.rule === "heading-order").map((i) => i.nodeId));
  if (order.size === 0) return fixed;
  const levels = new Map<string, number>();
  let last = 0;
  const walk = (node: LayoutNode) => {
    if (node.type === "heading") {
      const own = typeof node.props["level"] === "number" ? node.props["level"] : 2;
      const level = order.has(node.id) ? Math.min(own, Math.max(2, last + 1)) : own;
      if (level !== own) levels.set(node.id, level);
      last = level;
    }
    if (isParentNode(node)) node.children.forEach(walk);
  };
  walk(fixed.root);
  return [...levels].reduce(
    (next, [id, level]) =>
      updateNode(next, id, (node) => ({ ...node, props: { ...node.props, level } }) as LayoutNode),
    fixed,
  );
}
