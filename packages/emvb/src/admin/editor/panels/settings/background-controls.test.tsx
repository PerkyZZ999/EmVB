import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { emptyDesign, type StyleProps } from "../../../../core/index.ts";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { StyleRow } from "./StyleRow.tsx";

afterEach(async () => {
  await cleanup();
});

const patches: Partial<StyleProps>[] = [];

const row = (styleKey: "backgroundImage" | "gradient" | "overlay", style: StyleProps = {}) =>
  mount(
    <StyleRow
      styleKey={styleKey}
      style={style}
      design={emptyDesign()}
      onPatch={(patch) => patches.push(patch)}
      onDesignChange={async () => undefined}
    />,
  );

describe("background controls (W-094)", () => {
  test("a pasted image URL is saved, and a javascript: URL is refused", async () => {
    patches.length = 0;
    const host = await row("backgroundImage");
    const input = host.querySelector<HTMLInputElement>("[data-emvb-bg-url]");
    expect(input?.outerHTML.includes("data-emvb-bg-url")).toBe(true);
    const type = async (text: string) => {
      if (!input) throw new Error("no URL field");
      await act(async () => {
        input.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
          input,
          text,
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
    };
    await type("javascript:alert(1)");
    expect(patches).toEqual([]);
    expect(host.textContent?.includes("https://example.com/photo.jpg")).toBe(true);
    await type("https://cdn.example/photo.png");
    expect(patches.at(-1)).toEqual({ backgroundImage: "https://cdn.example/photo.png" });
  });

  test("Add gradient and Add overlay write the starting values", async () => {
    patches.length = 0;
    const gradient = await row("gradient");
    await act(async () => gradient.querySelector<HTMLElement>("[data-emvb-add-gradient]")?.click());
    expect(patches.at(-1)).toEqual({
      gradient: { angle: 180, from: "#ffffff", to: "#000000" },
    });
    const overlay = await row("overlay");
    await act(async () => overlay.querySelector<HTMLElement>("[data-emvb-add-overlay]")?.click());
    expect(patches.at(-1)).toEqual({ overlay: { color: "#000000", opacity: 0.4 } });
  });
});
