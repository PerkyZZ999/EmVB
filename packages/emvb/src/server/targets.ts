import type { PluginContext, RouteContext } from "emdash";
import type { z } from "zod";
import { PAGES_COLLECTION, THEME_PARTS_COLLECTION } from "../constants.ts";
import type { ProposalTarget } from "../core/proposals.ts";
import { canvasFieldSlugs } from "./hooks.ts";

/**
 * S-09 (W-998): a request or an editor presence may name only an entry that exists in an EmVB
 * collection or in a collection with an emvb:canvas field. Routes took any slug and id, so junk
 * targets filled storage and hid real requests.
 */
export async function isEmvbTarget(
  ctx: RouteContext<unknown>,
  target: z.infer<typeof ProposalTarget>,
): Promise<boolean> {
  const owned =
    target.collection === PAGES_COLLECTION || target.collection === THEME_PARTS_COLLECTION;
  if (!owned) {
    const slugs = await canvasFieldSlugs(ctx as unknown as PluginContext, target.collection).catch(
      () => [],
    );
    if (slugs.length === 0) return false;
  }
  const found = await ctx.content?.get(target.collection, target.id).catch(() => null);
  return Boolean(found);
}
