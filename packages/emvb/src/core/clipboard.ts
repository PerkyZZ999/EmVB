import {
  addNode,
  canDrop,
  parentOf,
  withFreshIds,
  REASONS,
  type Arranged,
  type Place,
  type Refusal,
} from "./arrange.ts";
import type { VariableKind } from "./design/variables.ts";
import { clearVariableRefs } from "./design/variables.ts";
import { ELEMENT_DESCRIPTORS, ELEMENTS, type ElementType } from "./elements/index.ts";
import { MAX_LAYOUT_BYTES } from "./limits.ts";
import { serialize } from "./render/vnode.ts";
import { sanitizeHref } from "./sanitize/href.ts";
import { sanitizeMediaUrl } from "./sanitize/media-url.ts";
import { sanitizeSvgReport } from "./sanitize/svg.ts";
import type { DesignSystem } from "./schema/design.ts";
import {
  isParentNode,
  LAYOUT_SCHEMA_VERSION,
  type ContainerNode,
  type Layout,
  type LayoutNode,
} from "./schema/layout.ts";
import { STYLE_STATES } from "./schema/state-names.ts";
import type { DeviceStyles, HiddenOn, StyleProps, StyleStates } from "./schema/style.ts";
import { findNode, nodeChildren } from "./tree-ops.ts";
import { summarizeIssues, validateLayout } from "./validate.ts";

/**
 * Copy and paste of elements and styles (W-093, D-033). The clipboard holds a versioned envelope
 * as JSON text; everything read back goes through the layout validator and the URL and SVG
 * sanitizers before it can reach a page, because another tab, an older or newer EmVB, or a
 * hand-edited value may have written it.
 */
export const CLIPBOARD_FORMAT = "emvb-clipboard";
export const CLIPBOARD_VERSION = 1;

/** A node's local style: `style` (with its transition) and the hover, focus and active states. */
export type CopiedStyle = {
  style?: StyleProps;
  states?: StyleStates;
  devices?: DeviceStyles;
  hiddenOn?: HiddenOn;
};

export type ClipEnvelope = {
  format: typeof CLIPBOARD_FORMAT;
  version: typeof CLIPBOARD_VERSION;
  schemaVersion: number;
} & ({ kind: "element"; node: LayoutNode } | ({ kind: "style" } & CopiedStyle));

export type Clip = { kind: "element"; node: LayoutNode } | { kind: "style"; style: CopiedStyle };

export const CLIP_REASONS = {
  empty: "Nothing has been copied yet.",
  unreadable: "The clipboard doesn't hold an EmVB element or style.",
  newer: "This was copied from a newer EmVB. Update EmVB to paste it.",
  tooLarge: "The copied element is too large to paste.",
  noElement: "The clipboard holds a style, not an element. Use Paste style.",
} as const;

/** The wrapper's id has an underscore, which generated node ids never have. */
const WRAPPER_ID = "emvb_clip";

const header = () =>
  ({
    format: CLIPBOARD_FORMAT,
    version: CLIPBOARD_VERSION,
    schemaVersion: LAYOUT_SCHEMA_VERSION,
  }) as const;

/** The local style of a node; classes stay behind (D-033). */
export function styleOf(node: LayoutNode): CopiedStyle {
  const copied: CopiedStyle = {};
  if (node.style) copied.style = structuredClone(node.style);
  if (node.states) copied.states = structuredClone(node.states);
  if (node.devices) copied.devices = structuredClone(node.devices);
  if (node.hiddenOn) copied.hiddenOn = structuredClone(node.hiddenOn);
  return copied;
}

export const elementClip = (node: LayoutNode): ClipEnvelope => ({
  ...header(),
  kind: "element",
  node: structuredClone(node),
});

export const styleClip = (node: LayoutNode): ClipEnvelope => ({
  ...header(),
  kind: "style",
  ...styleOf(node),
});

export const encodeClip = (clip: ClipEnvelope): string => JSON.stringify(clip);

export type ReadClip = { ok: true; clip: Clip } | Refusal;

const refuse = (reason: string): Refusal => ({ ok: false, reason });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1;

/** What kind of clip the text holds, without validating it (for enabling menu items). */
export function peekClipKind(raw: string | null): Clip["kind"] | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || data["format"] !== CLIPBOARD_FORMAT) return null;
    return data["kind"] === "element" || data["kind"] === "style" ? data["kind"] : null;
  } catch {
    return null;
  }
}

