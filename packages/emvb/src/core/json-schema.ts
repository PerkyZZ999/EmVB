import { z } from "zod";
import { DESIGN_SCHEMA_VERSION, DesignSystem } from "./schema/design.ts";
import { CONTRACT_VERSION, KNOWN_NODE_SCHEMAS, LAYOUT_SCHEMA_VERSION } from "./schema/layout.ts";
import { DeviceStyles, OwnStyle, StyleProps, StyleStates, WideStyle } from "./schema/style.ts";

/**
 * JSON Schema (2020-12) exports of the stored formats (W-925, contract 1.0). They describe the
 * keys this version knows; per D-065 a validator also keeps unknown keys on a node, its props
 * and its style records (see docs/SCHEMA.md), so these schemas are stricter than `validateLayout`.
 */
const NOTE =
  "EmVB keeps unknown keys on a node, its props and its style records (D-065, limits in docs/SCHEMA.md); this schema lists the known ones only. An element type this version does not know is kept too.";

type Json = Record<string, unknown>;
const toJson = (schema: z.ZodType): Json => {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema, {
    io: "input",
    unrepresentable: "any",
  }) as Json;
  return rest;
};

/** Replaces every sub-schema equal to a shared one with a `$ref` to it, bottom-up. */
function withRefs(value: unknown, shared: ReadonlyMap<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => withRefs(item, shared));
  if (typeof value !== "object" || value === null) return value;
  const ref = shared.get(JSON.stringify(value));
  if (ref) return { $ref: `#/$defs/${ref}` };
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withRefs(v, shared)]));
}

/** The style records every node and class shares, as `$defs`, and the map that refers to them. */
function styleDefs(): { defs: Json; shared: Map<string, string> } {
  const style = toJson(StyleProps);
  const states = toJson(StyleStates);
  const devices = toJson(DeviceStyles);
  // A state's style is the style without `motion`; one shared definition for all three states.
  const stateStyle = (states["properties"] as Record<string, Json>)["hover"] as Json;
  const inner = new Map([
    [JSON.stringify(style), "style"],
    [JSON.stringify(stateStyle), "stateStyle"],
  ]);
  const defs: Json = {
    style,
    stateStyle,
    states: withRefs(states, inner),
    devices: withRefs(devices, inner),
  };
  // W-959: an element's or class's own style carries `wide`, the Wide screen record.
  const wide = toJson(WideStyle);
  const own = toJson(OwnStyle);
  defs["wideStyle"] = wide;
  defs["ownStyle"] = withRefs(own, new Map([[JSON.stringify(wide), "wideStyle"]]));
  const shared = new Map([
    ...inner,
    [JSON.stringify(own), "ownStyle"],
    [JSON.stringify(wide), "wideStyle"],
    [JSON.stringify(states), "states"],
    [JSON.stringify(devices), "devices"],
  ]);
  return { defs, shared };
}

function nodeDefs(): { defs: Json; types: string[] } {
  const { defs, shared } = styleDefs();
  const types: string[] = [];
  for (const schema of KNOWN_NODE_SCHEMAS) {
    const shape = (schema as unknown as { shape: Record<string, z.ZodType> }).shape;
    const type = (shape["type"] as unknown as { value: string }).value;
    types.push(type);
    const json = withRefs(toJson(schema as unknown as z.ZodType), shared) as Json;
    const properties = json["properties"] as Json | undefined;
    if (properties && "children" in properties) {
      properties["children"] = { type: "array", items: { $ref: "#/$defs/node" } };
    }
    defs[`node:${type}`] = json;
  }
  defs["node"] = {
    description: "One element. An element type this version does not know is kept (D-065).",
    anyOf: types.map((type) => ({ $ref: `#/$defs/node:${type}` })),
  };
  return { defs, types };
}

/** JSON Schema of a stored layout, for `emvb://schema/layout` (W-467) and docs/schema. */
export const layoutJsonSchema = (): Json => {
  const { defs } = nodeDefs();
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: `EmVB layout (schema ${LAYOUT_SCHEMA_VERSION}, contract ${CONTRACT_VERSION})`,
    $comment: NOTE,
    type: "object",
    properties: {
      schemaVersion: { type: "number", const: LAYOUT_SCHEMA_VERSION },
      root: { $ref: "#/$defs/node:container" },
    },
    required: ["schemaVersion", "root"],
    additionalProperties: false,
    $defs: defs,
  };
};

/** JSON Schema of the design system (site styles), for `emvb://schema/design`. */
export const designJsonSchema = (): Json => {
  const { defs, shared } = styleDefs();
  const body = withRefs(toJson(DesignSystem), shared) as Json;
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: `EmVB design system (schema ${DESIGN_SCHEMA_VERSION}, contract ${CONTRACT_VERSION})`,
    $comment: NOTE,
    ...body,
    $defs: defs,
  };
};
