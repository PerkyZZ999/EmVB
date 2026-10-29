import { afterEach, expect, test } from "bun:test";
import type { Fetcher } from "../api.ts";
import { CollectionsPage } from "./CollectionsPage.tsx";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";

afterEach(cleanup);

const fetcher: Fetcher = async (path) => {
  if (path === "/_emdash/api/auth/me") return Response.json({ data: { id: "u1", role: 50 } });
  if (path === "/_emdash/api/schema/collections")
    return Response.json({ data: { items: [{ slug: "pages", label: "Pages" }] } });
  if (path.startsWith("/_emdash/api/schema/collections/pages"))
    return Response.json({ data: { item: { slug: "pages", fields: [] } } });
  if (path.endsWith("/editor/config")) return Response.json({ data: { canvasCollections: [] } });
  return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
};

test("W-921: the collections table scrolls inside its card on phones and is keyboard-reachable", async () => {
  const host = await mount(<CollectionsPage fetcher={fetcher} />);
  await settle();
  await settle();
  await settle();
  await settle();
  const wrapper = host.querySelector<HTMLElement>(".emvb-agents-table");
  expect(wrapper?.querySelector("table.emvb-collections-table")).not.toBeNull();
  expect(wrapper?.tabIndex).toBe(0);
  expect(wrapper?.getAttribute("role") ?? null).toBe("group");
  expect(wrapper?.getAttribute("aria-label") ?? null).toBe("Collections");
});
