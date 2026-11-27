import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { scopeExtensionCss } from "../../../core/css/scope.ts";
import type { Layout, VNode } from "../../../core/index.ts";
import { cleanup, mount, settle } from "../../../../test/dom/mount.ts";
import { adminTheme, applyCanvasTheme, followAdminTheme } from "./canvas-theme.ts";
import { CanvasFrame, type CanvasSelection } from "./CanvasFrame.tsx";

// extensionApi 1.5: the canvas root carries the admin's light or dark mode, so a kit's dark rules show
// while editing, as they do for a visitor who picked dark.
const admin = document.documentElement;
beforeEach(() => {
  delete admin.dataset["mode"];
});
afterEach(async () => {
  await cleanup();
  delete admin.dataset["mode"];
});

const layout: Layout = {
  schemaVersion: 18,
  root: { id: "root0001", type: "container", props: {}, children: [] },
};
const selection: CanvasSelection = {
  selectedId: null,
  labelFor: () => "Element",
  canDelete: () => true,
  canMove: () => true,
  canDuplicate: () => true,
  onSelect: () => {},
  onDelete: () => {},
  onDuplicate: () => {},
  onKeyDown: () => {},
};
/** A kit: blue by default, purple under a dark theme. Scoped as an extension's CSS is. */
const KIT_CSS = scopeExtensionCss(
  ":root{--kit-c:blue}[data-theme=dark]{--kit-c:purple}:root:not([data-theme]){--kit-c:blue}.kit-b{color:var(--kit-c)}",
  "kit",
);
const page: VNode = {
  tag: "div",
  attrs: { class: "emvb-ext emvb-ext--kit" },
  children: [{ tag: "button", attrs: { class: "kit-b", id: "kit-button" }, children: ["Go"] }],
};
/** Waits, in short steps, until `ready` holds (at most about half a second). */
const until = async (ready: () => boolean, tries = 100): Promise<void> => {
  if (ready() || tries <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, 5));
  await until(ready, tries - 1);
};
const mountCanvas = async () => {
  await mount(
    <CanvasFrame
      vnode={page}
      css={KIT_CSS}
      layout={layout}
      selection={selection}
      onDropNew={() => {}}
      onMove={() => {}}
      onCommitText={() => {}}
    />,
  );
  // The canvas page loads on its own tick: wait until it has a root with the theme on it.
  const frame = document.querySelector("iframe") as HTMLIFrameElement;
  await until(
    () => frame.contentDocument?.documentElement.hasAttribute("data-emvb-theme") === true,
  );
  const canvas = frame.contentDocument as Document;
  return {
    canvas,
    colour: () =>
      (canvas.defaultView as Window).getComputedStyle(
        canvas.getElementById("kit-button") as HTMLElement,
      ).color,
  };
};

describe("the admin's mode", () => {
  test("is dark only when the admin says so; anything else is light", () => {
    expect(adminTheme()).toBe("light");
    admin.dataset["mode"] = "dark";
    expect(adminTheme()).toBe("dark");
    admin.dataset["mode"] = "light";
    expect(adminTheme()).toBe("light");
    admin.dataset["mode"] = "sepia";
    expect(adminTheme()).toBe("light");
  });

  test("goes onto a canvas root as the theme attribute a public page carries, with the browser's colour scheme", () => {
    const canvas = document.implementation.createHTMLDocument("canvas");
    applyCanvasTheme(canvas, "dark");
    expect(canvas.documentElement.getAttribute("data-emvb-theme")).toBe("dark");
    expect(canvas.documentElement.style.colorScheme).toBe("dark");
    applyCanvasTheme(canvas, "light");
    expect(canvas.documentElement.getAttribute("data-emvb-theme")).toBe("light");
    expect(canvas.documentElement.style.colorScheme).toBe("light");
  });

  test("is followed from now on, and the watching can be stopped", async () => {
    const canvas = document.implementation.createHTMLDocument("canvas");
    admin.dataset["mode"] = "dark";
    const stop = followAdminTheme(canvas);
    expect(canvas.documentElement.getAttribute("data-emvb-theme")).toBe("dark");
    admin.dataset["mode"] = "light";
    await settle();
    expect(canvas.documentElement.getAttribute("data-emvb-theme")).toBe("light");
    stop();
    admin.dataset["mode"] = "dark";
    await settle();
    expect(canvas.documentElement.getAttribute("data-emvb-theme")).toBe("light");
  });
});

describe("the editor canvas", () => {
  test("opens in the admin's mode", async () => {
    admin.dataset["mode"] = "dark";
    const { canvas } = await mountCanvas();
    expect(canvas.documentElement.getAttribute("data-emvb-theme")).toBe("dark");
  });

  test("a canvas opened in dark shows the kit's dark rule", async () => {
    admin.dataset["mode"] = "dark";
    const { colour } = await mountCanvas();
    // The attribute is on the canvas root before the style is first read, so the kit's dark rule applies.
    expect(colour()).toBe("purple");
  });

  test("a canvas opened in light shows the kit's default", async () => {
    admin.dataset["mode"] = "light";
    const { colour } = await mountCanvas();
    expect(colour()).toBe("blue");
  });

  test("switching the admin's mode moves the canvas root with it", async () => {
    admin.dataset["mode"] = "light";
    const { canvas } = await mountCanvas();
    expect(canvas.documentElement.getAttribute("data-emvb-theme")).toBe("light");
    admin.dataset["mode"] = "dark";
    await settle();
    expect(canvas.documentElement.getAttribute("data-emvb-theme")).toBe("dark");
    expect(canvas.documentElement.style.colorScheme).toBe("dark");
    admin.dataset["mode"] = "light";
    await settle();
    expect(canvas.documentElement.getAttribute("data-emvb-theme")).toBe("light");
    // The kit's computed style changing after that switch is checked in a real browser:
    // e2e/extensions.e2e.ts. happy-dom keeps a computed style it has already read.
  });

  test("watches the admin once per canvas, and stops when the canvas is removed", async () => {
    const real = window.MutationObserver;
    let live = 0;
    class Counting extends real {
      override observe(...args: Parameters<MutationObserver["observe"]>) {
        live += 1;
        super.observe(...args);
      }
      override disconnect() {
        live -= 1;
        super.disconnect();
      }
    }
    window.MutationObserver = Counting as typeof MutationObserver;
    try {
      await mountCanvas();
      const whileOpen = live;
      await cleanup();
      expect(whileOpen).toBeGreaterThanOrEqual(1);
      expect(live).toBe(0);
    } finally {
      window.MutationObserver = real;
    }
  });

  test("does not follow the operating system: an admin set to light stays light", async () => {
    admin.dataset["mode"] = "light";
    const { canvas } = await mountCanvas();
    expect(canvas.documentElement.getAttribute("data-emvb-theme")).toBe("light");
  });

  test("stops following the admin when the canvas goes away", async () => {
    admin.dataset["mode"] = "light";
    const { canvas } = await mountCanvas();
    // The page the canvas document belongs to is gone: nothing is left watching the admin.
    const root = canvas.documentElement;
    await cleanup();
    root.setAttribute("data-emvb-theme", "light");
    admin.dataset["mode"] = "dark";
    await settle();
    expect(root.getAttribute("data-emvb-theme")).toBe("light");
  });
});
