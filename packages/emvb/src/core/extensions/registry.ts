/**
 * Process-wide live extension registry (W-927).
 *
 * EmDash JSON.stringifies `emvb()` options before calling `createPlugin`, so render
 * and resolve functions cannot travel in `options`. `emvb()` stores the live objects
 * here (on `globalThis`, so Vite SSR module duplication still sees them); createPlugin
 * and the renderer look them up by id.
 */

import { clearSlotRules, setSlotRules } from "./slot-rules.ts";
import { cleanExtensionAssets, normalizeClasses } from "./classes.ts";
import { normalizeExtension } from "./normalize.ts";
import type { EmVBExtension, ExtensionAssets, ExtensionManifest } from "./types.ts";

const KEY = Symbol.for("emvb.extensions.v1");

type Store = {
  byId: Map<string, EmVBExtension>;
  manifests: ExtensionManifest[];
  /** W-1086: stylesheet and runtime text read at build time, by extension id. */
  assets?: Map<string, ExtensionAssets>;
  /** W-1086: each extension's class allowlist as a set, by extension id. */
  allow?: Map<string, ReadonlySet<string>>;
};

function store(): Store {
  const g = globalThis as typeof globalThis & { [KEY]?: Store };
  if (!g[KEY]) g[KEY] = { byId: new Map(), manifests: [] };
  return g[KEY];
}

function assetsMap(): Map<string, ExtensionAssets> {
  const s = store();
  s.assets ??= new Map();
  return s.assets;
}

function allowMap(): Map<string, ReadonlySet<string>> {
  const s = store();
  s.allow ??= new Map();
  return s.allow;
}

function rememberManifest(manifest: ExtensionManifest): void {
  const s = store();
  s.manifests = s.manifests.filter((m) => m.id !== manifest.id);
  s.manifests.push(manifest);
  setSlotRules(s.manifests.flatMap((m) => m.elements));
  if (manifest.classes) allowMap().set(manifest.id, new Set(manifest.classes.allow));
  else allowMap().delete(manifest.id);
}

/** Register live extensions from `emvb({ extensions })`. Returns serializable manifests. */
export function rememberExtensions(input: unknown): ExtensionManifest[] {
  const list = Array.isArray(input) ? input : [];
  const manifests: ExtensionManifest[] = [];
  const s = store();
  for (const item of list) {
    const normalized = normalizeExtension(item);
    if (!normalized) continue;
    s.byId.set(normalized.live.id, normalized.live);
    // Replace an existing manifest for the same id (re-import / HMR).
    rememberManifest(normalized.manifest);
    manifests.push(normalized.manifest);
  }
  return manifests;
}

/**
 * W-1086: called by the server entry the integration generates (extension-build.ts). Each pair is
 * an extension module's namespace and the extension id it exports; the export whose
 * `extensionApi` and `id` match is registered, so render functions reach Workers and production
 * builds, where astro.config never runs.
 */
export function registerBundledExtensions(entries: readonly (readonly [unknown, string])[]): void {
  const found: unknown[] = [];
  for (const [namespace, id] of entries) {
    if (!namespace || typeof namespace !== "object") continue;
    const match = Object.values(namespace).find(
      (value) =>
        !!value &&
        typeof value === "object" &&
        (value as { extensionApi?: unknown }).extensionApi === 1 &&
        (value as { id?: unknown }).id === id,
    );
    if (match) found.push(match);
  }
  rememberExtensions(found);
}

/**
 * W-1086: keep the build-time stylesheet and runtime text of extension `id`. Text that fails the
 * checks in classes.ts is dropped.
 */
export function rememberExtensionAssets(id: string, assets: unknown): void {
  const clean = cleanExtensionAssets(assets);
  if (clean) assetsMap().set(id, clean);
  else assetsMap().delete(id);
}

/** W-1086: the build-time stylesheet and runtime text of extension `id`, if any. */
export function extensionAssets(id: string): ExtensionAssets | undefined {
  return store().assets?.get(id);
}

/**
 * W-1086: the stylesheets of extensions `ids` (each once, by id), as one sheet. Pages and theme
 * parts that render apart (`renderPage` with `separateExtensionCss`) collect the ids they used
 * and write this once per document.
 */
