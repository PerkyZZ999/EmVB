/**
 * Process-wide live extension registry (W-927).
 *
 * EmDash JSON.stringifies `emvb()` options before calling `createPlugin`, so render
 * and resolve functions cannot travel in `options`. `emvb()` stores the live objects
 * here (on `globalThis`, so Vite SSR module duplication still sees them); createPlugin
 * and the renderer look them up by id.
 */

import { normalizeExtension } from "./normalize.ts";
import type { EmVBExtension, ExtensionManifest } from "./types.ts";

const KEY = Symbol.for("emvb.extensions.v1");

type Store = {
  byId: Map<string, EmVBExtension>;
  manifests: ExtensionManifest[];
};

function store(): Store {
  const g = globalThis as typeof globalThis & { [KEY]?: Store };
  if (!g[KEY]) g[KEY] = { byId: new Map(), manifests: [] };
  return g[KEY];
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
    s.manifests = s.manifests.filter((m) => m.id !== normalized.manifest.id);
    s.manifests.push(normalized.manifest);
    manifests.push(normalized.manifest);
  }
  return manifests;
}

/** Manifests currently remembered (for editor/config). */
export function listedExtensionManifests(): ExtensionManifest[] {
  return store().manifests.slice();
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
}

/** Rebuild manifests from options.extensions after createPlugin (ids only or full manifests). */
export function manifestsFromOptions(input: unknown): ExtensionManifest[] {
  if (!Array.isArray(input)) return listedExtensionManifests();
  // Prefer live registry order; fall back to whatever was serialized.
  const live = listedExtensionManifests();
  if (live.length > 0) return live;
  const out: ExtensionManifest[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const m = item as ExtensionManifest;
    if (m.extensionApi !== 1 || typeof m.id !== "string") continue;
    out.push(m);
  }
  return out;
}
