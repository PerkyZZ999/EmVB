import { MAX_UNKNOWN_DEPTH, MAX_UNKNOWN_KEYS, UNKNOWN_KEY_PATTERN } from "./limits.ts";
import { flattenMotion, isFlatMotionKey, withoutStrayMotionKeys } from "./migrate/v18.ts";
import { isRecord } from "./record.ts";
import { KNOWN_NODE_SCHEMAS } from "./schema/layout.ts";
import { FlatStyleProps, OwnStyle, StyleProps, WideStyle } from "./schema/style.ts";

/**
 * D-065 (W-925, contract 1.0): a 1.x document may carry keys this version does not know, on a
 * node, its props, or a style record (style, states, devices, query style; a class or tag
 * default in the design). They are set aside before the strict parse, checked against the
 * limits in limits.ts, put back untouched after it, and never rendered: `renderableLayout` and
 * `renderableDesign` keep known keys only. Everywhere else stays strict.
 */

export type Path = readonly (string | number)[];
export type UnknownKey = { path: Path; key: string; value: unknown };
type ContractIssue = { path: string; code: string; message: string };

function shapeKeys(schema: unknown): Set<string> {
  const shape = (schema as { shape?: Record<string, unknown> }).shape;
  return new Set(shape ? Object.keys(shape) : []);
}

const NODE_KEYS = new Set<string>(["children"]);
const PROP_KEYS = new Map<string, Set<string>>();
for (const schema of KNOWN_NODE_SCHEMAS) {
  const shape = (schema as unknown as { shape: Record<string, unknown> }).shape;
  for (const key of Object.keys(shape)) NODE_KEYS.add(key);
  const type = (shape["type"] as { value?: unknown }).value;
  if (typeof type === "string") PROP_KEYS.set(type, shapeKeys(shape["props"]));
}
const STYLE_KEYS = shapeKeys(StyleProps);
/** W-959: an element's or class's own style also knows `wide`, whose record is open too. */
const OWN_STYLE_KEYS = shapeKeys(OwnStyle);
const WIDE_KEYS = shapeKeys(WideStyle);
const FLAT_STYLE_KEYS = shapeKeys(FlatStyleProps);
const STATES = ["hover", "focus", "active"] as const;
const DEVICES = ["laptop", "tablet", "mobile"] as const;

function formatPath(path: Path): string {
  return path.reduce<string>((out, key) => {
    if (typeof key === "number") return `${out}[${key}]`;
    return out ? `${out}.${key}` : key;
  }, "");
}

function depthOf(value: unknown, limit: number): number {
  let max = 0;
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 1 }];
  while (stack.length > 0) {
    const { value: v, depth } = stack.pop() as { value: unknown; depth: number };
    if (typeof v !== "object" || v === null) continue;
    max = Math.max(max, depth);
    if (max > limit) return max;
    for (const child of Object.values(v)) stack.push({ value: child, depth: depth + 1 });
  }
  return max;
}

class Splitter {
  readonly extras: UnknownKey[] = [];
  readonly issues: ContractIssue[] = [];

  /** Moves keys not in `knownKeys` out of `record` (mutated: it is the upgrader's private copy). */
  take(record: unknown, knownKeys: ReadonlySet<string>, path: Path): void {
    if (!isRecord(record)) return;
    let count = 0;
    for (const key of Object.keys(record)) {
      if (knownKeys.has(key)) continue;
      const where = formatPath([...path, key]);
      count++;
      if (!UNKNOWN_KEY_PATTERN.test(key)) {
        this.issues.push({
          path: where,
          code: "unknown_key",
          message: `"${key.slice(0, 40)}" is not a key EmVB can keep. Names start with a letter and use letters, digits and _ . : / @ -.`,
        });
      } else if (count > MAX_UNKNOWN_KEYS) {
        this.issues.push({
          path: where,
          code: "unknown_key",
          message: `At most ${MAX_UNKNOWN_KEYS} keys this EmVB does not know can be kept in one place.`,
        });
      } else if (depthOf(record[key], MAX_UNKNOWN_DEPTH) > MAX_UNKNOWN_DEPTH) {
        this.issues.push({
          path: where,
          code: "unknown_key",
          message: `A key this EmVB does not know can nest at most ${MAX_UNKNOWN_DEPTH} levels.`,
        });
      } else {
        this.extras.push({ path, key, value: record[key] });
      }
      delete record[key];
    }
  }

