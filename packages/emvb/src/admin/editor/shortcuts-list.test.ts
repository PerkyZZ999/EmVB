import { expect, test } from "bun:test";
import { SHORTCUTS } from "./shortcuts.ts";

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
