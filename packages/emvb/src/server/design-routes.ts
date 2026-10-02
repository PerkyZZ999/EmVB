import { PluginRouteError, type PluginRoute, type RouteContext } from "emdash";
import { z } from "zod";
import {
  byteLength,
  emptyDesign,
  MAX_DESIGN_BYTES,
  summarizeIssues,
  validateDesign,
  type DesignSystem,
} from "../core/index.ts";
import { DESIGN_DRAFT_KEY, DESIGN_KEY } from "../constants.ts";

type DesignStore = {
  getVersioned(id: string): Promise<{ value: unknown; revision: string } | null>;
  compareAndSet(
    id: string,
    expectedRevision: string | null,
    data: unknown,
  ): Promise<{ applied: true; revision: string } | { applied: false }>;
};

const store = (ctx: RouteContext<unknown>) => ctx.storage["design"] as unknown as DesignStore;

type DesignResponse = {
  design: DesignSystem;
  revision: string | null;
  status: "ok" | "empty" | "unreadable";
};

const readDesign = async (ctx: RouteContext<unknown>, key: string): Promise<DesignResponse> => {
  const current = await store(ctx).getVersioned(key);
  if (!current) return { design: emptyDesign(), revision: null, status: "empty" };
  const result = validateDesign(current.value);
  if (result.ok) return { design: result.design, revision: current.revision, status: "ok" };
  ctx.log.error("emvb: stored design is unreadable", { code: result.issues[0]?.code });
  return { design: emptyDesign(), revision: current.revision, status: "unreadable" };
};

/** Public: the published design only. Drafts stay on `design/draft` (W-100). */
export const designRoute: PluginRoute = {
  public: true,
  handler: (ctx) => readDesign(ctx, DESIGN_KEY),
};

/** Editors and above. The working copy, or the published design when no draft exists yet. */
export const designDraftRoute: PluginRoute = {
  permission: "content:edit_any",
  handler: async (ctx) => {
    const published = await readDesign(ctx, DESIGN_KEY);
    const draft = await readDesign(ctx, DESIGN_DRAFT_KEY);
    if (draft.status !== "ok") {
      return {
        design: published.design,
        revision: null,
        publishedRevision: published.revision,
        unpublished: false,
      };
    }
    return {
      design: draft.design,
      revision: draft.revision,
      publishedRevision: published.revision,
      unpublished: JSON.stringify(draft.design) !== JSON.stringify(published.design),
    };
  },
};

const SaveInput = z.object({ design: z.unknown(), revision: z.string().nullable() });

/** Editors and above (D-020). Size is checked before CAS, which fails with a generic 500 above 1 MiB (S0-9). */
export const designSaveRoute: PluginRoute<z.infer<typeof SaveInput>> = {
  permission: "content:edit_any",
  input: SaveInput,
  handler: async (ctx) => {
    const bytes = byteLength(ctx.input.design);
    if (bytes > MAX_DESIGN_BYTES) {
      throw new PluginRouteError(
        "DESIGN_TOO_LARGE",
        `The design system is ${bytes} bytes; the limit is ${MAX_DESIGN_BYTES}.`,
        413,
      );
    }
    const result = validateDesign(ctx.input.design);
    if (!result.ok) {
      const summary = summarizeIssues(result.issues);
      throw new PluginRouteError("INVALID_DESIGN", `The design system is invalid. ${summary}`, 422);
    }
    const write = await store(ctx).compareAndSet(
      DESIGN_DRAFT_KEY,
      ctx.input.revision,
      result.design,
    );
    if (!write.applied) {
      throw PluginRouteError.conflict(
        "The design system was changed somewhere else. Reload it and try again.",
      );
    }
    return { revision: write.revision };
  },
};

const PublishInput = z.object({ publishedRevision: z.string().nullable() });

/** Copies the style draft onto the published design. Pages are not republished (W-100). */
export const designPublishRoute: PluginRoute<z.infer<typeof PublishInput>> = {
  permission: "content:edit_any",
  input: PublishInput,
  handler: async (ctx) => {
    const draft = await readDesign(ctx, DESIGN_DRAFT_KEY);
    if (draft.status !== "ok") {
      throw new PluginRouteError("NO_STYLE_DRAFT", "There are no style changes to publish.", 409);
    }
    const write = await store(ctx).compareAndSet(
      DESIGN_KEY,
      ctx.input.publishedRevision,
      draft.design,
    );
    if (!write.applied) {
      throw PluginRouteError.conflict(
        "Site styles were published somewhere else. Reload the editor and try again.",
      );
    }
    return { revision: write.revision };
  },
};