  styleRecords(owner: Record<string, unknown>, path: Path): void {
    this.take(owner["style"], OWN_STYLE_KEYS, [...path, "style"]);
    const style = owner["style"];
    if (isRecord(style)) this.take(style["wide"], WIDE_KEYS, [...path, "style", "wide"]);
    const states = owner["states"];
    if (isRecord(states)) {
      // `motion` is a known key here so the schema refuses it in a state, not kept as unknown.
      for (const state of STATES) this.take(states[state], STYLE_KEYS, [...path, "states", state]);
    }
    const devices = owner["devices"];
    if (isRecord(devices)) {
      for (const device of DEVICES)
        this.take(devices[device], STYLE_KEYS, [...path, "devices", device]);
    }
  }

  node(node: unknown, path: Path): void {
    if (!isRecord(node)) return;
    const type = typeof node["type"] === "string" ? node["type"] : "";
    const props = PROP_KEYS.get(type);
    if (props) this.take(node["props"], props, [...path, "props"]);
    this.styleRecords(node, path);
    const query = node["query"];
    if (isRecord(query)) this.take(query["style"], STYLE_KEYS, [...path, "query", "style"]);
    this.take(node, NODE_KEYS, path);
    const children = node["children"];
    if (Array.isArray(children)) {
      children.forEach((child, i) => this.node(child, [...path, "children", i]));
    }
  }
}

/** Sets aside a layout's unknown keys. `doc` must be a private copy; it is changed in place. */
export function splitLayoutExtras(doc: Record<string, unknown>): Splitter {
  const splitter = new Splitter();
  splitter.node(doc["root"], ["root"]);
  return splitter;
}

/** Sets aside a design's unknown keys (class and tag-default style records). Changes `doc`. */
export function splitDesignExtras(doc: Record<string, unknown>): Splitter {
  const splitter = new Splitter();
  const classes = doc["classes"];
  if (Array.isArray(classes)) {
    classes.forEach((cls, i) => {
      if (isRecord(cls)) splitter.styleRecords(cls, ["classes", i]);
    });
  }
  const defaults = doc["defaults"];
  if (isRecord(defaults)) {
    for (const [tag, style] of Object.entries(defaults))
      splitter.take(style, STYLE_KEYS, ["defaults", tag]);
  }
  return splitter;
}

/** Puts the set-aside keys back on the parsed document, untouched. Changes `doc`. */
export function restoreExtras<T>(doc: T, extras: readonly UnknownKey[]): T {
  for (const { path, key, value } of extras) {
    let target: unknown = doc;
    for (const step of path) target = (target as Record<string | number, unknown>)?.[step];
    if (isRecord(target)) target[key] = value;
  }
  return doc;
}

function known<T>(record: T, keys: ReadonlySet<string>): T {
  if (!isRecord(record)) return record;
  let extra = false;
  for (const key of Object.keys(record)) if (!keys.has(key)) extra = true;
  if (!extra) return record;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) if (keys.has(key)) out[key] = value;
  return out as T;
}

const FLAT_RANK = new Map([...FLAT_STYLE_KEYS].map((key, i) => [key, i]));
const rankOf = (key: string): number => FLAT_RANK.get(key) ?? -1;

/**
 * The motion parts back where 0.x listed them among the other keys. A parsed style is in schema
 * order, so this gives exactly the 0.x order, and with it the same CSS.
 */
function inFlatOrder<T>(style: T, nested: unknown): T {
  if (!isRecord(style) || !isRecord(nested) || !("motion" in nested)) return style;
  const parts = Object.entries(style)
    .filter(([key]) => isFlatMotionKey(key))
    .toSorted(([a], [b]) => rankOf(a) - rankOf(b));
  const out: Record<string, unknown> = {};
  let next = 0;
  for (const [key, value] of Object.entries(style)) {
    if (isFlatMotionKey(key)) continue;
    while (next < parts.length && rankOf((parts[next] as [string, unknown])[0]) < rankOf(key)) {
      const [part, partValue] = parts[next++] as [string, unknown];
      out[part] = partValue;
    }
    out[key] = value;
  }
  for (; next < parts.length; next++) {
    const [part, partValue] = parts[next] as [string, unknown];
    out[part] = partValue;
  }
  return out as T;
}

/** A stored style as the renderer reads it: 0.x flat motion keys, known keys only. */
export function renderableStyle<T>(style: T): T {
  return inFlatOrder(known(flattenMotion(withoutStrayMotionKeys(style)), FLAT_STYLE_KEYS), style);
}

