import { expect, test } from "bun:test";
import { partsInUse } from "./bulk-api.ts";
import type { Fetcher } from "./api.ts";

const json = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });

test("a part shown as a mega menu panel counts as in use, like a synced section (W-1069)", async () => {
  const layout = (props: Record<string, unknown>) => ({
    schemaVersion: 18,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [{ id: "item0001", type: "menu-item", props: { text: "Shop", ...props } }],
    },
  });
  const fetcher: Fetcher = (path) =>
    Promise.resolve(
      json({
        items: path.includes("emvb_pages")
          ? [{ id: "page1", data: { title: "Home", layout: layout({ panelPartId: "mega1" }) } }]
          : [{ id: "head1", data: { title: "Header", layout: layout({ partId: "sync1" }) } }],
      }),
    );
  const used = await partsInUse(fetcher, ["mega1", "sync1", "free1"]);
  expect(used.get("mega1")).toEqual(["Home"]);
  expect(used.get("sync1")).toEqual(["Header"]);
  expect(used.has("free1")).toBe(false);
});
