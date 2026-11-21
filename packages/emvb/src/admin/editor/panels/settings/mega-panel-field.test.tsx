import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { emptyDesign, type Layout, type LayoutNode } from "../../../../core/index.ts";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import type { Fetcher } from "../../../api.ts";
import { ElementPanel } from "../ElementPanel.tsx";

afterEach(cleanup);

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const part = (id: string, title: string, partType: string) => ({
  id,
  status: "published",
  updatedAt: "2026-11-19T00:00:00Z",
  data: { title, part_type: partType },
});

const fetcher: Fetcher = async (path) =>
  path.includes("/content/emvb_theme_parts")
    ? new Response(
        JSON.stringify({
          data: {
            items: [
              part("sect0001", "Products panel", "section"),
              part("head0001", "Site header", "header"),
            ],
          },
        }),
        { status: 200 },
      )
    : new Response("{}", { status: 404 });

test("a Menu item picks its mega panel from the Section parts (W-1069)", async () => {
  const node: LayoutNode = {
    id: "item0001",
    type: "menu-item",
    props: { text: "Products", panelPartId: "sect0001" },
    children: [],
  };
  const layout: Layout = {
    schemaVersion: 18,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [{ id: "menu0001", type: "menu", props: { direction: "row" }, children: [node] }],
    },
  };
  const changes: LayoutNode[] = [];
  const host = await mount(
    <ElementPanel
      node={node}
      layout={layout}
      design={emptyDesign()}
      rejection={null}
      fetcher={fetcher}
      formsAvailable={false}
      onChange={(next) => changes.push(next)}
      onDesignChange={async () => undefined}
      onSelect={() => undefined}
    />,
  );
  await flush();
  const field = host.querySelector('[data-emvb-mega-panel-bind="list"]');
  expect(field !== null).toBe(true);
  expect(field?.textContent ?? "").toContain("Products panel");
  expect(field?.textContent ?? "").toContain("in place of the items under it");
  expect(field?.textContent?.includes("Site header")).toBe(false);
  const input = [...host.querySelectorAll<HTMLInputElement>("input")].find(
    (el) => el.value === "sect0001",
  );
  expect(input !== undefined).toBe(true);
  expect(host.textContent ?? "").toContain("Mega panel width");
});
