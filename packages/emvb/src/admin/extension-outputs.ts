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
 * failed request leaves its elements out (they show the placeholder). `answered`, when given,
 * collects the key of every element the server answered, including those with no output.
 */
export async function fetchExtensionOutputs(
  fetcher: Fetcher,
  nodes: readonly ExtNode[],
  answered?: Set<string>,
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
        if (typeof item.key !== "string") continue;
        answered?.add(item.key);
        if (Array.isArray(item.nodes)) outputs.set(item.key, item.nodes);
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

/** Prop edits come one keystroke at a time; the canvas asks once they pause. */
export const EXTENSION_OUTPUTS_DEBOUNCE_MS = 300;
/** After a failed request the canvas asks again this much later, a few times in a row at most. */
export const EXTENSION_OUTPUTS_RETRY_MS = 1000;
const MAX_RETRIES = 3;

/**
 * W-1086: extension outputs for the editor canvas. Once edits pause, asks the server for elements
 * it hasn't answered (a new element, or edited props), keeps earlier answers for elements still
 * on the page and drops the rest. Elements of a failed request are asked again a little later
 * (a few times) and on the next change.
 */
export function useExtensionOutputs(
  layout: unknown,
  fetcher: Fetcher,
): ReadonlyMap<string, unknown> {
  const nodes = layout ? extensionNodesIn([layout]) : [];
  const key = nodes.map(extensionOutputKey).join("\u0000");
  const [outputs, setOutputs] = React.useState<ReadonlyMap<string, unknown>>(() => new Map());
  const asked = React.useRef(new Set<string>());
  const onPage = React.useRef(new Set<string>());
  const mounted = React.useRef(true);
  // Bumped to ask again after a failed request; `failures` counts them in a row.
  const [retry, setRetry] = React.useState(0);
  const failures = React.useRef(0);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  React.useEffect(() => {
    const current = new Set(nodes.map(extensionOutputKey));
    onPage.current = current;
    const seen = asked.current;
    // Outputs of elements no longer on the page are dropped (and asked again if they come back).
    for (const seenKey of seen) if (!current.has(seenKey)) seen.delete(seenKey);
    setOutputs((previous) => {
      if ([...previous.keys()].every((k) => current.has(k))) return previous;
      return new Map([...previous].filter(([k]) => current.has(k)));
    });
    if (current.size === 0) return;
    const timer = setTimeout(() => {
      const wanted = nodes.filter((node) => !seen.has(extensionOutputKey(node)));
      if (wanted.length === 0) return;
      for (const node of wanted) seen.add(extensionOutputKey(node));
      const answered = new Set<string>();
      void fetchExtensionOutputs(fetcher, wanted, answered).then((found) => {
        // A failed batch: its elements are asked again later and on the next change.
        let failed = false;
        for (const node of wanted) {
          const wantedKey = extensionOutputKey(node);
          if (answered.has(wantedKey)) continue;
          seen.delete(wantedKey);
          failed = true;
        }
        failures.current = failed ? failures.current + 1 : 0;
        if (failed && failures.current <= MAX_RETRIES) {
          setTimeout(() => {
            if (mounted.current) setRetry((n) => n + 1);
          }, EXTENSION_OUTPUTS_RETRY_MS * failures.current);
        }
        const keep = [...found].filter(([k]) => onPage.current.has(k));
        if (!mounted.current || keep.length === 0) return;
        setOutputs((previous) => new Map([...previous, ...keep]));
      });
    }, EXTENSION_OUTPUTS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `key` stands for `nodes`.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fetcher, retry]);
  return outputs;
}

/** W-1088: values of the sources extension panels name, by source id (`ext:<package>/<name>`). */
export type ExtensionSourceValues = ReadonlyMap<string, Readonly<Record<string, string>> | null>;

/**
 * W-1088 (#36): asks the server for the values of every source an extension panel names. Values
 * are plain strings (cleaned on the server); anything else in the answer is dropped. `null` for a
 * source the server couldn't read; the whole map is empty when the request fails.
 */
export async function fetchExtensionSourceValues(fetcher: Fetcher): Promise<ExtensionSourceValues> {
  const out = new Map<string, Readonly<Record<string, string>> | null>();
  try {
    const body = await requestJson<{ sources?: { id?: unknown; values?: unknown }[] }>(
      fetcher,
      `/_emdash/api/plugins/${PLUGIN_ID}/editor/extensions/sources`,
    );
    for (const item of Array.isArray(body?.sources) ? body.sources : []) {
      if (typeof item?.id !== "string") continue;
      const raw = item.values;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        out.set(item.id, null);
        continue;
      }
      const values: Record<string, string> = {};
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof value === "string") values[key] = value;
      }
      out.set(item.id, values);
    }
  } catch {
    // The panels say the values couldn't be loaded.
  }
  return out;
}

/**
 * W-1088 (#36): source values for the extension panels, loaded once the site's manifests are in
 * when a panel names a source. Undefined while loading (or when no panel names one).
 */
export function useExtensionSourceValues(
  fetcher: Fetcher,
  manifests: readonly ExtensionManifest[],
): ExtensionSourceValues | undefined {
  const wanted = manifests.some((m) => m.panels?.some((panel) => panel.source));
  const [values, setValues] = React.useState<ExtensionSourceValues | undefined>(undefined);
  React.useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    void fetchExtensionSourceValues(fetcher).then((found) => {
      if (!cancelled) setValues(found);
    });
    return () => {
      cancelled = true;
    };
  }, [fetcher, wanted]);
  return values;
}
