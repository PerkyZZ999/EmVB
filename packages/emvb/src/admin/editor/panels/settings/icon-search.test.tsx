import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { LayoutNode } from "../../../../core/index.ts";
import { cleanup, mount, settle } from "../../../../../test/dom/mount.ts";
import { currentIconPreview, iconNameLabel, IconPicker } from "./IconPicker.tsx";

afterEach(cleanup);

// W-236: the field shows what is stored; the search itself moved into the library (icon-library.test).

const node = (props: Record<string, unknown>) =>
  ({
    id: "icon0001",
    type: "icon",
    props: { decorative: false, size: 24, ...props },
  }) as LayoutNode;

describe("Icon field preview (W-236)", () => {
  test("names come from the bundled label or the stored id", () => {
    expect(iconNameLabel("star")).toBe("Star");
    expect(iconNameLabel("fa-solid:arrow-right")).toBe("Arrow right");
    expect(iconNameLabel("remix:home-4-fill")).toBe("Home 4 fill");
  });

  test("the preview is the saved SVG, sanitized, at 20px; else the bundled glyph; else nothing", () => {
    const saved = currentIconPreview(
      "fa-solid:x",
      '<svg viewBox="0 0 448 512" width="999" height="999" id="x"><path d="M0 0h1"/></svg>',
    );
    expect(saved).toContain('viewBox="0 0 448 512"');
    expect(saved).toContain('width="20"');
    expect(saved).not.toContain("999");
    // Markup the sanitizer refuses shows nothing (the bundled glyph when the id has one).
    const hostile = '<svg viewBox="0 0 24 24"><script>alert(1)</script><path d="M0 0h1"/></svg>';
    expect(currentIconPreview("fa-solid:x", hostile)).toBe("");
    expect(currentIconPreview("star", hostile)).toContain("M11.525 2.295");
    expect(currentIconPreview("star", undefined)).toContain("M11.525 2.295");
    expect(currentIconPreview("no-such-icon", undefined)).toBe("");
  });

  test("an unknown id without SVG says so; the preview button opens the library", async () => {
    await mount(<IconPicker node={node({ iconId: "gone:thing" })} onChange={() => undefined} />);
    expect(document.querySelector("[data-emvb-icon-current]")?.textContent).toContain("Not found");
    const button = document.querySelector<HTMLButtonElement>(".emvb-icon-current-preview");
    expect(button?.getAttribute("aria-label")).toBe("Change icon (now Thing)");
    await act(async () => button?.click());
    await settle();
    expect(document.querySelector('[data-emvb-dialog="icon-library"]')).toBeTruthy();
  });

  test("closing the library (Escape here) puts focus back on Choose", async () => {
    await mount(<IconPicker node={node({ iconId: "star" })} onChange={() => undefined} />);
    const choose = document.querySelector<HTMLButtonElement>("[data-emvb-icon-open]");
    await act(async () => choose?.click());
    let grid: Element | null = null;
    for (let i = 0; i < 200 && !grid; i += 1) {
      // oxlint-disable-next-line no-await-in-loop -- polling for the lazy set
      await settle();
      grid = document.querySelector('[data-emvb-dialog="icon-library"] [role="listbox"]');
    }
    await act(async () => {
      grid?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    for (let i = 0; i < 50 && document.activeElement !== choose; i += 1) {
      // oxlint-disable-next-line no-await-in-loop -- focus moves on the next frame
      await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    }
    expect(document.querySelector('[data-emvb-dialog="icon-library"]')).toBeNull();
    expect(document.activeElement).toBe(choose);
  });
});
