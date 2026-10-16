import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { cleanup, mount } from "../../../test/dom/mount.ts";
import { CommandPalette } from "./CommandPalette.tsx";
import type { PaletteItem } from "./palette.ts";

afterEach(cleanup);

const items: PaletteItem[] = [
  {
    id: "recipe:hero",
    group: "Insert",
    label: "Insert Hero section",
    hint: "Recipe",
    run: () => {},
  },
  { id: "find:t1", group: "Find text", label: "Hero copy", hint: "Text", run: () => {} },
];

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

const hintOf = (id: string) =>
  document.querySelector(`[data-emvb-palette-item="${id}"] .emvb-palette-hint`);

test("UX-002: a search result shows its group as a separate tag before the detail", async () => {
  await mount(<CommandPalette open onOpenChange={() => {}} items={items} />);
  await settle();
  const input = document.querySelector<HTMLInputElement>("[data-emvb-palette-input]");
  if (!input) throw new Error("Palette search is missing");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "hero");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const hint = hintOf("recipe:hero");
  expect(hint?.querySelector(".emvb-palette-kind")?.textContent ?? null).toBe("Insert");
  expect(hint?.querySelector(".emvb-palette-detail")?.textContent ?? null).toBe("Recipe");
  expect(hint?.textContent ?? null).toBe("Insert Recipe");
  expect(hintOf("find:t1")?.querySelector(".emvb-palette-kind")?.textContent ?? null).toBe(
    "Find text",
  );
});

test("UX-002: without a search the group heading names the group, so rows show no tag", async () => {
  await mount(<CommandPalette open onOpenChange={() => {}} items={items} />);
  await settle();
  const hint = hintOf("recipe:hero");
  expect(hint?.querySelector(".emvb-palette-kind") ? "tag" : "none").toBe("none");
  expect(hint?.textContent ?? null).toBe("Recipe");
});
