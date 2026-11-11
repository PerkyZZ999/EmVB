import { afterEach, expect, test } from "bun:test";
import { cleanup, mount, settle } from "../../../../../test/dom/mount.ts";
import type { Fetcher } from "../../../api.ts";
import { LoopItemBindControl } from "./LoopItemBindControl.tsx";

afterEach(cleanup);

const fetcher: Fetcher = async () =>
  Response.json({
    data: {
      items: [
        { id: "p1", status: "published", data: { title: "Hero", part_type: "section" } },
        {
          id: "p2",
          status: "published",
          draftRevisionId: "r2",
          data: { title: "Promo", part_type: "section" },
        },
        { id: "p3", status: "draft", data: { title: "New", part_type: "section" } },
      ],
    },
  });

const note = () => document.querySelector("[data-emvb-part-draft]");

async function bound(value: string) {
  await mount(
    <LoopItemBindControl
      value={value}
      fetcher={fetcher}
      partType="section"
      label="Section part"
      marker="section"
      onChange={() => undefined}
    />,
  );
  await settle();
}

test("W-970: a synced section with unpublished changes says visitors see the published one", async () => {
  await bound("p2");
  expect(note()?.getAttribute("data-emvb-part-draft")).toBe("changed");
  expect(note()?.textContent).toContain("Visitors see the published version");
});

test("W-970: a never-published section says visitors see nothing yet", async () => {
  await bound("p3");
  expect(note()?.textContent).toContain("visitors see nothing here");
});

test("W-970: a published section has no note", async () => {
  await bound("p1");
  expect(note()).toBeNull();
});