/**
 * W-959: the renderer reads Wide screen as one more device: `style.wide` becomes `devices.wide`
 * (known keys only) and its `hidden` becomes `wideHidden`. Without `style.wide` nothing changes.
 */
function wideAsDevice(owner: Record<string, unknown>, out: Record<string, unknown>): void {
  const style = owner["style"];
  const wide = isRecord(style) ? style["wide"] : undefined;
  if (!isRecord(wide)) return;
  const { hidden, ...rest } = wide;
  const devices = isRecord(out["devices"]) ? out["devices"] : {};
  if (Object.keys(rest).length > 0) out["devices"] = { ...devices, wide: renderableStyle(rest) };
  if (typeof hidden === "boolean") out["wideHidden"] = hidden;
}

function renderableStyles<T extends Record<string, unknown>>(owner: T): T {
  const out: Record<string, unknown> = { ...owner };
  if ("style" in owner) out["style"] = renderableStyle(owner["style"]);
  const states = owner["states"];
  if (isRecord(states)) {
    const next: Record<string, unknown> = {};
    // A state never takes motion; a forged `motion` is flattened so the CSS writer refuses its
    // parts with a warning, as it did for the 0.x flat keys.
    for (const [state, style] of Object.entries(states))
      next[state] = known(flattenMotion(withoutStrayMotionKeys(style)), FLAT_STYLE_KEYS);
    out["states"] = next;
  }
  const devices = owner["devices"];
  if (isRecord(devices)) {
    const next: Record<string, unknown> = {};
    for (const [device, style] of Object.entries(devices)) next[device] = renderableStyle(style);
    out["devices"] = next;
  }
  wideAsDevice(owner, out);
  return out as T;
}

/** A node as the renderer reads it: known keys only, motion flattened (D-065). */
export function renderableNode<T>(input: T): T {
  if (!isRecord(input)) return input;
  const node: Record<string, unknown> = input;
  const type = typeof node["type"] === "string" ? node["type"] : "";
  const propKeys = PROP_KEYS.get(type);
  const out: Record<string, unknown> = renderableStyles(propKeys ? known(node, NODE_KEYS) : node);
  if (propKeys && isRecord(out["props"])) out["props"] = known(out["props"], propKeys);
  const query = out["query"];
  if (isRecord(query) && "style" in query)
    out["query"] = { ...query, style: renderableStyle(query["style"]) };
  const children = out["children"];
  if (Array.isArray(children)) out["children"] = children.map((child) => renderableNode(child));
  return out as T;
}

export function renderableLayout<T extends { root: unknown }>(layout: T): T {
  return { ...layout, root: renderableNode(layout.root) };
}

export function renderableDesign<T>(design: T): T {
  if (!isRecord(design)) return design;
  const out: Record<string, unknown> = { ...design };
  if (Array.isArray(design["classes"])) {
    out["classes"] = design["classes"].map((cls: unknown) =>
      isRecord(cls) ? renderableStyles(cls) : cls,
    );
  }
  if (isRecord(design["defaults"])) {
    const defaults: Record<string, unknown> = {};
    for (const [tag, style] of Object.entries(design["defaults"]))
      defaults[tag] = renderableStyle(style);
    out["defaults"] = defaults;
  }
  return out as T;
}

function lazyTemplates<T>(templates: Record<string, T> | undefined): Record<string, T> | undefined {
  if (!templates) return templates;
  const out: Record<string, T> = {};
  for (const id of Object.keys(templates)) {
    let cached: T | undefined;
    Object.defineProperty(out, id, {
      enumerable: true,
      get: () => (cached ??= renderableLayout(templates[id] as T & { root: unknown })),
    });
  }
  return out;
}

/** Theme templates as the renderer reads them, converted when first used. */
export function renderableDynamic<
  T extends { sectionTemplates?: Record<string, unknown>; loopTemplates?: Record<string, unknown> },
>(dynamic: T | undefined): T | undefined {
  if (!dynamic || (!dynamic.sectionTemplates && !dynamic.loopTemplates)) return dynamic;
  return {
    ...dynamic,
    ...(dynamic.sectionTemplates
      ? { sectionTemplates: lazyTemplates(dynamic.sectionTemplates) }
      : {}),
    ...(dynamic.loopTemplates ? { loopTemplates: lazyTemplates(dynamic.loopTemplates) } : {}),
  };
}
