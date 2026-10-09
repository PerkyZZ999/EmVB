import type { DefaultStyleTag, DesignSystem } from "../schema/design.ts";
import type { LayoutNode } from "../schema/layout.ts";
import type { StyleStateName } from "../schema/state-names.ts";
import type { StyleProps } from "../schema/style.ts";

export type TraceDevice = "desktop" | "tablet" | "mobile";

/** Where one style value comes from (W-318). */
export type StyleSource = {
  kind: "default" | "class" | "local";
  /** "Site default (H2)", ".card", "This element". */
  label: string;
  /** Desktop, Tablet, Mobile, or a state such as Hover. */
  layer: string;
  classId?: string;
  value: unknown;
};

/** For one property: the value that applies and the ones it overrides, strongest first. */
export type StyleTrace = { winner: StyleSource; overridden: StyleSource[] };

/** The tag a node renders whose Site styles default applies (W-318). */
export function defaultTagFor(node: LayoutNode): DefaultStyleTag | undefined {
  const props = node.props as Record<string, unknown>;
  switch (node.type) {
    case "heading": {
      const level = typeof props["level"] === "number" ? props["level"] : 2;
      return `h${Math.min(6, Math.max(1, level))}` as DefaultStyleTag;
    }
    case "text":
      return props["tag"] === "div" ? undefined : "p";
    case "link":
      return "a";
    case "button":
      return typeof props["href"] === "string" && props["href"].trim() ? "a" : "button";
    default:
      return undefined;
  }
}

const LAYER = { desktop: "Desktop", tablet: "Tablet", mobile: "Mobile" } as const;
const STATE_LABEL: Record<StyleStateName, string> = {
  hover: "Hover",
  focus: "Focus",
  active: "Active",
};

type Owner = {
  kind: "class" | "local";
  label: string;
  classId?: string;
  style?: StyleProps;
  devices?: { tablet?: StyleProps; mobile?: StyleProps };
  states?: Partial<Record<StyleStateName, StyleProps>>;
};

/**
 * Every style layer that applies to a node on a device and in a state, weakest first, in the
 * cascade EmVB emits (W-318): the tag's Site styles default, each class in site order (later
 * classes win), then the element's own styles; within each, Desktop then Tablet then Mobile;
 * state styles last, classes before the element.
 */
export function styleLayers(
  node: LayoutNode,
  design: DesignSystem,
  device: TraceDevice = "desktop",
  state: StyleStateName | "normal" = "normal",
): { source: Omit<StyleSource, "value">; style: StyleProps }[] {
  const layers: { source: Omit<StyleSource, "value">; style: StyleProps }[] = [];
  const tag = defaultTagFor(node);
  const tagStyle = tag ? design.defaults?.[tag] : undefined;
  if (tag && tagStyle) {
    layers.push({
      source: { kind: "default", label: `Site default (${tag.toUpperCase()})`, layer: "Desktop" },
      style: tagStyle,
    });
  }
  const applied = new Set(node.classes ?? []);
  const owners: Owner[] = [];
  for (const cls of design.classes ?? []) {
    if (!applied.has(cls.id)) continue;
    const owner: Owner = {
      kind: "class",
      label: `.${cls.name}`,
      classId: cls.id,
      style: cls.style,
    };
    if (cls.devices) owner.devices = cls.devices;
    if (cls.states) owner.states = cls.states;
    owners.push(owner);
  }
  owners.push({
    kind: "local",
    label: "This element",
    ...(node.style ? { style: node.style } : {}),
    ...(node.devices ? { devices: node.devices } : {}),
    ...(node.states ? { states: node.states as Owner["states"] } : {}),
  });
  for (const owner of owners) {
    const base = {
      kind: owner.kind,
      label: owner.label,
      ...(owner.classId ? { classId: owner.classId } : {}),
    };
    if (owner.style) layers.push({ source: { ...base, layer: LAYER.desktop }, style: owner.style });
    if (device !== "desktop" && owner.devices?.tablet) {
      layers.push({ source: { ...base, layer: LAYER.tablet }, style: owner.devices.tablet });
    }
    if (device === "mobile" && owner.devices?.mobile) {
      layers.push({ source: { ...base, layer: LAYER.mobile }, style: owner.devices.mobile });
    }
  }
  if (state !== "normal") {
    for (const owner of owners) {
      const style = owner.states?.[state];
      if (!style) continue;
      layers.push({
        source: {
          kind: owner.kind,
          label: owner.label,
          ...(owner.classId ? { classId: owner.classId } : {}),
          layer: STATE_LABEL[state],
        },
        style,
      });
    }
  }
  return layers;
}

/** Where each set property of a node comes from (W-318), by property name. */
export function traceStyle(
  node: LayoutNode,
  design: DesignSystem,
  device: TraceDevice = "desktop",
  state: StyleStateName | "normal" = "normal",
): Record<string, StyleTrace> {
  const all: Record<string, StyleSource[]> = {};
  for (const { source, style } of styleLayers(node, design, device, state)) {
    for (const [key, value] of Object.entries(style)) {
      if (value === undefined) continue;
      (all[key] ??= []).push({ ...source, value });
    }
  }
  const out: Record<string, StyleTrace> = {};
  for (const [key, sources] of Object.entries(all)) {
    const strongest = sources.toReversed();
    out[key] = { winner: strongest[0] as StyleSource, overridden: strongest.slice(1) };
  }
  return out;
}

/**
 * What a node's own style edit sits on top of (W-318): every value from its tag default and its
 * classes on this device (and, on Tablet/Mobile or in a state, from its own wider layers). The
 * editor shows these as the controls' inherited values.
 */
export function inheritedStyle(
  node: LayoutNode,
  design: DesignSystem,
  device: TraceDevice,
  state: StyleStateName | "normal",
): StyleProps {
  const layers = styleLayers(node, design, device, state);
  // Drop the layer being edited: the element's own on this device and state.
  const editing = state !== "normal" ? STATE_LABEL[state] : LAYER[device];
  const below = layers.filter((l) => !(l.source.kind === "local" && l.source.layer === editing));
  return Object.assign({}, ...below.map((l) => l.style)) as StyleProps;
}