/** Validates the copied node or style as part of a page, so the same rules apply as on save. */
function validated(schemaVersion: number, root: Record<string, unknown>): Layout | Refusal {
  const checked = validateLayout({
    schemaVersion,
    root: { id: WRAPPER_ID, type: "container", props: {}, children: [], ...root },
  });
  if (checked.ok) return checked.layout;
  const issues = checked.issues.map((issue) =>
    Object.assign({}, issue, {
      path: issue.path.replace(/^root\.children\[0\]\.?/, "").replace(/^root\.?/, ""),
    }),
  );
  return refuse(`The copied content isn't valid: ${summarizeIssues(issues, 1)}`);
}

/** Reads clipboard text back into a clip, or says why it can't be pasted. */
export function readClip(raw: string | null): ReadClip {
  if (!raw) return refuse(CLIP_REASONS.empty);
  if (raw.length > MAX_LAYOUT_BYTES) return refuse(CLIP_REASONS.tooLarge);
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return refuse(CLIP_REASONS.unreadable);
  }
  if (!isRecord(data) || data["format"] !== CLIPBOARD_FORMAT)
    return refuse(CLIP_REASONS.unreadable);
  const { version, schemaVersion, kind } = data;
  if (!isCount(version) || !isCount(schemaVersion)) return refuse(CLIP_REASONS.unreadable);
  if (version > CLIPBOARD_VERSION || schemaVersion > LAYOUT_SCHEMA_VERSION)
    return refuse(CLIP_REASONS.newer);
  if (kind === "element") {
    const layout = validated(schemaVersion, { children: [data["node"]] });
    if ("ok" in layout) return layout;
    const node = layout.root.children[0];
    return node ? { ok: true, clip: { kind, node } } : refuse(CLIP_REASONS.unreadable);
  }
  if (kind === "style") {
    const own: Record<string, unknown> = {};
    if (data["style"] !== undefined) own["style"] = data["style"];
    if (data["states"] !== undefined) own["states"] = data["states"];
    if (data["devices"] !== undefined) own["devices"] = data["devices"];
    if (data["hiddenOn"] !== undefined) own["hiddenOn"] = data["hiddenOn"];
    const layout = validated(schemaVersion, own);
    if ("ok" in layout) return layout;
    return { ok: true, clip: { kind, style: styleOf(layout.root) } };
  }
  return refuse(CLIP_REASONS.unreadable);
}

/** The style a clip pastes: a style clip's own, or an element clip's element's local style. */
export const clipStyle = (clip: Clip): CopiedStyle =>
  clip.kind === "style" ? clip.style : styleOf(clip.node);

/** What a paste left out because the target page or site doesn't allow or have it. */
export type Dropped = {
  classes: number;
  variables: number;
  htmlIds: number;
  unsafe: number;
  /** W-231: `<image>`s left out of pasted SVGs because they point outside the site. */
  images?: number;
};

const none = (): Dropped => ({ classes: 0, variables: 0, htmlIds: 0, unsafe: 0 });

const VARIABLE_LISTS = {
  color: "colors",
  font: "fonts",
  fontSize: "fontSizes",
  spacing: "spacings",
} as const;

type Ref = { var: string; kind: VariableKind };

const asRef = (value: unknown): Ref | null =>
  isRecord(value) && typeof value["var"] === "string"
    ? { var: value["var"], kind: (value["from"] as VariableKind | undefined) ?? "color" }
    : null;

/** Every variable ref in a style: each value, plus nested colours (shadows, gradient, overlay). */
function refsInStyle(style: StyleProps | undefined): Ref[] {
  if (!style) return [];
  const values: unknown[] = [
    ...Object.values(style),
    style.boxShadow?.color,
    style.iconShadow?.color,
    ...(style.gradient?.stops ?? []).map((stop) => stop.color),
    style.overlay?.color,
  ];
  return values.map(asRef).filter((ref): ref is Ref => ref !== null);
}

const refsOf = (owner: CopiedStyle): Ref[] => [
  ...refsInStyle(owner.style),
  ...STYLE_STATES.flatMap((state) => refsInStyle(owner.states?.[state])),
  ...refsInStyle(owner.devices?.tablet),
  ...refsInStyle(owner.devices?.mobile),
];

const hasVariable = (design: DesignSystem, ref: Ref) =>
  (design.variables[VARIABLE_LISTS[ref.kind]] ?? []).some((v) => v.id === ref.var);

/** Removes refs to variables the design doesn't have, counting each. */
function withKnownVariables<T extends LayoutNode>(
  node: T,
  design: DesignSystem,
  dropped: Dropped,
): T {
  const missing = refsOf(node).filter((ref) => !hasVariable(design, ref));
  if (missing.length === 0) return node;
  dropped.variables += missing.length;
  let wrapper: Layout = {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    root: { id: WRAPPER_ID, type: "container", props: {}, children: [node] },
  };
  for (const ref of missing) wrapper = clearVariableRefs(wrapper, ref.var, ref.kind);
  return wrapper.root.children[0] as T;
}

