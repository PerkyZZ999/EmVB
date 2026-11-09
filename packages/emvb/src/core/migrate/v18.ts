import { isRecord } from "../record.ts";

/**
 * Schema 18 / design 17 (W-925, contract 1.0): the renames and the motion fold. Pure and
 * idempotent, so the same helpers also tidy MCP input that still uses the 0.x names.
 */

/** The 0.x flat style key for each part of `motion`, in the order the parts are listed. */
const MOTION_PARTS = {
  entrance: "entrance",
  scroll: "scrollMotion",
  transition: "transition",
  icon: "iconAnimation",
} as const;
export type MotionPart = keyof typeof MOTION_PARTS;
export type FlatMotionKey = (typeof MOTION_PARTS)[MotionPart];

const PART_OF: Readonly<Record<string, MotionPart>> = {
  entrance: "entrance",
  scrollMotion: "scroll",
  transition: "transition",
  iconAnimation: "icon",
};

export const FLAT_MOTION_KEYS: readonly FlatMotionKey[] = Object.values(MOTION_PARTS);

export function isFlatMotionKey(key: string): key is FlatMotionKey {
  return Object.hasOwn(PART_OF, key);
}

/** The `motion` part a 0.x flat key became, e.g. `scrollMotion` → `scroll`. */
function motionPartOf(key: FlatMotionKey): MotionPart {
  return PART_OF[key] as MotionPart;
}

/**
 * 0.x flat style → nested. `motion` takes the place of the first motion key and keeps the
 * parts in the order they were written, so the CSS comes out in the same order whenever the
 * motion keys were next to each other. A style with no motion key is returned as is.
 */
export function nestMotion<T>(style: T): T {
  if (!isRecord(style)) return style;
  if (!Object.keys(style).some(isFlatMotionKey)) return style;
  const out: Record<string, unknown> = {};
  const existing = isRecord(style["motion"]) ? style["motion"] : undefined;
  let motion: Record<string, unknown> | undefined;
  for (const [key, value] of Object.entries(style)) {
    if (key === "motion") {
      if (!motion) motion = out["motion"] = { ...existing };
      continue;
    }
    if (!isFlatMotionKey(key)) {
      out[key] = value;
      continue;
    }
    if (!motion) motion = out["motion"] = { ...existing };
    const part = motionPartOf(key);
    if (!(part in motion)) motion[part] = value;
  }
  return out as T;
}

/**
 * Nested → flat, for the renderer and the editor's style rows, which name the parts by their
 * 0.x keys. The parts take `motion`'s place. Idempotent: a style already flat comes back as is,
 * so cascades and helpers can flatten whatever they are handed. With `motion` present, its
 * parts win over stray top-level 0.x keys (those are unknown keys in a schema-18 document;
 * `withoutStrayMotionKeys` drops them where stored documents are read for rendering).
 */
export function flattenMotion<T>(style: T): T {
  if (!isRecord(style)) return style;
  if (!("motion" in style)) return style;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style)) {
    if (isFlatMotionKey(key)) continue;
    if (key !== "motion") {
      out[key] = value;
      continue;
    }
    if (!isRecord(value)) continue;
    for (const [part, partValue] of Object.entries(value)) {
      const flat = Object.hasOwn(MOTION_PARTS, part) ? MOTION_PARTS[part as MotionPart] : undefined;
      if (flat && partValue !== undefined) out[flat] = partValue;
    }
  }
  return out as T;
}

/**
 * A stored (schema-18) style without top-level 0.x motion keys: there they are unknown keys
 * (D-065), kept in the document but never rendered.
 */
export function withoutStrayMotionKeys<T>(style: T): T {
  if (!isRecord(style) || !Object.keys(style).some(isFlatMotionKey)) return style;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style)) if (!isFlatMotionKey(key)) out[key] = value;
  return out as T;
}

/**
 * Applies a flat style patch (0.x key names, `undefined` clears) to a stored, nested style.
 * Keys the patch does not name are kept as they are, unknown ones included (D-065).
 */
export function patchNestedStyle(
  stored: Readonly<Record<string, unknown>> | undefined,
  patch: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...stored };
  let motion: Record<string, unknown> | undefined = isRecord(out["motion"])
    ? { ...out["motion"] }
    : undefined;
  let touchedMotion = false;
  for (const [key, value] of Object.entries(patch)) {
    if (key === "motion") {
      motion = isRecord(value) ? { ...value } : undefined;
      touchedMotion = true;
      continue;
    }
    if (isFlatMotionKey(key)) {
      const part = motionPartOf(key);
      motion ??= {};
      if (value === undefined) delete motion[part];
      else motion[part] = value;
      touchedMotion = true;
      continue;
    }
    if (value === undefined) delete out[key];
    else out[key] = value;
  }
  if (touchedMotion) {
    if (motion && Object.keys(motion).length > 0) out["motion"] = motion;
    else delete out["motion"];
  }
  return out;
}

function foldDevices(devices: unknown): unknown {
  if (!isRecord(devices)) return devices;
  const out: Record<string, unknown> = { ...devices };
  for (const device of ["tablet", "mobile"]) {
    if (device in out) out[device] = nestMotion(out[device]);
  }
  return out;
}

/**
 * One 0.x node (and its children) in schema-18 names: `section` → `part-ref`, node `label` →
 * `editorLabel`, a Loop's `itemPartId` → `partId`, and motion folded under `motion`. An
 * already-current node comes back equal. Never mutates the input.
 */
export function upgradeLegacyNode(node: unknown): unknown {
  if (!isRecord(node)) return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "label" && !("editorLabel" in node)) out["editorLabel"] = value;
    else if (key === "type" && value === "section") out[key] = "part-ref";
    else if (key === "style") out[key] = nestMotion(value);
    else if (key === "devices") out[key] = foldDevices(value);
    else if (key === "query" && isRecord(value))
      out[key] = "style" in value ? { ...value, style: nestMotion(value["style"]) } : value;
    else if (key === "children" && Array.isArray(value))
      out[key] = value.map((child) => upgradeLegacyNode(child));
    else out[key] = value;
  }
  if (out["type"] === "loop" && isRecord(out["props"]) && "itemPartId" in out["props"]) {
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(out["props"])) {
      if (key !== "itemPartId") props[key] = value;
      else if (!("partId" in out["props"])) props["partId"] = value;
    }
    out["props"] = props;
  }
  return out;
}

/** Layout v17 → v18. */
export function layoutTo18(doc: Record<string, unknown>): Record<string, unknown> {
  return "root" in doc ? { ...doc, root: upgradeLegacyNode(doc["root"]) } : doc;
}

/** Design v16 → v17: motion folded in classes (style and devices) and tag defaults. */
export function designTo17(doc: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...doc };
  if (Array.isArray(doc["classes"])) {
    out["classes"] = doc["classes"].map((cls: unknown) => {
      if (!isRecord(cls)) return cls;
      const next: Record<string, unknown> = { ...cls };
      if ("style" in cls) next["style"] = nestMotion(cls["style"]);
      if ("devices" in cls) next["devices"] = foldDevices(cls["devices"]);
      return next;
    });
  }
  if (isRecord(doc["defaults"])) {
    const defaults: Record<string, unknown> = {};
    for (const [tag, style] of Object.entries(doc["defaults"])) defaults[tag] = nestMotion(style);
    out["defaults"] = defaults;
  }
  return out;
}
