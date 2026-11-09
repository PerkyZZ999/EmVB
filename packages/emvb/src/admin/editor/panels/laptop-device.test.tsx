import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { emptyDesign, type LayoutNode } from "../../../core/index.ts";
import { cleanup, mount, settle } from "../../../../test/dom/mount.ts";
import { DeviceBar } from "../canvas/DeviceBar.tsx";
import { applyStylePatch } from "./style-target.ts";

afterEach(cleanup);

test("W-956: the device bar offers Laptop between Desktop and Tablet", async () => {
  const picked: string[] = [];
  await mount(
    <DeviceBar
      device="desktop"
      hidden={false}
      canHide={false}
      hideLabel="Hide on desktop"
      onDevice={(device) => picked.push(device)}
      onToggleHidden={() => undefined}
    />,
  );
  await settle();
  const tabs = [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent?.trim());
  expect(tabs).toEqual(["Desktop", "Laptop", "Tablet", "Mobile"]);
  const laptop = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (t) => t.textContent?.trim() === "Laptop",
  );
  await act(async () => laptop?.click());
  expect(picked).toContain("laptop");
});

test("W-956: styling on Laptop writes the element's or class's laptop override", () => {
  const node = { id: "head0001", type: "heading", props: { text: "Hi", level: 2 } } as LayoutNode;
  const own = applyStylePatch({
    node,
    design: emptyDesign(),
    classId: null,
    device: "laptop",
    state: "normal",
    patch: { color: "#333333" },
  });
  expect(own.kind === "node" && own.node.devices).toEqual({ laptop: { color: "#333333" } });
  const design = { ...emptyDesign(), classes: [{ id: "card", name: "Card", style: {} }] };
  const cls = applyStylePatch({
    node,
    design,
    classId: "card",
    device: "laptop",
    state: "normal",
    patch: { color: "#444444" },
  });
  expect(cls.kind === "design" && cls.design.classes?.[0]?.devices).toEqual({
    laptop: { color: "#444444" },
  });
});
