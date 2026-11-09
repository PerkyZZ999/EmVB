import type { DesignSystem } from "../schema/design.ts";
import { editClass } from "./classes.ts";
import { patchNestedStyle } from "../migrate/v18.ts";
import type { DeviceStyles, StylePatch, StyleProps } from "../schema/style.ts";
import { POPUP_DEVICES, type PopupDevice } from "../theme/popup-rules.ts";

export type ResponsiveDevice = "tablet" | "mobile";

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
  return next.tablet || next.mobile ? next : undefined;
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

/** Add or remove one device. The result stays in desktop, tablet, mobile order, or undefined. */
export function toggleHidden(
  hidden: readonly PopupDevice[] | undefined,
  device: PopupDevice,
): PopupDevice[] | undefined {
  const set = new Set(hidden ?? []);
  if (set.has(device)) set.delete(device);
  else set.add(device);
  const next = POPUP_DEVICES.filter((item) => set.has(item));
  return next.length > 0 ? next : undefined;
}
