import { PAGES_COLLECTION, THEME_PARTS_COLLECTION } from "../../constants.ts";
import { ApiError, requestJson, type Fetcher } from "../api.ts";
import { planSetup, type CollectionState, type SetupStep } from "./plan.ts";

const BASE = "/_emdash/api/schema/collections";

export async function readCollection(
  fetcher: Fetcher,
  slug: string,
): Promise<CollectionState | null> {
  try {
    const data = await requestJson<{ item: CollectionState }>(
      fetcher,
      `${BASE}/${slug}?includeFields=true`,
    );
    return data.item;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

function applyStep(fetcher: Fetcher, step: SetupStep) {
  switch (step.kind) {
    case "create-collection":
      return requestJson(fetcher, BASE, { method: "POST", body: step.body });
    case "update-collection":
      return requestJson(fetcher, `${BASE}/${step.collection}`, {
        method: "PUT",
        body: step.body,
      });
    case "create-field":
      return requestJson(fetcher, `${BASE}/${step.collection}/fields`, {
        method: "POST",
        body: step.body,
      });
    case "update-field":
      return requestJson(fetcher, `${BASE}/${step.collection}/fields/${step.slug}`, {
        method: "PUT",
        body: step.body,
      });
  }
}

/** Runs "Set up / Upgrade EmVB" through EmDash's schema API as the signed-in admin (schema:manage). */
export async function runSetup(
  fetcher: Fetcher,
): Promise<{ applied: SetupStep[]; conflicts: string[] }> {
  const [pages, themeParts] = await Promise.all([
    readCollection(fetcher, PAGES_COLLECTION),
    readCollection(fetcher, THEME_PARTS_COLLECTION),
  ]);
  const { steps, conflicts } = planSetup(pages, themeParts);
  if (conflicts.length > 0) return { applied: [], conflicts };
  // Steps depend on each other (fields need the collection), so they run in order.
  await steps.reduce<Promise<unknown>>(
    (prev, step) => prev.then(() => applyStep(fetcher, step)),
    Promise.resolve(),
  );
  return { applied: steps, conflicts };
}
