import type { DesignSystem } from "../schema/design.ts";
import { editClass } from "./classes.ts";
import { patchNestedStyle } from "../migrate/v18.ts";
import type { DeviceStyles, OwnStyle, StylePatch, StyleProps, WideStyle } from "../schema/style.ts";
import { DEVICES, type Device, type EditorDevice, type StyleDevice } from "../theme/popup-rules.ts";

export type ResponsiveDevice = StyleDevice;

/**
 * Merge `patch` into one device's overrides (W-096). `undefined` clears a key. An emptied device
 * is dropped, and so is `devices` itself. Pure.
 */
export function patchDeviceStyle(
  devices: DeviceStyles | undefined,
  device: ResponsiveDevice,
  patch: StylePatch,
): DeviceStyles | undefined {
  const merged = patchNestedStyle(devices?.[device], patch);
  const next: DeviceStyles = { ...devices };
  if (Object.keys(merged).length > 0) next[device] = merged as StyleProps;
  else delete next[device];
  return next.laptop || next.tablet || next.mobile ? next : undefined;
}

/** `patchDeviceStyle` on a design class. Pure. */
export function patchClassDevices(
  design: DesignSystem,
  classId: string,
  device: ResponsiveDevice,
  patch: StylePatch,
): DesignSystem {
  return editClass(design, classId, (next) => {
    const devices = patchDeviceStyle(next.devices, device, patch);
    if (devices) next.devices = devices;
    else delete next.devices;
    return next;
  });
}

/** Add or remove one device. The result stays in desktop, laptop, tablet, mobile order, or undefined. */
export function toggleHidden(
  hidden: readonly Device[] | undefined,
  device: Device,
): Device[] | undefined {
  const set = new Set(hidden ?? []);
  if (set.has(device)) set.delete(device);
  else set.add(device);
  const next = DEVICES.filter((item) => set.has(item));
  return next.length > 0 ? next : undefined;
}

/**
 * W-959: merge `patch` into an own style's Wide screen record (`style.wide`), keeping its
 * `hidden`. An emptied record is dropped. Pure.
 */
export function patchWideStyle<T extends OwnStyle | undefined>(
  style: T,
  patch: StylePatch,
): OwnStyle | undefined {
  const { wide, ...desktop } = style ?? {};
  const { hidden, ...values } = wide ?? {};
  const merged = patchNestedStyle(values, patch) as StyleProps;
  const nextWide: WideStyle = { ...merged, ...(hidden === undefined ? {} : { hidden }) };
  const next: OwnStyle =
    Object.keys(nextWide).length > 0 ? { ...desktop, wide: nextWide } : desktop;
  return Object.keys(next).length > 0 ? next : undefined;
}

/** `patchWideStyle` on a design class. Pure. */
export function patchClassWide(
  design: DesignSystem,
  classId: string,
  patch: StylePatch,
): DesignSystem {
  return editClass(design, classId, (next) => {
    next.style = patchWideStyle(next.style, patch) ?? {};
    return next;
  });
}

/** An element or class whose hide can be read and toggled per device. */
type Hideable = { hiddenOn?: readonly Device[] | undefined; style?: OwnStyle | undefined };

/** Whether it is hidden on `device`. Wide screen follows Desktop unless `wide.hidden` is set. */
export function hiddenOnDevice(owner: Hideable, device: EditorDevice): boolean {
  if (device === "wide") return owner.style?.wide?.hidden ?? !!owner.hiddenOn?.includes("desktop");
  return !!owner.hiddenOn?.includes(device);
}

/**
 * W-959: hide or show on one device, Wide screen included. Wide screen follows Desktop until it is
 * set on its own: toggling Desktop never touches `wide.hidden`, so hiding on Desktop hides on wide
 * screens too. Toggling Wide screen stores its choice, and drops it when it matches Desktop again
 * (back to following Desktop). Returns the new `hiddenOn` and `style` (either may be undefined).
 * Pure.
 */
export function toggleHiddenOn(
  owner: Hideable,
  device: EditorDevice,
): { hiddenOn: Device[] | undefined; style: OwnStyle | undefined } {
  if (device !== "wide")
    return { hiddenOn: toggleHidden(owner.hiddenOn, device), style: owner.style };
  const desktop = !!owner.hiddenOn?.includes("desktop");
  const wide = !hiddenOnDevice(owner, "wide");
  const { wide: oldWide, ...rest } = owner.style ?? {};
  const { hidden: _old, ...values } = oldWide ?? {};
  const nextWide: WideStyle = { ...values, ...(wide === desktop ? {} : { hidden: wide }) };
  const style: OwnStyle = Object.keys(nextWide).length > 0 ? { ...rest, wide: nextWide } : rest;
  return {
    hiddenOn: owner.hiddenOn && owner.hiddenOn.length > 0 ? [...owner.hiddenOn] : undefined,
    style: Object.keys(style).length > 0 ? style : undefined,
  };
}

/** W-959: whether Wide screen's hide is its own choice, or still follows Desktop. */
export const wideHideIsOwn = (owner: Hideable): boolean => owner.style?.wide?.hidden !== undefined;

/**
 * Hidden on every device, so it never shows (W-409, W-413, W-500). W-959: an element hidden on
 * all four that Wide screen shows again (`wide.hidden: false`) still shows on wide screens. Reads
 * a stored node (`style.wide.hidden`) or a rendered one (`wideHidden`).
 */
export function hiddenOnEveryDevice(owner: Hideable & { wideHidden?: boolean }): boolean {
  if (!DEVICES.every((device) => owner.hiddenOn?.includes(device))) return false;
  return (owner.wideHidden ?? owner.style?.wide?.hidden) !== false;
}
