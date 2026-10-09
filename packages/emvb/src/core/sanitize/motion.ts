import { MOTION_EFFECTS, MOTION_LIMITS, type MotionEffect } from "../schema/motion.ts";
import type { Declaration } from "./css.ts";

type Effect = { type: MotionEffect; from: number; to: number };
type Range = "enter" | "cross" | "exit" | "page";

const RANGES: Record<Range, string> = {
  enter: "entry 0% entry 100%",
  cross: "cover 0% cover 100%",
  exit: "exit 0% exit 100%",
  page: "normal",
};

/** One keyframes per CSS property, so an unused effect never pins that property. */
const KEYFRAMES: Record<string, string> = {
  mo: "opacity",
  mt: "translate",
  ms: "scale",
  mr: "rotate",
  mb: "filter",
};

/**
 * The scroll motion keyframes (W-319). They exist only where scroll-driven animations do and the
 * visitor has not asked for reduced motion, so anywhere else `emvb-m*` names nothing and the
 * element stays still in its normal place.
 */
export const MOTION_KEYFRAMES = `@media (prefers-reduced-motion: no-preference){@supports (animation-timeline: view()){${Object.entries(
  KEYFRAMES,
)
  .map(
    ([name, prop]) =>
      `@keyframes emvb-${name}{from{${prop}:var(--emvb-${name}0)}to{${prop}:var(--emvb-${name}1)}}`,
  )
  .join("")}}}`;

const isEffect = (value: unknown): value is Effect => {
  if (typeof value !== "object" || value === null) return false;
  const { type, from, to } = value as Record<string, unknown>;
  if (typeof type !== "string" || !(MOTION_EFFECTS as readonly string[]).includes(type)) {
    return false;
  }
  const [min, max] = MOTION_LIMITS[type as MotionEffect];
  return [from, to].every(
    (n) => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max,
  );
};

const num = (n: number) => String(Math.round(n * 100) / 100);

/**
 * Declarations for a `scrollMotion` value (W-319): `animation` (one per animated property), its
 * timeline and range, and the `--emvb-m*` values the keyframes read. Undefined for a bad value;
 * `{ type: "none" }` is `animation: none`.
 */
export function motionDeclarations(value: unknown): Declaration[] | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (record["type"] === "none" && Object.keys(record).length === 1) {
    return [{ property: "animation", value: "none" }];
  }
  const { effects, range } = record as { effects?: unknown; range?: unknown };
  if (typeof range !== "string" || !Object.hasOwn(RANGES, range)) return undefined;
  if (!Array.isArray(effects) || effects.length === 0 || effects.length > MOTION_EFFECTS.length) {
    return undefined;
  }
  if (!effects.every(isEffect)) return undefined;
  const by = new Map(effects.map((e) => [e.type, e]));
  if (by.size !== effects.length) return undefined;
  const frames: [string, string, string][] = [];
  const fade = by.get("fade");
  if (fade) frames.push(["mo", num(fade.from / 100), num(fade.to / 100)]);
  const x = by.get("move-x");
  const y = by.get("move-y");
  if (x || y) {
    frames.push([
      "mt",
      `${num(x?.from ?? 0)}px ${num(y?.from ?? 0)}px`,
      `${num(x?.to ?? 0)}px ${num(y?.to ?? 0)}px`,
    ]);
  }
  const scale = by.get("scale");
  if (scale) frames.push(["ms", num(scale.from / 100), num(scale.to / 100)]);
  const rotate = by.get("rotate");
  if (rotate) frames.push(["mr", `${num(rotate.from)}deg`, `${num(rotate.to)}deg`]);
  const blur = by.get("blur");
  if (blur) frames.push(["mb", `blur(${num(blur.from)}px)`, `blur(${num(blur.to)}px)`]);
  const timeline = range === "page" ? "scroll(root)" : "view()";
  const rangeValue = RANGES[range as Range];
  return [
    { property: "animation", value: frames.map(([n]) => `emvb-${n} linear both`).join(", ") },
    { property: "animation-timeline", value: frames.map(() => timeline).join(", ") },
    { property: "animation-range", value: frames.map(() => rangeValue).join(", ") },
    ...frames.flatMap(([n, from, to]) => [
      { property: `--emvb-${n}0`, value: from },
      { property: `--emvb-${n}1`, value: to },
    ]),
  ];
}

/**
 * Adds scroll motion to an element's declarations (W-319). An entrance and scroll motion share
 * `animation`, so they are joined, entrance first, with matching timeline and range lists; motion
 * `none` leaves an entrance on the same style alone.
 */
export function withMotion(declarations: Declaration[], motion: Declaration[]): Declaration[] {
  const entrance = declarations.find((d) => d.property === "animation");
  if (!entrance) return [...declarations, ...motion];
  const [animation, timeline, range, ...vars] = motion;
  if (!animation || animation.value === "none" || !timeline || !range) return declarations;
  const entranceTimeline = declarations.find((d) => d.property === "animation-timeline");
  const entranceRange = declarations.find((d) => d.property === "animation-range");
  const rest = declarations.filter(
    (d) => d !== entrance && d !== entranceTimeline && d !== entranceRange,
  );
  return [
    ...rest,
    { property: "animation", value: `${entrance.value}, ${animation.value}` },
    {
      property: "animation-timeline",
      value: `${entranceTimeline?.value ?? "auto"}, ${timeline.value}`,
    },
    {
      property: "animation-range",
      value: `${entranceRange?.value ?? "normal"}, ${range.value}`,
    },
    ...vars,
  ];
}
