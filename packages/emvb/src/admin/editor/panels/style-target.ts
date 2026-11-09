import {
  patchClassDevices,
  patchClassState,
  patchClassStyle,
  patchDeviceStyle,
  patchStates,
  type DesignSystem,
  type DeviceStyles,
  type LayoutNode,
  type Device,
  type FlatStyleProps,
  type StyleProps,
  patchNestedStyle,
  type StyleStateName,
  type StyleStates,
} from "../../../core/index.ts";
import type { StyleStateChoice } from "./settings/StateSwitcher.tsx";

export type StyleSlot =
  | { owner: "element" | "class"; slot: "style" }
  | { owner: "element" | "class"; slot: "state"; state: StyleStateName }
  | { owner: "element" | "class"; slot: "device"; device: "laptop" | "tablet" | "mobile" };

/** Which style object a patch writes: the element's own, a class, a state, or a device. */
export function styleTarget({
  classId,
  device,
  state,
}: {
  classId: string | null;
  device: Device;
  state: StyleStateChoice;
}): StyleSlot {
  const owner = classId ? "class" : "element";
  if (device !== "desktop") return { owner, slot: "device", device };
  if (state === "normal") return { owner, slot: "style" };
  return { owner, slot: "state", state };
}

const withStyle = (node: LayoutNode, patch: Partial<FlatStyleProps>): LayoutNode => {
  const style = patchNestedStyle(node.style, patch);
  for (const key of Object.keys(style)) if (style[key] === undefined) delete style[key];
  return {
    ...node,
    style: Object.keys(style).length > 0 ? (style as StyleProps) : undefined,
  };
};

const withDevices = (node: LayoutNode, devices: DeviceStyles | undefined): LayoutNode => {
  const { devices: _old, ...rest } = node;
  return (devices ? { ...rest, devices } : rest) as LayoutNode;
};

const withStates = (node: LayoutNode, states: StyleStates | undefined): LayoutNode => {
  const { states: _old, ...rest } = node;
  return (states ? { ...rest, states } : rest) as LayoutNode;
};

export type StyleWrite =
  | { kind: "node"; node: LayoutNode }
  | { kind: "design"; design: DesignSystem };

/** Apply a style patch to the slot `styleTarget` names. */
export function applyStylePatch({
  node,
  design,
  classId,
  device,
  state,
  patch,
}: {
  node: LayoutNode;
  design: DesignSystem;
  classId: string | null;
  device: Device;
  state: StyleStateChoice;
  patch: Partial<FlatStyleProps>;
}): StyleWrite {
  const target = styleTarget({ classId, device, state });
  if (target.slot === "device") {
    if (!classId) {
      return {
        kind: "node",
        node: withDevices(node, patchDeviceStyle(node.devices, target.device, patch)),
      };
    }
    return {
      kind: "design",
      design: patchClassDevices(design, classId, target.device, patch),
    };
  }
  if (!classId) {
    return {
      kind: "node",
      node:
        state === "normal"
          ? withStyle(node, patch)
          : withStates(node, patchStates(node.states, state, patch)),
    };
  }
  const cls = { id: classId };
  const next =
    state === "normal"
      ? patchClassStyle(design, cls.id, patch)
      : patchClassState(design, cls.id, state, patch);
  return { kind: "design", design: next };
}
