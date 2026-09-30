import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import {
  emptyDesign,
  type DesignSystem,
  type LayoutNode,
  type StyleProps,
} from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { ElementPanel } from "../ElementPanel.tsx";
import { StyleRow } from "./StyleRow.tsx";
import { keysFor, sectionsFor, STYLE_UI, type StyleKey } from "./style-sections.ts";

const stubFetcher: Fetcher = async () => new Response("{}", { status: 200 });

afterEach(async () => {
  await cleanup();
  sessionStorage.clear();
});

let patches: Partial<StyleProps>[] = [];
afterEach(() => {
  patches = [];
});

const row = (styleKey: StyleKey, style: StyleProps = {}) =>
  mount(
    <StyleRow
      styleKey={styleKey}
      style={style}
      design={emptyDesign()}
      onPatch={(patch) => patches.push(patch)}
      onDesignChange={async () => undefined}
    />,
  );

async function choose(label: string, option: string) {
  const trigger = document.querySelector(`[role="combobox"][aria-label="${label}"]`) as HTMLElement;
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    trigger.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  const options = [...document.querySelectorAll('[role="option"]')];
  const match = options.find((o) => o.textContent === option) as HTMLElement | undefined;
  await act(async () => {
    match?.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  return options.map((o) => o.textContent);
}

const panel = (node: LayoutNode, design: DesignSystem = emptyDesign()) =>
  mount(
    <ElementPanel
      node={node}
      layout={{
        schemaVersion: 1,
        root: { id: "root0001", type: "container", props: {}, children: [node] },
      }}
      design={design}
      rejection={null}
      fetcher={stubFetcher}
      onChange={() => undefined}
      onDesignChange={async () => undefined}
      onSelect={() => undefined}
    />,
  );

const styleTab = async () => {
  const tab = [...document.querySelectorAll('[role="tab"]')].find(
    (el) => el.textContent === "Style",
  ) as HTMLElement | undefined;
  await act(async () => tab?.click());
};

const sectionIds = () =>
  [...document.querySelectorAll("[data-emvb-section]")].map((el) =>
    el.getAttribute("data-emvb-section"),
  );

const image: LayoutNode = {
  id: "imag0001",
  type: "image",
  props: { src: "https://example.com/a.jpg", alt: "A", decorative: false },
};

describe("Size section (W-088)", () => {
  test("Size holds width, height, their limits, overflow and aspect ratio in that order", () => {
    expect(keysFor("container", "size")).toEqual([
      "width",
      "height",
      "minWidth",
      "minHeight",
      "maxWidth",
      "maxHeight",
      "overflow",
      "aspectRatio",
    ]);
    expect(keysFor("container", "layout")).toEqual([
      "flexDirection",
      "flexWrap",
      "justifyContent",
      "alignItems",
      "gap",
    ]);
  });

  test("object fit is offered on Image and Video only", () => {
    expect(keysFor("image", "size")).toContain("objectFit");
    expect(keysFor("video", "size")).toContain("objectFit");
    expect(keysFor("container", "size")).not.toContain("objectFit");
    expect(keysFor("heading", "size")).not.toContain("objectFit");
  });

  test("Divider sizes by width only", () => {
    expect(keysFor("divider", "size")).toEqual(["width"]);
  });

  test("a set value stays visible where the type wouldn't offer it", () => {
    expect(keysFor("container", "size", { objectFit: "cover" })).toContain("objectFit");
    expect(keysFor("divider", "size", { height: { value: 2, unit: "px" } })).toEqual([
      "width",
      "height",
    ]);
    expect(sectionsFor(STYLE_UI.heading?.sections ?? [], { flexDirection: "row" })).toContain(
      "layout",
    );
    expect(sectionsFor(STYLE_UI.heading?.sections ?? [], {})).not.toContain("layout");
  });

  test("sections follow the Elementor v4 order", () => {
    expect(STYLE_UI.container?.sections).toEqual([
      "layout",
      "spacing",
      "size",
      "background",
      "border",
      "advanced",
    ]);
    expect(STYLE_UI.heading?.sections.slice(0, 3)).toEqual(["spacing", "size", "typography"]);
  });

  test("Image opens on Size and shows object fit there", async () => {
    await panel(image);
    await styleTab();
    expect(sectionIds()).toEqual(["spacing", "size", "border", "advanced"]);
    expect(
      document.querySelector('[data-emvb-section="size"]')?.getAttribute("aria-expanded"),
    ).toBe("true");
    expect(document.querySelector('[data-emvb-style="objectFit"]')?.tagName ?? null).toBe("DIV");
  });

  test("the panel shows a stored value the type wouldn't offer, ready to reset", async () => {
    await panel({
      id: "head0001",
      type: "heading",
      props: { text: "Hi", level: 2 },
      style: { objectFit: "cover", flexDirection: "row" },
    });
    await styleTab();
    expect(sectionIds()).toEqual([
      "layout",
      "spacing",
      "size",
      "typography",
      "background",
      "border",
      "advanced",
    ]);
    const size = document.querySelector('[data-emvb-section="size"]') as HTMLElement;
    await act(async () => size.click());
    const reset = document.querySelector<HTMLButtonElement>(
      '[data-emvb-style="objectFit"] [aria-label="Reset Object fit to default"]',
    );
    expect(reset?.disabled).toBe(false);
  });

  test("Overflow saves the chosen keyword", async () => {
    await row("overflow");
    const options = await choose("Overflow", "Hidden");
    expect(options).toEqual(["Visible", "Hidden", "Clip", "Scroll", "Auto"]);
    expect(patches).toEqual([{ overflow: "hidden" }]);
  });

  test("Aspect ratio shows 16:9 and stores 16/9", async () => {
    await row("aspectRatio");
    const options = await choose("Aspect ratio", "16:9");
    expect(options).toEqual(["Auto", "1:1", "4:3", "3:2", "16:9", "21:9", "3:4", "2:3", "9:16"]);
    expect(patches).toEqual([{ aspectRatio: "16/9" }]);
  });

  test("Object fit saves the chosen keyword", async () => {
    await row("objectFit");
    await choose("Object fit", "Scale down");
    expect(patches).toEqual([{ objectFit: "scale-down" }]);
  });

  test("Max height is a length row with the box units", async () => {
    await row("maxHeight", { maxHeight: { value: 40, unit: "vh" } });
    expect(document.querySelector<HTMLInputElement>(".emvb-length input")?.value).toBe("40");
    expect(document.querySelector(".emvb-unit-btn")?.getAttribute("data-emvb-unit")).toBe("vh");
  });
});
