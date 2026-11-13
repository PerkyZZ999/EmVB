import { expect, test } from "bun:test";
import { ELEMENT_ICONS as EDITOR } from "../../packages/emvb/src/admin/editor/element-chrome.ts";
import { ELEMENT_DESCRIPTORS } from "../../packages/emvb/src/core/index.ts";
import { ELEMENT_ICONS as SITE, elementIcon } from "../../site/src/data/element-icons.ts";

const name = (icon: unknown) => (icon as { displayName?: string }).displayName;

test("W-1029: the site shows each element with the editor's own icon", () => {
  expect(Object.keys(SITE).toSorted()).toEqual(Object.keys(EDITOR).toSorted());
  for (const [type, icon] of Object.entries(EDITOR))
    expect([type, name(SITE[type])]).toEqual([type, name(icon)]);
});

test("W-1029: every element the site's Add panel grid lists has its own icon", () => {
  for (const { type } of ELEMENT_DESCRIPTORS) expect([type, type in SITE]).toEqual([type, true]);
  expect(name(elementIcon("future-widget"))).toBe("SquaresFourIcon");
});
