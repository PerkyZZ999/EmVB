import type { DesignSystem } from "../schema/design.ts";
import type { DeviceStyles, StyleProps } from "../schema/style.ts";
import { POPUP_DEVICES, type PopupDevice } from "../theme/popup-rules.ts";

export type ResponsiveDevice = "tablet" | "mobile";

/**
 * Merge `patch` into one device's overrides (W-096). `undefined` clears a key. An emptied device
 * is dropped, and so is `devices` itself. Pure.
 */
export function patchDeviceStyle(
  devices: DeviceStyles | undefined,
  device: ResponsiveDevice,
  patch: Partial<StyleProps>,
): DeviceStyles | undefined {
  const merged: Record<string, unknown> = { ...devices?.[device], ...patch };
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
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
  patch: Partial<StyleProps>,
): DesignSystem {
  const classes = design.classes ?? [];
  if (!classes.some((c) => c.id === classId)) return design;
  return {
    ...design,
    classes: classes.map((c) => {
      if (c.id !== classId) return c;
      const next = Object.assign({}, c);
      const devices = patchDeviceStyle(c.devices, device, patch);
      if (devices) next.devices = devices;
      else delete next.devices;
      return next;
    }),
  };
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
