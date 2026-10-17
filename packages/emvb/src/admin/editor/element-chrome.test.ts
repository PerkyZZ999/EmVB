import { describe, expect, test } from "bun:test";
import { ELEMENT_DESCRIPTORS } from "../../core/index.ts";
import { ELEMENT_ICONS } from "./element-chrome.ts";

describe("element chrome (W-361)", () => {
  test("every element type has an icon", () => {
    const missing = ELEMENT_DESCRIPTORS.map((descriptor) => descriptor.type).filter(
      (type) => ELEMENT_ICONS[type] === undefined,
    );
    expect(missing).toEqual([]);
  });
});

test("UX-036: no two Add panel tiles in one group share an icon", () => {
  const shared: string[] = [];
  const seen = new Map<string, string>();
  for (const { type, group } of ELEMENT_DESCRIPTORS) {
    if (type === "tab-panel") continue;
    const key = `${group}:${ELEMENT_ICONS[type]?.displayName ?? type}`;
    const first = seen.get(key);
    if (first) shared.push(`${first} and ${type}`);
    else seen.set(key, type);
  }
  expect(shared).toEqual([]);
});
