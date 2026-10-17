import { afterEach, expect, test } from "bun:test";
import { emptyDesign, type StyleProps } from "../../../../core/index.ts";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { act } from "react";
import { StyleRow } from "./StyleRow.tsx";

afterEach(cleanup);

test("UX-048: an unset select reads Default, and its first option can still be picked", async () => {
  const patches: Partial<StyleProps>[] = [];
  const host = await mount(
    <StyleRow
      styleKey="fontWeight"
      style={{}}
      design={emptyDesign()}
      onPatch={(patch) => patches.push(patch)}
      onDesignChange={async () => undefined}
    />,
  );
  const trigger = host.querySelector('[role="combobox"]');
  expect(trigger?.textContent?.trim() ?? "no select").toBe("Default");
  await act(async () => {
    trigger?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    trigger?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    (trigger as HTMLElement | null)?.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  const regular = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (o) => o.textContent?.trim() === "Regular",
  );
  await act(async () => {
    regular?.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(patches).toEqual([{ fontWeight: 400 }]);
});
