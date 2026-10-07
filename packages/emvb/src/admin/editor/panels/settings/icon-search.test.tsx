import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { LayoutNode } from "../../../../core/index.ts";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { IconPicker } from "./IconPicker.tsx";

afterEach(cleanup);

const node = {
  id: "icon0001",
  type: "icon",
  props: { iconId: "star", title: "Star", decorative: false, size: 24 },
} as LayoutNode;

const type = async (value: string) => {
  const input = document.querySelector<HTMLInputElement>("input");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const shown = () =>
  [...document.querySelectorAll("[data-emvb-icon-id]")].map((b) =>
    b.getAttribute("data-emvb-icon-id"),
  );

describe("icon search and listbox (W-217)", () => {
  test("words match in any order and the id's words count too", async () => {
    await mount(<IconPicker node={node} onChange={() => undefined} />);
    await type("right arrow");
    expect(shown()).toContain("arrow-right");
    expect(shown()).not.toContain("arrow-left");
    await type("ARROW   right");
    expect(shown()).toContain("arrow-right");
  });

  test("the listbox holds options, not list items", async () => {
    await mount(<IconPicker node={node} onChange={() => undefined} />);
    const items = [...document.querySelectorAll('[role="listbox"] > li')];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((li) => li.getAttribute("role") === "presentation")).toBe(true);
  });
});
