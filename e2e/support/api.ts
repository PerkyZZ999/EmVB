import type { APIRequestContext } from "@playwright/test";

/** EmDash REST call as the signed-in admin (the storage-state cookies), with the CSRF header. */
export async function api(
  request: APIRequestContext,
  method: string,
  path: string,
  body?: unknown,
) {
  const response = await request.fetch(path, {
    method,
    headers: {
      "X-EmDash-Request": "1",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { data: JSON.stringify(body) }),
  });
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: response.status(), json };
}

export const schemaOf = async (request: APIRequestContext) =>
  (await api(request, "GET", "/_emdash/api/schema/collections/emvb_pages?includeFields=true")).json;

/** The schema facts setup is responsible for, without ids and timestamps. */
export function setupFacts(schema: Record<string, unknown> | null) {
  const item = (schema?.["data"] as { item?: Record<string, unknown> } | undefined)?.item;
  if (!item) return null;
  const fields = (item["fields"] as Record<string, unknown>[]).map((f) => ({
    slug: f["slug"],
    type: f["type"],
    widget: f["widget"] ?? null,
    required: Boolean(f["required"]),
    options: (f["validation"] as { options?: string[] } | null)?.options ?? null,
  }));
  return { hidden: item["hidden"], supports: item["supports"], hasSeo: item["hasSeo"], fields };
}
