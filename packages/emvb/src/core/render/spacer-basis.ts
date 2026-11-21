import type { Declaration } from "../sanitize/css.ts";
import type { DesignSystem } from "../schema/design.ts";
import type { LayoutNode } from "../schema/layout.ts";

type Level = "desktop" | "wide" | "laptop" | "tablet" | "mobile";
type Narrower = Exclude<Level, "desktop">;

/** The device styles each level reads on top of the desktop style (W-956, W-959). */
const CASCADE: Record<Level, readonly Narrower[]> = {
  desktop: [],
  wide: ["wide"],
  laptop: ["laptop"],
  tablet: ["laptop", "tablet"],
  mobile: ["laptop", "tablet", "mobile"],
};

type Styled = {
  style?: Record<string, unknown>;
  devices?: Partial<Record<Narrower, Record<string, unknown> | undefined>>;
};

function styleKeyAt(owner: Styled, level: Level, key: string): unknown {
  let value = owner.style?.[key];
  for (const device of CASCADE[level]) {
    const own = owner.devices?.[device]?.[key];
    if (own !== undefined) value = own;
  }
  return value;
}

/** A node's style key at a device: its own styles win over its classes (later classes win). */
function cascadedKey(
  node: LayoutNode,
  classes: DesignSystem["classes"],
  level: Level,
  key: string,
): unknown {
  const own = styleKeyAt(node as Styled, level, key);
  if (own !== undefined) return own;
  const applied = new Set(node.classes ?? []);
  let fromClass: unknown;
  for (const cls of classes ?? []) {
    if (!applied.has(cls.id)) continue;
    const value = styleKeyAt(cls as Styled, level, key);
    if (value !== undefined) fromClass = value;
  }
  return fromClass;
}

const ROW_DIRECTIONS = new Set(["row", "row-reverse"]);

function lastValue(lists: readonly Declaration[][], property: string): string | undefined {
  let value: string | undefined;
  for (const list of lists) {
    for (const d of list) if (d.property === property) value = d.value;
  }
  return value;
}

/**
 * W-1062: in a flex row a Spacer's width is its flex-basis, so there it gets its height as the
 * basis and makes a gap as wide as it is tall. Only where its parent lays out as a row at that
 * device: in a column the basis is the height and would override a device's own height. Each
 * device follows its own height, and the Spacer's own (or class) width or basis wins.
 * Pushes onto the level lists after their own declarations.
 */
export function pushSpacerBasis(
  spacer: LayoutNode,
  parent: LayoutNode | undefined,
  classes: DesignSystem["classes"],
  lists: Record<Level, Declaration[]>,
): void {
  if (!parent) return;
  const parentRow = (level: Level) => {
    const direction =
      cascadedKey(parent, classes, level, "flexDirection") ??
      (parent.type === "flexbox" ? "row" : undefined);
    return typeof direction === "string" && ROW_DIRECTIONS.has(direction);
  };
  const sized = (level: Level) =>
    cascadedKey(spacer, classes, level, "width") !== undefined ||
    cascadedKey(spacer, classes, level, "flexBasis") !== undefined;
  const chain = (level: Level) => [lists.desktop, ...CASCADE[level].map((d) => lists[d])];
  const want = (level: Level) =>
    parentRow(level) && !sized(level) ? lastValue(chain(level), "height") : undefined;
  const ownBasis = (level: Narrower) => lists[level].some((d) => d.property === "flex-basis");

  const desktop = want("desktop");
  if (desktop) lists.desktop.push({ property: "flex-basis", value: desktop });
  const wide = want("wide");
  if (wide !== desktop && !ownBasis("wide")) {
    lists.wide.push({ property: "flex-basis", value: wide ?? "auto" });
  }
  let previous = desktop;
  for (const level of ["laptop", "tablet", "mobile"] as const) {
    const value = want(level);
    if (value !== previous && !ownBasis(level)) {
      lists[level].push({ property: "flex-basis", value: value ?? "auto" });
    }
    previous = value;
  }
}
