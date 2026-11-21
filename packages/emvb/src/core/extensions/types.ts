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

/**
 * W-1086: a node an extension's render() returns. Built-in node fields, plus `extClasses`: class
 * names from the extension's own `classes.allow` list. Names not on the list are dropped. This is
 * render output only; it is never stored in a layout.
 */
export type ExtensionOutputNode = LayoutNode & { extClasses?: readonly string[] };

/**
 * W-1086: the static class allowlist an extension declares. Every name starts with `prefix`
 * (lowercase letters, digits and hyphens, ending in `-`, never `emvb…`), so extension classes
 * can't clash with EmVB's `emvb-*` classes or a site's own design classes.
 */
export type ExtensionClasses = {
  prefix: string;
  allow: readonly string[];
};

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
  ) => ExtensionOutputNode | readonly ExtensionOutputNode[];
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
  /**
   * W-1086: the module that exports this extension, as `import.meta.url`. EmVB bundles it into
   * the site's server build (Cloudflare Workers and production builds included), and resolves
   * `css` and `runtime` against it at build time.
   */
  module?: string;
  /** W-1086: class names render() may put on its nodes through `extClasses`. */
  classes?: ExtensionClasses;
  /**
   * W-1086: a stylesheet in the extension's own package, relative to `module` (`"./hello.css"`).
   * Read once at build time; written on pages (and in the editor canvas) that render one of the
   * extension's elements.
   */
  css?: string;
  /**
   * W-1086: a self-contained browser script in the extension's own package, relative to
   * `module` (`"./runtime.js"`): no `import` or `export`. Read once at build time; loaded only on
   * public pages that render one of the extension's elements, never in the admin.
   */
  runtime?: string;
};

/** W-1086: the file contents EmVB read at build time for `css` and `runtime`. */
export type ExtensionAssets = {
  css?: string;
  runtime?: string;
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
  /** W-1086: the checked class allowlist; absent when the extension declares none. */
  classes?: ExtensionClasses;
  /** W-1086: stylesheet and runtime text read at build time; absent when there are none. */
  assets?: ExtensionAssets;
};
