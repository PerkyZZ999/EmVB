import {
  listedExtensionManifests,
  liveElement,
  validateExtensionProps,
  type ExtensionPropSchema,
} from "../core/index.ts";
import { MAX_TEXT_LENGTH } from "../core/limits.ts";
import { McpToolError } from "./errors.ts";

/**
 * W-1089 (#38): extension elements (`ext:<pkg>/<name>`) for agents' direct tools. Only elements
 * whose extension is registered on this site are listed or accepted, and their props are checked
 * by the extension's own schema: invalid props are refused, never replaced by defaults.
 */

/** The registered extension elements, as their manifests describe them. */
export function registeredExtensionElements() {
  return listedExtensionManifests().flatMap((manifest) =>
    manifest.elements
      .filter((element) => liveElement(element.type) !== undefined)
      .map((element) => Object.assign({ extensionId: manifest.id }, element)),
  );
}

const withDefault = (out: Record<string, unknown>, value: unknown) =>
  value === undefined ? out : Object.assign(out, { default: value });

/** JSON Schema for an extension's declarative prop schema, with EmVB's caps (as schema.ts). */
export function extensionJsonSchema(schema: ExtensionPropSchema): Record<string, unknown> {
  switch (schema.type) {
    case "string":
      return withDefault(
        {
          type: "string",
          maxLength: Math.min(schema.maxLength ?? MAX_TEXT_LENGTH, MAX_TEXT_LENGTH),
          ...(schema.minLength ? { minLength: schema.minLength } : {}),
        },
        schema.default,
      );
    case "number":
      return withDefault(
        {
          type: schema.integer ? "integer" : "number",
          ...(schema.min !== undefined ? { minimum: schema.min } : {}),
          ...(schema.max !== undefined ? { maximum: schema.max } : {}),
        },
        schema.default,
      );
    case "boolean":
      return withDefault({ type: "boolean" }, schema.default);
    case "enum":
      return withDefault({ type: "string", enum: [...schema.values] }, schema.default);
    case "array":
      return withDefault(
        {
          type: "array",
          items: extensionJsonSchema(schema.items),
          maxItems: Math.min(schema.maxItems ?? 32, 32),
        },
        schema.default,
      );
    case "object":
      return {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(schema.properties).map(([key, prop]) => [key, extensionJsonSchema(prop)]),
        ),
        ...(schema.required?.length ? { required: [...schema.required] } : {}),
        additionalProperties: false,
      };
    default:
      return {};
  }
}

/** What a prop must be, in words, for a refusal. */
function expected(schema: ExtensionPropSchema): string {
  switch (schema.type) {
    case "string":
      return `text of at most ${Math.min(schema.maxLength ?? MAX_TEXT_LENGTH, MAX_TEXT_LENGTH)} characters${schema.minLength ? ` and at least ${schema.minLength}` : ""}`;
    case "number":
      return `${schema.integer ? "a whole number" : "a number"}${schema.min !== undefined ? ` from ${schema.min}` : ""}${schema.max !== undefined ? ` up to ${schema.max}` : ""}`;
    case "boolean":
      return "true or false";
    case "enum":
      return `one of ${schema.values.join(", ")}`;
    case "array":
      return `a list of at most ${Math.min(schema.maxItems ?? 32, 32)} items`;
    default:
      return "an object";
  }
}

/** Each prop that breaks the schema, in words. */
function propIssues(schema: ExtensionPropSchema, props: Record<string, unknown>): string[] {
  if (schema.type !== "object") return ["its props don't match its schema"];
  const issues: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    const prop = schema.properties[key];
    if (!prop) {
      issues.push(`${key} isn't one of its props (${Object.keys(schema.properties).join(", ")})`);
    } else if (
      !validateExtensionProps({ type: "object", properties: { [key]: prop } }, { [key]: value }).ok
    ) {
      issues.push(`${key} must be ${expected(prop)}`);
    }
  }
  for (const key of schema.required ?? []) {
    const prop = schema.properties[key];
    if (props[key] === undefined && !(prop && "default" in prop && prop.default !== undefined))
      issues.push(`${key} is required`);
  }
  return issues;
}

/**
 * The props an extension element may store: checked by its schema, with the schema's defaults
 * for props left out. REFUSED when the extension isn't registered, INVALID_INPUT naming each
 * wrong prop otherwise.
 */
export function checkedExtensionProps(type: string, props: unknown): Record<string, unknown> {
  const live = liveElement(type);
  if (!live) {
    throw new McpToolError(
      "REFUSED",
      `Unknown element type ${type}: no extension on this site provides it. Call list_element_types.`,
    );
  }
  const given = props && typeof props === "object" && !Array.isArray(props) ? props : {};
  const result = validateExtensionProps(live.element.schema, given);
  if (result.ok) return result.props;
  const issues = propIssues(live.element.schema, given as Record<string, unknown>);
  throw new McpToolError(
    "INVALID_INPUT",
    `Invalid props for ${type}: ${(issues.length ? issues : ["they don't match its schema"]).join("; ")}. Call list_element_types with this type for its props.`,
    { issues },
  );
}
