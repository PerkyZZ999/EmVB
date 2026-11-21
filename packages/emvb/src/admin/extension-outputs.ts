import * as React from "react";
import { PLUGIN_ID } from "../constants.ts";
import {
  extensionOutputKey,
  isExtensionType,
  rememberExtensionManifests,
  type ExtensionManifest,
} from "../core/index.ts";
import { requestJson, type Fetcher } from "./api.ts";

/** The server renders at most this many extension elements per request (extension-routes.ts). */
const BATCH = 100;
/** Different extension elements the admin asks about for one page or export. */
const MAX_ELEMENTS = 1000;

type ExtNode = { type: string; props?: Record<string, unknown> };

/**
 * W-1086: every extension element in some layouts (stored layouts may arrive as JSON text), one
 * per type and props, in the order found.
 */
export function extensionNodesIn(layouts: readonly unknown[]): ExtNode[] {
  const found = new Map<string, ExtNode>();
  const walk = (value: unknown, depth: number) => {
    if (found.size >= MAX_ELEMENTS || depth > 64 || !value || typeof value !== "object") return;
    const node = value as { type?: unknown; props?: unknown; children?: unknown; root?: unknown };
    if (node.root) walk(node.root, depth + 1);
    if (typeof node.type === "string" && isExtensionType(node.type)) {
      const props =
        node.props && typeof node.props === "object" && !Array.isArray(node.props)
          ? (node.props as Record<string, unknown>)
          : undefined;
      const ext = { type: node.type, ...(props ? { props } : {}) };
      found.set(extensionOutputKey(ext), ext);
    }
    if (Array.isArray(node.children)) for (const child of node.children) walk(child, depth + 1);
  };
  for (const layout of layouts) {
    let value = layout;
    if (typeof value === "string") {
      try {
        value = JSON.parse(value) as unknown;
      } catch {
        continue;
      }
    }
    walk(value, 0);
  }
  return [...found.values()];
}

/**
 * W-1086: the server-rendered output of each extension element, by `extensionOutputKey`. A
 * failed request leaves its elements out (they show the placeholder).
 */
export async function fetchExtensionOutputs(
  fetcher: Fetcher,
  nodes: readonly ExtNode[],
): Promise<Map<string, unknown>> {
  const outputs = new Map<string, unknown>();
  for (let start = 0; start < nodes.length; start += BATCH) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- batches, one request at a time
      const body = await requestJson<{ outputs?: { key?: unknown; nodes?: unknown }[] }>(
        fetcher,
        `/_emdash/api/plugins/${PLUGIN_ID}/editor/extensions/render`,
        { method: "POST", body: { nodes: nodes.slice(start, start + BATCH) } },
      );
      for (const item of body?.outputs ?? []) {
        if (typeof item.key === "string" && Array.isArray(item.nodes)) {
          outputs.set(item.key, item.nodes);
        }
      }
    } catch {
      // Leave this batch out.
    }
  }
  return outputs;
}

/**
 * W-1086: the site's extension manifests from editor/config, remembered so the admin's renderer
 * has their class allowlists, stylesheets and runtimes (for the HTML export).
 */
export async function loadExtensionManifests(fetcher: Fetcher): Promise<ExtensionManifest[]> {
  try {
    const body = await requestJson<{ extensions?: unknown }>(
      fetcher,
      `/_emdash/api/plugins/${PLUGIN_ID}/editor/config`,
    );
    const list = Array.isArray(body?.extensions) ? body.extensions : [];
    rememberExtensionManifests(list);
    return list.filter(
      (m): m is ExtensionManifest =>
        !!m &&
        typeof m === "object" &&
        (m as ExtensionManifest).extensionApi === 1 &&
        typeof (m as ExtensionManifest).id === "string",
    );
  } catch {
    return [];
  }
}

/**
 * W-1086: extension outputs for the editor canvas. Asks the server for elements it hasn't seen
 * (a new element, or edited props) and keeps earlier answers.
 */
export function useExtensionOutputs(
  layout: unknown,
  fetcher: Fetcher,
): ReadonlyMap<string, unknown> {
  const nodes = layout ? extensionNodesIn([layout]) : [];
  const key = nodes.map(extensionOutputKey).join("\u0000");
  const [outputs, setOutputs] = React.useState<ReadonlyMap<string, unknown>>(() => new Map());
  const asked = React.useRef(new Set<string>());
  React.useEffect(() => {
    if (!key) return;
    const seen = asked.current;
    const wanted = nodes.filter((node) => !seen.has(extensionOutputKey(node)));
    if (wanted.length === 0) return;
    for (const node of wanted) seen.add(extensionOutputKey(node));
    let cancelled = false;
    let settled = false;
    void fetchExtensionOutputs(fetcher, wanted).then((found) => {
      settled = true;
      if (cancelled || found.size === 0) return;
      setOutputs((current) => new Map([...current, ...found]));
    });
    return () => {
      cancelled = true;
      // A request cut short may be asked again on the next change.
      if (!settled) for (const node of wanted) seen.delete(extensionOutputKey(node));
    };
    // `key` stands for `nodes`.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fetcher]);
  return outputs;
}