const SANITIZERS = {
  href: sanitizeHref,
  media: sanitizeMediaUrl,
} as const;

/** Props the sanitizers refuse fall back to the element's default, or go when optional. */
function withSafeProps(node: LayoutNode, dropped: Dropped): LayoutNode {
  const type = node.type as ElementType;
  if (!(type in ELEMENTS)) return node;
  const props = { ...(node.props as Record<string, unknown>) };
  const defaults = (ELEMENTS[type].defaults() as { props: Record<string, unknown> }).props;
  let changed = false;
  const fallBack = (key: string, optional: boolean | undefined) => {
    dropped.unsafe++;
    changed = true;
    if (optional || defaults[key] === undefined) delete props[key];
    else props[key] = defaults[key];
  };
  const fields = ELEMENT_DESCRIPTORS.find((d) => d.type === type)?.fields ?? [];
  for (const field of fields) {
    if (field.kind !== "href" && field.kind !== "media") continue;
    const value = props[field.key];
    if (typeof value !== "string" || value.trim() === "") continue;
    const safe = SANITIZERS[field.kind](value);
    if (safe === undefined) fallBack(field.key, field.optional);
    else if (safe !== value) {
      props[field.key] = safe;
      changed = true;
    }
  }
  // W-234: a library icon's SVG gets the same check; a refused one leaves the icon on its id.
  if (type === "icon" && typeof props["iconSvg"] === "string") {
    const report = sanitizeSvgReport(props["iconSvg"]);
    if (!report.tree) {
      dropped.unsafe++;
      changed = true;
      delete props["iconSvg"];
    } else if (report.images > 0) {
      props["iconSvg"] = serialize(report.tree);
      dropped.images = (dropped.images ?? 0) + report.images;
      changed = true;
    }
  }
  if (type === "svg" && typeof props["markup"] === "string") {
    const report = sanitizeSvgReport(props["markup"]);
    if (!report.tree) fallBack("markup", false);
    else if (report.images > 0) {
      // Store what will render, so the pasted copy no longer names the external picture.
      props["markup"] = serialize(report.tree);
      dropped.images = (dropped.images ?? 0) + report.images;
      changed = true;
    }
  }
  return changed ? ({ ...node, props } as LayoutNode) : node;
}

function htmlIdsOf(node: LayoutNode, into = new Set<string>()): Set<string> {
  if (node.htmlId) into.add(node.htmlId);
  for (const child of nodeChildren(node)) htmlIdsOf(child, into);
  return into;
}

/** The checks above on one node, then on each of its children. */
function cleanNode(
  node: LayoutNode,
  design: DesignSystem,
  usedHtmlIds: Set<string>,
  dropped: Dropped,
): LayoutNode {
  let next = withSafeProps(withKnownVariables(node, design, dropped), dropped);
  if (next.classes) {
    const known = new Set((design.classes ?? []).map((cls) => cls.id));
    const kept = next.classes.filter((id) => known.has(id));
    if (kept.length !== next.classes.length) {
      dropped.classes += next.classes.length - kept.length;
      next = { ...next, classes: kept };
      if (kept.length === 0) delete next.classes;
    }
  }
  if (next.htmlId && usedHtmlIds.has(next.htmlId)) {
    dropped.htmlIds++;
    next = { ...next };
    delete next.htmlId;
  }
  const kids = nodeChildren(next);
  if (kids.length === 0) return next;
  return {
    ...next,
    children: kids.map((child) => cleanNode(child, design, usedHtmlIds, dropped)),
  } as LayoutNode;
}

/**
 * The node a paste inserts: new ids that aren't used on `layout` (like Duplicate), class and
 * variable refs the design doesn't have removed, CSS ids already on the page removed, and
 * values the sanitizers refuse replaced. `dropped` counts what was left out, for the notice.
 */
export function prepareElement(
  node: LayoutNode,
  layout: Layout,
  design: DesignSystem,
  random: () => number = Math.random,
): { node: LayoutNode; dropped: Dropped } {
  const dropped = none();
  const cleaned = cleanNode(node, design, htmlIdsOf(layout.root), dropped);
  return { node: withFreshIds(layout, cleaned, random), dropped };
}

/** A copied style with refs to variables the design doesn't have removed. */
export function prepareStyle(
  style: CopiedStyle,
  design: DesignSystem,
): { style: CopiedStyle; dropped: Dropped } {
  const dropped = none();
  const holder = withKnownVariables(
    { id: WRAPPER_ID, type: "divider", props: {}, ...style } as LayoutNode,
    design,
    dropped,
  );
  return { style: styleOf(holder), dropped };
}

/** The Icon's glyph keys (W-237): they style an Icon's `<svg>` and do nothing anywhere else. */
const ICON_STYLE_KEYS = [
  "iconRotate",
  "iconFlip",
  "iconScale",
  "iconStrokeWidth",
  "iconShadow",
  "iconAnimation",
] as const;

