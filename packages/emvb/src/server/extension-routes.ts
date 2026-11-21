import type { PluginRoute } from "emdash";
import { z } from "zod";
import {
  extensionOutputKey,
  isExtensionType,
  liveExtensionOutput,
  resolveExtensionSource,
  withExtensionClasses,
  type ExtensionManifest,
} from "../core/extensions/index.ts";
import { MAX_DEPTH, MAX_LAYOUT_BYTES } from "../core/limits.ts";

/** Elements one request may render: a page's worth (the admin batches the rest). */
const MAX_EXTENSION_RENDERS = 100;
/** Props deeper or larger than any stored layout holds are refused before they are keyed. */
const MAX_PROPS_DEPTH = MAX_DEPTH;
const MAX_PROPS_BYTES = MAX_LAYOUT_BYTES;

/** True when `value` nests at most `MAX_PROPS_DEPTH` levels; walked without recursion. */
function shallowEnough(value: unknown): boolean {
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  while (stack.length > 0) {
    const item = stack.pop() as { value: unknown; depth: number };
    if (!item.value || typeof item.value !== "object") continue;
    if (item.depth >= MAX_PROPS_DEPTH) return false;
    for (const child of Object.values(item.value))
      stack.push({ value: child, depth: item.depth + 1 });
  }
  return true;
}

/**
 * W-1086: `extensionOutputKey` serializes props recursively, so props from the request are
 * bounded first: depth (the check above), then size.
 */
const boundedProps = z
  .record(z.string(), z.unknown())
  // `abort`: the size check below would serialize props that are too deep.
  .refine(shallowEnough, {
    message: `props nest deeper than ${MAX_PROPS_DEPTH} levels`,
    abort: true,
  })
  .refine((props) => new TextEncoder().encode(JSON.stringify(props)).length <= MAX_PROPS_BYTES, {
    message: `props are larger than ${MAX_PROPS_BYTES / 1024} KB`,
  });

const RenderInput = z.object({
  nodes: z
    .array(
      z.object({
        type: z.string().max(200),
        props: boundedProps.optional(),
      }),
    )
    .max(MAX_EXTENSION_RENDERS),
});

/**
 * W-1086: the admin has no extension code, so the editor canvas and the HTML export ask here for
 * the output of each extension element (by type and props). The output is the same checked node
 * tree the public page renders, with its allowlisted classes in `extClasses`; the admin checks it
 * again. `nodes: null` when the extension is missing, render throws or nothing legal is left.
 */
export const extensionRenderRoute: PluginRoute<z.infer<typeof RenderInput>> = {
  permission: "content:edit_any",
  input: RenderInput,
  handler: async (ctx) => ({
    outputs: ctx.input.nodes.map((node) => {
      const key = extensionOutputKey(node);
      if (!isExtensionType(node.type)) return { key, nodes: null };
      const nodes = liveExtensionOutput(node);
      return { key, nodes: nodes ? withExtensionClasses(nodes) : null };
    }),
  }),
};

/** One source's values for the editor's panels; `values: null` when it can't be read here. */
type ExtensionSourceValues = { id: string; values: Record<string, string> | null };

/**
 * W-1088 (#36): the values of every source an extension panel names, for the editor's left panel,
 * which lists them read-only. Sources are read-only resolvers; their values are cleaned like bound
 * values. `values: null` when the source's code isn't in this server (an extension without
 * `module` on Workers or a production build), it throws, or it doesn't answer in time.
 */
export function extensionSourcesRoute(manifests: readonly ExtensionManifest[]): PluginRoute {
  return {
    permission: "content:edit_any",
    handler: async () => {
      const wanted = new Map<string, { pkg: string; name: string }>();
      for (const manifest of manifests) {
        for (const panel of manifest.panels) {
          if (!panel.source) continue;
          if (!manifest.sources.some((source) => source.name === panel.source)) continue;
          wanted.set(`ext:${manifest.id}/${panel.source}`, {
            pkg: manifest.id,
            name: panel.source,
          });
        }
      }
      const sources: ExtensionSourceValues[] = await Promise.all(
        [...wanted].map(async ([id, { pkg, name }]) => ({
          id,
          values: (await resolveExtensionSource(pkg, name)) ?? null,
        })),
      );
      return { sources };
    },
  };
}
