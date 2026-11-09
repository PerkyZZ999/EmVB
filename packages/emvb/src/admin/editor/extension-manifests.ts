import type { ExtensionManifest } from "../../core/index.ts";

/** Admin-side cache of manifests from editor/config (no render functions). */
let cache: readonly ExtensionManifest[] = [];

export function setAdminExtensionManifests(manifests: readonly ExtensionManifest[]): void {
  cache = manifests;
}

export function adminExtensionDefaults(type: string): Record<string, unknown> | undefined {
  for (const ext of cache) {
    const el = ext.elements.find((e) => e.type === type);
    if (el) return { ...el.defaults };
  }
  return undefined;
}
