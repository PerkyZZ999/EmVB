import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";
import { ShortcutsDialog } from "./ShortcutsDialog.tsx";

afterEach(cleanup);

test("UX-007: the shortcuts dialog closes from a right-aligned actions row under a helper note", async () => {
  await mount(<ShortcutsDialog open onOpenChange={() => undefined} />);
  await settle();
  const close = [...document.querySelectorAll("button")].find((b) => b.textContent === "Close");
  expect(close?.parentElement?.className ?? null).toBe("emvb-dialog-actions");
  const note = [...document.querySelectorAll("p")].find((p) =>
    p.textContent?.startsWith("Shortcuts don't fire"),
  );
  expect(note?.className ?? null).toBe("emvb-helper");
});

test("UX-009: top-bar dialogs use the shared dialog body and a compact secondary Close", async () => {
  await mount(<ShortcutsDialog open onOpenChange={() => undefined} />);
  await settle();
  const body = document.querySelector('[data-emvb-dialog="shortcuts"]');
  expect(body?.className ?? null).toBe("emvb-dialog");
  const close = [...document.querySelectorAll("button")].find((b) => b.textContent === "Close");
  expect(close?.classList.contains("emvb-btn") ?? false).toBe(true);
  for (const [file, key] of [
    ["PerfMeter.tsx", "perf"],
    ["Timeline.tsx", "timeline"],
    ["A11yCopilot.tsx", "a11y"],
    ["ShareLink.tsx", "share"],
  ]) {
    const source = readFileSync(join(import.meta.dir, file ?? ""), "utf8");
    expect(
      source.includes(`<div className="emvb-dialog" data-emvb-dialog="${key}">`) ? key : file,
    ).toBe(key);
  }
});

test("UX-007: the page weight and timeline dialogs close from the same actions row", () => {
  for (const file of ["PerfMeter.tsx", "Timeline.tsx"]) {
    const source = readFileSync(join(import.meta.dir, file), "utf8");
    expect(
      /<div className="emvb-dialog-actions"[^>]*>\s*(<Dialog\.Close\s+render=|<DialogCloseButton>)/.test(
        source,
      )
        ? file
        : "",
    ).toBe(file);
  }
});

test("W-864: the shortcuts dialog shows each key in a box, as the command palette does", async () => {
  await mount(<ShortcutsDialog open onOpenChange={() => undefined} />);
  await settle();
  const row = [...document.querySelectorAll(".emvb-shortcuts tr")].find(
    (tr) => tr.firstElementChild?.textContent === "Undo / redo",
  );
  const keys = row?.lastElementChild;
  expect([...(keys?.querySelectorAll("kbd") ?? [])].map((k) => k.textContent)).toEqual([
    "Ctrl/Cmd",
    "Z",
    "Ctrl/Cmd",
    "Shift",
    "Z",
    "Ctrl/Cmd",
    "Y",
  ]);
  expect(keys?.textContent).toBe("Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y");
});
