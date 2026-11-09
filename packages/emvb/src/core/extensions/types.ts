/**
 * Extensions API v1 (W-927, D-066). Site owners register extensions through
 * `emvb({ extensions: [...] })` at build time. Stored data is namespaced
 * `ext:<pkg>/<name>`, validated, and render output goes through EmVB's sanitizer.
 *
 * Freeze rules match D-065: within extensionApi 1.x no key is removed, renamed or
 * changed in meaning; additions are optional; breaking changes wait for 2.0.
 */

import type { FieldDescriptor } from "../schema/descriptors.ts";
import type { LayoutNode } from "../schema/layout.ts";

/** Shipped API version. Same freeze rules as D-065 (see docs/EXTENSIONS.md). */
export const EXTENSION_API_VERSION = 1 as const;
export type ExtensionApiVersion = typeof EXTENSION_API_VERSION;

/**
 * Declarative prop schema EmVB compiles to Zod. Extensions must not hand us a
 * Zod instance (or any other code) as a "schema" — only this subset.
 */
export type ExtensionPropSchema =
  | {
      type: "string";
      maxLength?: number;
      minLength?: number;
      default?: string;
    }
  | {
      type: "number";
      min?: number;
      max?: number;
      integer?: boolean;
      default?: number;
    }
  | {
      type: "boolean";
      default?: boolean;
    }
  | {
      type: "enum";
      values: readonly string[];
      default?: string;
    }
  | {
      type: "array";
      items: ExtensionPropSchema;
      maxItems?: number;
      default?: readonly unknown[];
    }
  | {
      type: "object";
      properties: Readonly<Record<string, ExtensionPropSchema>>;
      required?: readonly string[];
    };

/** Inspector field: the same declarative kinds ElementDescriptor uses (W-021). */
export type ExtensionField = Pick<
  FieldDescriptor,
  "key" | "kind" | "label" | "options" | "message" | "optional" | "max" | "min"
>;

/** Context passed to an element render function (read-only source values). */
export type ExtensionRenderContext = {
  /** Resolved values from this extension's sources, keyed by source name then field. */
  sources: Readonly<Record<string, Readonly<Record<string, string>>>>;
};

/**
 * A custom element. `name` becomes the stored type `ext:<extension.id>/<name>`.
 * `render` returns EmVB layout nodes (built-in types only), never HTML strings.
 */
export type ExtensionElement = {
  name: string;
  label: string;
  /** Optional Add-panel group; defaults to "content". */
  group?: "layout" | "content" | "form" | "dynamic";
  schema: ExtensionPropSchema;
  fields: readonly ExtensionField[];
  defaults?: () => Record<string, unknown>;
  render: (
    props: Record<string, unknown>,
    ctx: ExtensionRenderContext,
  ) => LayoutNode | readonly LayoutNode[];
};

/**
 * Declarative editor panel. EmVB renders it in a Kumo slot with EmVB tokens.
 * Extensions may not inject global admin CSS (D-067).
 */
export type ExtensionPanel = {
  name: string;
  label: string;
  /** Short body shown in the slot (plain text; EmVB escapes it). */
  description?: string;
  /** Optional source name whose resolved fields are listed read-only in the panel. */
  source?: string;
};

/** What a read-only data source may return (W-927). */
export type ExtensionSourceCapability = "text" | "url" | "image";

/**
 * A read-only resolver. Results are treated as untrusted strings and run through
 * the same cleaning path bindings use before anything renders them.
 */
export type ExtensionSource = {
  name: string;
  label: string;
  capabilities: readonly ExtensionSourceCapability[];
  resolve: () => Readonly<Record<string, string>> | Promise<Readonly<Record<string, string>>>;
};

/** One extension package. `id` is the package name (unscoped), e.g. `emvb-ext-hello`. */
export type EmVBExtension = {
  extensionApi: ExtensionApiVersion;
  id: string;
  label?: string;
  elements?: readonly ExtensionElement[];
  panels?: readonly ExtensionPanel[];
  sources?: readonly ExtensionSource[];
};

/**
 * Serializable manifest sent to the admin through `editor/config` (no functions).
 * Live render/resolve functions stay in the process registry.
 */
export type ExtensionElementManifest = {
  type: string;
  name: string;
  label: string;
  group: "layout" | "content" | "form" | "dynamic";
  schema: ExtensionPropSchema;
  fields: readonly ExtensionField[];
  defaults: Record<string, unknown>;
};

export type ExtensionPanelManifest = {
  id: string;
  name: string;
  label: string;
  description?: string;
  source?: string;
};

export type ExtensionSourceManifest = {
  id: string;
  name: string;
  label: string;
  capabilities: readonly ExtensionSourceCapability[];
};

export type ExtensionManifest = {
  extensionApi: ExtensionApiVersion;
  id: string;
  label: string;
  elements: readonly ExtensionElementManifest[];
  panels: readonly ExtensionPanelManifest[];
  sources: readonly ExtensionSourceManifest[];
};
