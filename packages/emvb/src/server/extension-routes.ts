import type { PluginRoute } from "emdash";
import { z } from "zod";
import {
  extensionOutputKey,
  isExtensionType,
  liveExtensionOutput,
  withExtensionClasses,
} from "../core/extensions/index.ts";

/** Elements one request may render: a page's worth (the admin batches the rest). */
const MAX_EXTENSION_RENDERS = 100;

const RenderInput = z.object({
  nodes: z
    .array(
      z.object({
        type: z.string().max(200),
        props: z.record(z.string(), z.unknown()).optional(),
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
