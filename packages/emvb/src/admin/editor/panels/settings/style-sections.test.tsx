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
      "position",
      "background",
      "border",
      "advanced",
    ]);
    expect(STYLE_UI.heading?.sections.slice(0, 4)).toEqual([
      "spacing",
      "size",
      "position",
      "typography",
    ]);
  });

  test("Image opens on Size and shows object fit there", async () => {
    await panel(image);
    await styleTab();
    expect(sectionIds()).toEqual(["spacing", "size", "position", "border", "advanced"]);
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
      "position",
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

const openSection = async (id: string) => {
  const header = document.querySelector(`[data-emvb-section="${id}"]`) as HTMLElement;
  if (header.getAttribute("aria-expanded") !== "true") await act(async () => header.click());
};

const styleRows = (section: string) =>
  [
    ...(document
      .querySelector(`[data-emvb-section="${section}"]`)
      ?.parentElement?.querySelectorAll("[data-emvb-style]") ?? []),
  ].map((el) => el.getAttribute("data-emvb-style"));

const offsetsHelp = () => document.querySelector("[data-emvb-offsets-help]")?.textContent ?? null;

const box = (style?: StyleProps, classes?: string[]): LayoutNode => ({
  id: "boxx0001",
  type: "container",
  props: {},
  children: [],
  ...(style ? { style } : {}),
  ...(classes ? { classes } : {}),
});

const withClass = (style: StyleProps): DesignSystem => ({
  ...emptyDesign(),
  classes: [{ id: "pin", name: "Pin", style }],
});

describe("Position section (W-088)", () => {
  test("while static, offsets are hidden and a helper line explains why", async () => {
    await panel(box());
    await styleTab();
    await openSection("position");
    expect(styleRows("position")).toEqual(["position", "zIndex"]);
    expect(offsetsHelp()).toBe(
      "Offsets apply once Position is Relative, Absolute, Fixed or Sticky.",
    );
  });

  test("a local position other than static shows the four offsets", async () => {
    await panel(box({ position: "relative" }));
    await styleTab();
    await openSection("position");
    expect(styleRows("position")).toEqual(["position", "top", "right", "bottom", "left", "zIndex"]);
    expect(offsetsHelp()).toBeNull();
  });

  test("a position from a class on the element also shows the offsets", async () => {
    await panel(box(undefined, ["pin"]), withClass({ position: "sticky" }));
    await styleTab();
    await openSection("position");
    expect(styleRows("position")).toContain("top");
  });

  test("a local static position overrides the class's", async () => {
    await panel(box({ position: "static" }, ["pin"]), withClass({ position: "absolute" }));
    await styleTab();
    await openSection("position");
    expect(styleRows("position")).not.toContain("top");
  });

  test("editing a class uses the class's own position", async () => {
    await panel(box({ position: "relative" }, ["pin"]), withClass({}));
    await styleTab();
    const chip = document.querySelector(
      '[data-emvb-class-id="pin"] .emvb-chip-main',
    ) as HTMLButtonElement;
    await act(async () => chip.click());
    await openSection("position");
    expect(styleRows("position")).toEqual(["position", "zIndex"]);
  });

  test("a set offset stays visible while static", async () => {
    await panel(box({ top: { value: 4, unit: "px" } }));
    await styleTab();
    await openSection("position");
    expect(styleRows("position")).toEqual(["position", "top", "zIndex"]);
  });

  test("offsets take negative numbers, auto and a spacing variable", async () => {
    await row("top");
    const field = document.querySelector<HTMLInputElement>(".emvb-length input");
    await commitText(field, "-12");
    await commitText(field, "auto");
    expect(patches).toEqual([{ top: { value: -12, unit: "px" } }, { top: "auto" }]);
    expect(document.querySelector(".emvb-var-btn")?.getAttribute("aria-label")).toContain("Top");
  });

  test("an offset past -10000 is refused with its range", async () => {
    await row("left");
    await commitText(document.querySelector<HTMLInputElement>(".emvb-length input"), "-10001");
    expect(patches).toEqual([]);
    expect(document.body.textContent).toContain("Left can be from -10000 to 10000.");
  });

  test("Z-index saves whole numbers and refuses the rest", async () => {
    await row("zIndex");
    const field = () =>
      document.querySelector<HTMLInputElement>('[data-emvb-style="zIndex"] input');
    await commitText(field(), "1.5");
    expect(document.body.textContent).toContain("Z-index must be a whole number.");
    await commitText(field(), "10000");
    expect(document.body.textContent).toContain("Z-index can be from -9999 to 9999.");
    expect(field()?.getAttribute("aria-invalid")).toBe("true");
    await commitText(field(), "-5", "enter");
    expect(patches).toEqual([{ zIndex: -5 }]);
  });

  test("Z-index sends nothing when unchanged and clears when emptied", async () => {
    await row("zIndex", { zIndex: 3 });
    const field = () =>
      document.querySelector<HTMLInputElement>('[data-emvb-style="zIndex"] input');
    expect(field()?.value).toBe("3");
    await commitText(field(), "3");
    await commitText(field(), "");
    expect(patches).toEqual([{ zIndex: undefined }]);
  });
});

async function commitText(
  field: HTMLInputElement | null,
  text: string,
  finish: "blur" | "enter" = "blur",
) {
  await act(async () => {
    field?.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(field, text);
    field?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    if (finish === "enter") {
      field?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    } else {
      field?.blur();
    }
  });
}
