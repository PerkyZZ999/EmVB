import type { StyleProps } from "../../../../core/index.ts";
import type { LengthUnit } from "./length-units.ts";
import type { StyleKey } from "./style-sections.ts";

type Four<T> = readonly [T, T, T, T];

export type BoxGroupId = "padding" | "margin" | "borderWidth" | "borderRadius";

/** One linked four-box control (W-138, D-044): padding, margin, border width or radius. */
export type BoxGroup = {
  id: BoxGroupId;
  label: string;
  /** Border width and radius keep an all-sides key; a side or corner beats it. */
  all?: StyleKey;
  /** Top, right, bottom, left; or the corners clockwise from top left. */
  sides: Four<StyleKey>;
  /** The short names under the boxes. */
  names: Four<string>;
  noun: "sides" | "corners";
};

export const BOX_GROUPS: readonly BoxGroup[] = [
  {
    id: "padding",
    label: "Padding",
    sides: ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"],
    names: ["Top", "Right", "Bottom", "Left"],
    noun: "sides",
  },
  {
    id: "margin",
    label: "Margin",
    sides: ["marginTop", "marginRight", "marginBottom", "marginLeft"],
    names: ["Top", "Right", "Bottom", "Left"],
    noun: "sides",
  },
  {
    id: "borderWidth",
    label: "Border width",
    all: "borderWidth",
    sides: ["borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth"],
    names: ["Top", "Right", "Bottom", "Left"],
    noun: "sides",
  },
  {
    id: "borderRadius",
    label: "Radius",
    all: "borderRadius",
    sides: [
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderBottomRightRadius",
      "borderBottomLeftRadius",
    ],
    names: ["Top left", "Top right", "Bottom right", "Bottom left"],
    noun: "corners",
  },
];

const BY_KEY = new Map<StyleKey, BoxGroup>(
  BOX_GROUPS.flatMap((group) =>
    [...(group.all ? [group.all] : []), ...group.sides].map((key) => [key, group] as const),
  ),
);

/** The four-box control a style key belongs to, if any. */
export const boxGroupOf = (key: StyleKey): BoxGroup | undefined => BY_KEY.get(key);

/** Every key the control writes. */
const groupKeys = (group: BoxGroup): StyleKey[] => [
  ...(group.all ? [group.all] : []),
  ...group.sides,
];

/** What each box shows: its own value, else the all-sides value. */
export function sideValues(group: BoxGroup, style: StyleProps | undefined): unknown[] {
  const all = group.all ? style?.[group.all] : undefined;
  return group.sides.map((key) => style?.[key] ?? all);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** True when every box shows the same value, unset included. */
export const allSame = (values: readonly unknown[]) => values.every((v) => same(v, values[0]));

/** True when the edited target sets any of the control's keys. */
export const groupSet = (group: BoxGroup, style: StyleProps | undefined) =>
  groupKeys(group).some((key) => style?.[key] !== undefined);

/** One value on every box. Border width and radius use their all-sides key and drop the sides. */
export function linkedPatch(group: BoxGroup, value: unknown): Partial<StyleProps> {
  const patch: Record<string, unknown> = {};
  if (group.all) {
    patch[group.all] = value;
    for (const key of group.sides) patch[key] = undefined;
  } else {
    for (const key of group.sides) patch[key] = value;
  }
  return patch as Partial<StyleProps>;
}

/** One box's value. */
export const sidePatch = (group: BoxGroup, index: number, value: unknown): Partial<StyleProps> =>
  ({ [group.sides[index] as StyleKey]: value }) as Partial<StyleProps>;

/** Linking copies the first box that has a value to all four. */
export function linkPatch(group: BoxGroup, style: StyleProps | undefined): Partial<StyleProps> {
  return linkedPatch(
    group,
    sideValues(group, style).find((value) => value !== undefined),
  );
}

/** Clears every key of the control. */
export function resetPatch(group: BoxGroup): Partial<StyleProps> {
  const patch: Record<string, unknown> = {};
  for (const key of groupKeys(group)) patch[key] = undefined;
  return patch as Partial<StyleProps>;
}

const isLiteral = (value: unknown): value is { value: number; unit: LengthUnit } =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { value?: unknown }).value === "number" &&
  typeof (value as { unit?: unknown }).unit === "string";

/** The shared unit menu: every number the control sets keeps its value in the new unit. */
export function unitPatch(
  group: BoxGroup,
  style: StyleProps | undefined,
  unit: LengthUnit,
): Partial<StyleProps> {
  const patch: Record<string, unknown> = {};
  for (const key of groupKeys(group)) {
    const value = style?.[key];
    if (isLiteral(value) && value.unit !== unit) patch[key] = { value: value.value, unit };
  }
  return patch as Partial<StyleProps>;
}

/** The unit the shared menu shows: the first box with a number, else `fallback`. */
export function sharedUnit(values: readonly unknown[], fallback: LengthUnit): LengthUnit {
  return (values.find(isLiteral) as { unit: LengthUnit } | undefined)?.unit ?? fallback;
}

/** A box's text: the number (with its unit when it differs from the menu), `auto` or "". */
export function sideDraft(value: unknown, unit: LengthUnit, varName?: string): string {
  if (isLiteral(value))
    return value.unit === unit ? String(value.value) : `${value.value}${value.unit}`;
  if (value === "auto") return "auto";
  if (typeof value === "object" && value !== null && "var" in value) return varName ?? "";
  return "";
}
