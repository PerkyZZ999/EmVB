/**
 * W-958: Elementor global classes as EmVB classes, without changing how a page looks.
 *
 * EmVB writes class rules before element rules, at the base and inside each device's media
 * query, and a `:hover`, `:focus` or `:active` rule outranks a plain one. So on a device the
 * winner is the last of: class desktop, element desktop, class tablet, element tablet, class
 * mobile, element mobile; in a state, the element's state beats the class's, which beats both.
 */
import type { Style } from "./style.ts";

export const STATE_NAMES = ["hover", "focus", "active"] as const;
type StateName = (typeof STATE_NAMES)[number];

/** Desktop style, tablet and mobile overrides, and state styles, as EmVB stores them. */
export type Layers = { desktop: Style; tablet: Style; mobile: Style } & Record<StateName, Style>;

const DEVICES = ["desktop", "tablet", "mobile"] as const;
type Device = (typeof DEVICES)[number];

/** Values compare by content, whatever their key order. */
function same(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

function stable(value: unknown): string {
  const sorted = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sorted)
      : typeof v === "object" && v !== null
        ? Object.fromEntries(
            Object.keys(v)
              .toSorted()
              .map((k) => [k, sorted((v as Record<string, unknown>)[k])]),
          )
        : v;
  return JSON.stringify(sorted(value)) ?? "undefined";
}

/** What an element alone shows on a device: its style with the overrides down to it. */
function elementAt(l: Layers, device: Device): Style {
  if (device === "desktop") return l.desktop;
  if (device === "tablet") return { ...l.desktop, ...l.tablet };
  return { ...l.desktop, ...l.tablet, ...l.mobile };
}

/** What class rules plus element rules show on a device, in EmVB's rule order. */
function cascadeAt(cls: Layers, own: Layers, device: Device): Style {
  const out: Style = { ...cls.desktop, ...own.desktop };
  if (device === "desktop") return out;
  Object.assign(out, cls.tablet, own.tablet);
  if (device === "tablet") return out;
  return Object.assign(out, cls.mobile, own.mobile);
}

/**
 * Several classes on one element as one set of layers. Undefined when two of them set the same
 * key differently in a layer: their order on the site (the Site styles order) would decide.
 */
export function combineLayers(list: readonly Layers[]): Layers | undefined {
  const out: Layers = { desktop: {}, tablet: {}, mobile: {}, hover: {}, focus: {}, active: {} };
  for (const layers of list) {
    for (const name of [...DEVICES, ...STATE_NAMES]) {
      for (const [key, value] of Object.entries(layers[name])) {
        if (key in out[name] && !same(out[name][key], value)) return undefined;
        out[name][key] = value;
      }
    }
  }
  return out;
}

/**
 * The fewest inline values that, over `cls`, show exactly `want` on every device and in every
 * state. Undefined when that can't be done: a class sets something `want` doesn't have (inline
 * styles can't unset it), or a class state value would need a different undo per device.
 */
export function inlineOver(want: Layers, cls: Layers): Layers | undefined {
  const own: Layers = { desktop: {}, tablet: {}, mobile: {}, hover: {}, focus: {}, active: {} };
  for (const device of DEVICES) {
    const target = elementAt(want, device);
    const shown = cascadeAt(cls, own, device);
    for (const key of new Set([...Object.keys(target), ...Object.keys(shown)])) {
      if (same(target[key], shown[key])) continue;
      if (target[key] === undefined) return undefined;
      own[device][key] = target[key];
    }
  }
  for (const state of STATE_NAMES) {
    for (const key of new Set([...Object.keys(want[state]), ...Object.keys(cls[state])])) {
      if (key in want[state]) {
        if (!(key in cls[state]) || !same(cls[state][key], want[state][key])) {
          own[state][key] = want[state][key];
        }
        continue;
      }
      // The class's state value covers every device; the element must undo it with the value
      // it shows there, which only works when that value is the same on every device.
      const values = DEVICES.map((device) => elementAt(want, device)[key]);
      const first = values[0];
      if (first === undefined || values.some((v) => !same(v, first))) return undefined;
      own[state][key] = first;
    }
  }
  return own;
}
