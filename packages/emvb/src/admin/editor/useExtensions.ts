import * as React from "react";
import { PLUGIN_ID } from "../../constants.ts";
import type { ExtensionManifest } from "../../core/index.ts";
import { requestJson, type Fetcher } from "../api.ts";
import { setAdminExtensionManifests } from "./extension-manifests.ts";

/**
 * W-927: extension manifests from `emvb({ extensions })`, via the plugin's editor/config route.
 * Empty while loading and when the route fails or no extensions are registered.
 */
export function useExtensionManifests(fetcher: Fetcher): readonly ExtensionManifest[] {
  const [loaded, setLoaded] = React.useState<readonly ExtensionManifest[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    void requestJson<{ extensions?: unknown }>(
      fetcher,
      `/_emdash/api/plugins/${PLUGIN_ID}/editor/config`,
    )
      .then((body) => {
        if (cancelled) return;
        const list = Array.isArray(body?.extensions) ? body.extensions : [];
        const ok: ExtensionManifest[] = [];
        for (const item of list) {
          if (!item || typeof item !== "object") continue;
          const m = item as ExtensionManifest;
          if (m.extensionApi !== 1 || typeof m.id !== "string") continue;
          ok.push(m);
        }
        setAdminExtensionManifests(ok);
        setLoaded(ok);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fetcher]);
  return loaded;
}

/** Flat list of element manifests for Add panel and inspector. */
export function extensionElementManifests(
  extensions: readonly ExtensionManifest[],
): ExtensionManifest["elements"][number][] {
  return extensions.flatMap((ext) => [...ext.elements]);
}