export function extensionStylesheets(ids: Iterable<string>): string {
  return [...new Set(ids)]
    .toSorted()
    .flatMap((id) => {
      const css = extensionAssets(id)?.css;
      return css ? [`/* ${id} */\n${css}\n`] : [];
    })
    .join("");
}

/** W-1086: the class allowlist of extension `id` (empty when it declares none). */
export function extensionClassAllowlist(id: string): ReadonlySet<string> | undefined {
  return store().allow?.get(id);
}

/**
 * W-1086: the admin has manifests (from editor/config) but no live extension code. Remembering
 * them gives the editor canvas and the HTML export the class allowlists and assets.
 */
export function rememberExtensionManifests(input: readonly unknown[]): void {
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const m = item as ExtensionManifest;
    if (m.extensionApi !== 1 || typeof m.id !== "string" || !Array.isArray(m.elements)) continue;
    const classes = normalizeClasses(m.classes);
    const { assets, ...rest } = m;
    rememberManifest({ ...rest, ...(classes ? { classes } : {}) });
    rememberExtensionAssets(m.id, assets);
  }
}

/** Manifests currently remembered (for editor/config), with their build-time assets. */
export function listedExtensionManifests(): ExtensionManifest[] {
  return store().manifests.map((m) => {
    const assets = extensionAssets(m.id);
    return assets ? Object.assign({}, m, { assets }) : m;
  });
}

/** Live extension by package id. */
export function liveExtension(id: string): EmVBExtension | undefined {
  return store().byId.get(id);
}

/** Live element by stored type `ext:pkg/name`. */
export function liveElement(type: string):
  | {
      extension: EmVBExtension;
      element: NonNullable<EmVBExtension["elements"]>[number];
      manifest: ExtensionManifest["elements"][number];
    }
  | undefined {
  const manifests = store().manifests;
  for (const manifest of manifests) {
    const elManifest = manifest.elements.find((e) => e.type === type);
    if (!elManifest) continue;
    const extension = store().byId.get(manifest.id);
    const element = extension?.elements?.find((e) => e.name === elManifest.name);
    if (!extension || !element) continue;
    return { extension, element, manifest: elManifest };
  }
  return undefined;
}

/** Test helper: drop every registered extension. */
export function clearExtensions(): void {
  const s = store();
  s.byId.clear();
  s.manifests = [];
  clearSlotRules();
  s.assets?.clear();
  s.allow?.clear();
}

/** Rebuild manifests from options.extensions after createPlugin (ids only or full manifests). */
export function manifestsFromOptions(input: unknown): ExtensionManifest[] {
  if (!Array.isArray(input)) return listedExtensionManifests();
  // W-1086: the integration read `css` and `runtime` at build time and passed their text in the
  // serialized options; a Workers or production server has no files to read them from.
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const { id, assets } = item as { id?: unknown; assets?: unknown };
    if (typeof id === "string" && assets !== undefined) rememberExtensionAssets(id, assets);
  }
  // W-1086: a Worker or production server has live code only for the extensions the generated
  // entry bundled (those that name their `module`). Every other extension still has its serialized
  // manifest, so merge by id: the live manifest wins, the serialized one fills the gaps.
  const live = new Map(listedExtensionManifests().map((m) => [m.id, m]));
  const out: ExtensionManifest[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const m = item as ExtensionManifest;
    if (m.extensionApi !== 1 || typeof m.id !== "string" || !Array.isArray(m.elements)) continue;
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const own = live.get(m.id);
    if (own) {
      out.push(own);
      continue;
    }
    const { assets: _assets, ...rest } = m;
    const classes = normalizeClasses(m.classes);
    const manifest = { ...rest, ...(classes ? { classes } : {}) };
    if (classes) allowMap().set(m.id, new Set(classes.allow));
    const assets = extensionAssets(m.id);
    out.push(assets ? { ...manifest, assets } : manifest);
  }
  for (const [id, manifest] of live) if (!seen.has(id)) out.push(manifest);
  return out;
}
