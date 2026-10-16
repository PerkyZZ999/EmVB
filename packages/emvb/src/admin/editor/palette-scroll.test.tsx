import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { cleanup, mount, rerender, settle } from "../../../test/dom/mount.ts";
import { CommandPalette } from "./CommandPalette.tsx";
import type { PaletteItem } from "./palette.ts";

const items: PaletteItem[] = [
  { id: "zoom", group: "Actions", label: "Zoom out", run: () => undefined },
  { id: "save", group: "Actions", label: "Save draft", run: () => undefined },
];
const onOpenChange = () => undefined;
const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
const scrolled: string[] = [];

function watchScroll() {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value(this: HTMLElement) {
      scrolled.push(this.getAttribute("data-emvb-palette-item") ?? "");
    },
  });
}

afterEach(async () => {
  await cleanup();
  if (originalScroll)
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScroll);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  scrolled.length = 0;
});

test("W-705: filtering scrolls the first palette result into view at the same index", async () => {
  watchScroll();
  await mount(<CommandPalette open onOpenChange={onOpenChange} items={items} />);
  await settle();
  scrolled.length = 0;
  const input = document.querySelector<HTMLInputElement>("[data-emvb-palette-input]");
  if (!input) throw new Error("Palette search is missing");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "save");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(input.getAttribute("aria-activedescendant")).toBe("emvb-palette-0");
  expect(scrolled).toContain("save");
});

test("W-705: reopening the palette scrolls its unchanged first result into view", async () => {
  watchScroll();
  await mount(<CommandPalette open onOpenChange={onOpenChange} items={items} />);
  await settle();
  await rerender(<CommandPalette open={false} onOpenChange={onOpenChange} items={items} />);
  await settle();
  scrolled.length = 0;
  await rerender(<CommandPalette open onOpenChange={onOpenChange} items={items} />);
  await settle();
  expect(scrolled).toContain("zoom");
});
