import { expect, test } from "bun:test";
import { keyCombos, SHORTCUTS } from "./shortcuts.ts";

test("UX-085: the Shortcuts dialog lists F2 for renaming a layer or class chip", () => {
  expect(SHORTCUTS.find((s) => s.keys === "F2")?.action ?? "missing").toBe(
    "Rename (layer or class chip)",
  );
});

test("W-775: the Shortcuts dialog lists Ctrl/Cmd+Y for redo", () => {
  expect(SHORTCUTS.find((s) => s.action === "Undo / redo")?.keys ?? "missing").toContain(
    "Ctrl/Cmd+Y",
  );
});

test("W-864: shortcut keys split into one box per key, alternatives kept apart", () => {
  expect(keyCombos("Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y")).toEqual([
    { before: "", keys: ["Ctrl/Cmd", "Z"] },
    { before: " / ", keys: ["Ctrl/Cmd", "Shift", "Z"] },
    { before: " or ", keys: ["Ctrl/Cmd", "Y"] },
  ]);
  expect(keyCombos("Delete or Backspace")).toEqual([
    { before: "", keys: ["Delete"] },
    { before: " or ", keys: ["Backspace"] },
  ]);
  for (const { keys } of SHORTCUTS) {
    const text = keyCombos(keys)
      .map(({ before, keys: k }) => before + k.join("+"))
      .join("");
    expect(text).toBe(keys);
  }
});