/** `style` without the Icon glyph keys; undefined when nothing else was set. */
function withoutIconKeys(style: object | undefined): object | undefined {
  if (!style) return style;
  const next: Record<string, unknown> = { ...style };
  let removed = false;
  for (const key of ICON_STYLE_KEYS) {
    if (key in next) {
      delete next[key];
      removed = true;
    }
  }
  if (!removed) return style;
  return Object.keys(next).length > 0 ? next : undefined;
}

/** A copied style ready for `type`: Icon glyph keys stay only on an Icon (W-292). */
function styleFor(type: string, style: CopiedStyle): CopiedStyle {
  if (type === "icon") return style;
  const out: CopiedStyle = { ...style };
  out.style = withoutIconKeys(style.style) as CopiedStyle["style"];
  for (const [field, groups] of [
    ["states", style.states],
    ["devices", style.devices],
  ] as const) {
    if (!groups) continue;
    const kept: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(groups)) {
      const cleaned = withoutIconKeys(value);
      if (cleaned) kept[name] = cleaned;
    }
    (out as Record<string, unknown>)[field] = Object.keys(kept).length > 0 ? kept : undefined;
  }
  for (const key of ["style", "states", "devices"] as const) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

/**
 * Replaces the node's local style, states and device overrides; props, classes and children stay.
 * Icon glyph keys are left out on anything but an Icon (W-292).
 */
export function applyStyle<T extends LayoutNode>(node: T, copied: CopiedStyle): T {
  const style = styleFor(node.type, copied);
  const next = { ...node };
  delete next.style;
  delete next.states;
  delete next.devices;
  delete next.hiddenOn;
  if (style.style) next.style = structuredClone(style.style);
  if (style.states) next.states = structuredClone(style.states);
  if (style.devices) next.devices = structuredClone(style.devices);
  if (style.hiddenOn) next.hiddenOn = structuredClone(style.hiddenOn);
  return next;
}

export type PasteMode = "auto" | "inside";

/**
 * Where a pasted node goes (W-093). `auto`: right after the selected element; if the drop rules
 * refuse that, inside it at the end (a field pasted on a form, a panel on Tabs); with nothing
 * selected, or the page's outer container selected, at the end of the page. `inside`: at the end
 * of the selected element. A refusal carries the drop rule's reason.
 */
export function pastePlace(
  layout: Layout,
  node: LayoutNode,
  selectedId: string | null,
  mode: PasteMode = "auto",
): { ok: true; place: Place } | Refusal {
  const target = (selectedId && findNode(layout, selectedId)) || layout.root;
  const source = { kind: "new" as const, node };
  const inside = (): { ok: true; place: Place } | Refusal => {
    const allowed = canDrop(layout, source, target.id);
    if (!allowed.ok) return allowed;
    return {
      ok: true,
      place: { parentId: target.id, index: (target as ContainerNode).children.length },
    };
  };
  const parentId = parentOf(layout, target.id);
  if (mode === "inside" || !parentId) {
    return isParentNode(target) ? inside() : refuse(REASONS.notContainer);
  }
  const after = canDrop(layout, source, parentId);
  if (after.ok) {
    const parent = findNode(layout, parentId) as ContainerNode;
    const index = parent.children.findIndex((child) => child.id === target.id);
    return { ok: true, place: { parentId, index: index + 1 } };
  }
  if (isParentNode(target)) {
    const into = inside();
    if (into.ok) return into;
  }
  return after;
}

/** Pastes a prepared node where `pastePlace` says, or returns the refusal. */
export function pasteNode(
  layout: Layout,
  node: LayoutNode,
  selectedId: string | null,
  mode: PasteMode = "auto",
): Arranged {
  const where = pastePlace(layout, node, selectedId, mode);
  return where.ok ? addNode(layout, node, where.place) : where;
}

/** The notice after a paste that left something out, or null when nothing was. */
export function droppedNotice(dropped: Dropped): string | null {
  const parts: string[] = [];
  const count = (n: number, one: string, many: string) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  };
  count(dropped.classes, "class", "classes");
  count(dropped.variables, "variable", "variables");
  count(dropped.htmlIds, "CSS id already used on this page", "CSS ids already used on this page");
  count(
    dropped.unsafe,
    "link, image or SVG that isn't allowed",
    "links, images or SVGs that aren't allowed",
  );
  count(dropped.images ?? 0, "external image", "external images");
  if (parts.length === 0) return null;
  const list =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  const missing =
    dropped.classes + dropped.variables > 0
      ? " Classes and variables this site doesn't have were removed."
      : "";
  return `Left out ${list}.${missing}`;
}
