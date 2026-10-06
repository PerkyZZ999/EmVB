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
        schemaVersion: 12,
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
      "gridColumnSpan",
      "gridRowSpan",
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
      "typography",
      "background",
      "border",
      "effects",
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
    expect(sectionIds()).toEqual(["spacing", "size", "position", "border", "effects", "advanced"]);
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
      "effects",
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

const numberInput = (key: string) =>
  document.querySelector<HTMLInputElement>(`input[data-emvb-number="${key}"]`);

describe("Effects section (W-088)", () => {
  test("Effects holds opacity, box shadow, filters, cursor and transition", () => {
    expect(keysFor("container", "effects")).toEqual([
      "opacity",
      "boxShadow",
      "filter",
      "cursor",
      "entrance",
      "transition",
    ]);
    expect(STYLE_UI.spacer?.sections).not.toContain("effects");
  });

  test("Opacity shows and takes percent, and stores 0 to 1", async () => {
    await row("opacity", { opacity: 0.25 });
    expect(numberInput("opacity")?.value).toBe("25");
    expect(document.body.textContent).toContain("Opacity (%)");
    await commitText(numberInput("opacity"), "101");
    expect(document.body.textContent).toContain("Opacity can be from 0 to 100.");
    await commitText(numberInput("opacity"), "50");
    expect(patches).toEqual([{ opacity: 0.5 }]);
  });

  test("Add shadow adds 0 4 12 0 at 18% black", async () => {
    await row("boxShadow");
    const add = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Add shadow",
    );
    await act(async () => add?.click());
    expect(patches).toEqual([
      { boxShadow: { x: 0, y: 4, blur: 12, spread: 0, color: "#0000002e" } },
    ]);
  });

  const lifted = { x: 0, y: 4, blur: 12, spread: 0, color: "#0000002e" };

  test("a set shadow edits X, Y, blur and spread, and keeps the rest", async () => {
    await row("boxShadow", { boxShadow: lifted });
    expect(numberInput("boxShadow.y")?.value).toBe("4");
    await commitText(numberInput("boxShadow.x"), "-3");
    await commitText(numberInput("boxShadow.blur"), "-1");
    expect(document.body.textContent).toContain("Blur can be from 0 to 1000.");
    expect(patches).toEqual([{ boxShadow: { ...lifted, x: -3 } }]);
  });

  test("Inset toggles on the Position select, and Outset drops the key", async () => {
    await row("boxShadow", { boxShadow: lifted });
    await choose("Position", "Inset");
    expect(patches).toEqual([{ boxShadow: { ...lifted, inset: true } }]);
    await row("boxShadow", { boxShadow: { ...lifted, inset: true } });
    await choose("Position", "Outset");
    expect(patches).toEqual([{ boxShadow: { ...lifted, inset: true } }, { boxShadow: lifted }]);
  });

  test("the shadow colour binds a colour variable, and Default drops it", async () => {
    const design = {
      ...emptyDesign(),
      variables: {
        ...emptyDesign().variables,
        colors: [{ id: "ink", name: "Ink", value: "#112233" }],
      },
    };
    await mount(
      <StyleRow
        styleKey="boxShadow"
        style={{ boxShadow: lifted }}
        design={design}
        onPatch={(patch) => patches.push(patch)}
        onDesignChange={async () => undefined}
      />,
    );
    await choose("Shadow color", "Ink");
    await choose("Shadow color", "Default");
    const { color: _drop, ...plain } = lifted;
    expect(patches).toEqual([
      { boxShadow: { ...lifted, color: { var: "ink" } } },
      { boxShadow: plain },
    ]);
  });

  test("the row's reset removes the shadow", async () => {
    await row("boxShadow", { boxShadow: lifted });
    const reset = document.querySelector<HTMLButtonElement>(
      '[aria-label="Reset Box shadow to default"]',
    );
    expect(reset?.disabled).toBe(false);
    await act(async () => reset?.click());
    expect(patches).toEqual([{ boxShadow: undefined }]);
  });

  test("each filter is its own row; clearing the last one unsets Filters", async () => {
    await row("filter");
    expect(
      [...document.querySelectorAll("input[data-emvb-number]")].map((el) =>
        el.getAttribute("data-emvb-number"),
      ),
    ).toEqual([
      "filter.blur",
      "filter.brightness",
      "filter.contrast",
      "filter.saturate",
      "filter.grayscale",
      "filter.hueRotate",
    ]);
    await commitText(numberInput("filter.hueRotate"), "400");
    expect(document.body.textContent).toContain("Hue rotation can be from 0 to 360.");
    await commitText(numberInput("filter.blur"), "4");
    expect(patches).toEqual([{ filter: { blur: 4 } }]);
    await row("filter", { filter: { blur: 4, grayscale: 50 } });
    await commitText(numberInput("filter.blur"), "");
    await row("filter", { filter: { grayscale: 50 } });
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="Reset Grayscale to default"]')
        ?.click(),
    );
    expect(patches.slice(1)).toEqual([{ filter: { grayscale: 50 } }, { filter: undefined }]);
  });

  test("Cursor saves the chosen keyword", async () => {
    await row("cursor");
    const options = await choose("Cursor", "Not allowed");
    expect(options).toContain("Zoom in");
    expect(patches).toEqual([{ cursor: "not-allowed" }]);
  });

  test("closed Effects counts Filters as one property", async () => {
    await panel(box({ opacity: 0.5, filter: { blur: 1, grayscale: 20 } }));
    await styleTab();
    expect(document.querySelector('[data-emvb-section="effects"] .emvb-count')?.textContent).toBe(
      " · 2",
    );
  });
});

describe("Transition (W-089)", () => {
  const set = { duration: 300, easing: "ease", property: "all" } as const;

  test("Add transition starts at 200 ms, Ease, All", async () => {
    await row("transition");
    const add = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Add transition",
    );
    await act(async () => add?.click());
    expect(patches).toEqual([{ transition: { duration: 200, easing: "ease", property: "all" } }]);
  });

  test("Duration and Delay are whole milliseconds from 0 to 2000", async () => {
    await row("transition", { transition: set });
    expect(document.body.textContent).toContain("Duration (ms)");
    expect(numberInput("transition.duration")?.value).toBe("300");
    await commitText(numberInput("transition.duration"), "2001");
    expect(document.body.textContent).toContain("Duration can be from 0 to 2000.");
    await commitText(numberInput("transition.duration"), "12.5");
    expect(document.body.textContent).toContain("Duration must be a whole number.");
    await commitText(numberInput("transition.duration"), "150");
    await commitText(numberInput("transition.delay"), "50");
    expect(patches).toEqual([
      { transition: { ...set, duration: 150 } },
      { transition: { ...set, delay: 50 } },
    ]);
  });

  test("Easing offers only the named curves", async () => {
    await row("transition", { transition: { ...set, delay: 40 } });
    expect(await choose("Easing", "Ease out")).toEqual([
      "Ease",
      "Ease in",
      "Ease out",
      "Ease in and out",
      "Linear",
    ]);
    expect(patches).toEqual([{ transition: { ...set, delay: 40, easing: "ease-out" } }]);
  });

  test("Applies to offers only the safe property groups", async () => {
    await row("transition", { transition: { ...set, delay: 40 } });
    expect(await choose("Applies to", "Colours")).toEqual([
      "All",
      "Colours",
      "Opacity",
      "Shadow",
      "Filters",
    ]);
    expect(patches).toEqual([{ transition: { ...set, delay: 40, property: "colors" } }]);
  });

  test("clearing Delay removes it, and reset removes the transition", async () => {
    await row("transition", { transition: { ...set, delay: 40 } });
    await commitText(numberInput("transition.delay"), "");
    const reset = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Reset Transition to default"]',
    );
    expect(reset?.disabled).toBe(false);
    await act(async () => reset?.click());
    expect(patches).toEqual([{ transition: set }, { transition: undefined }]);
  });
});

describe("Div Block layout controls (W-144)", () => {
  test("a Div Block offers no flex controls, only the grid spans; Flexbox keeps them", () => {
    expect(keysFor("div-block", "layout")).toEqual(["gridColumnSpan", "gridRowSpan"]);
    expect(keysFor("flexbox", "layout")).toEqual(
      expect.arrayContaining(["flexDirection", "justifyContent", "alignItems", "gap"]),
    );
  });

  test("a flex value already stored on a Div Block still shows, so it can be reset", () => {
    expect(keysFor("div-block", "layout", { gap: { value: 8, unit: "px" } })).toEqual([
      "gap",
      "gridColumnSpan",
      "gridRowSpan",
    ]);
  });
});

describe("Items layout (W-163)", () => {
  test("a flex box offers direction, alignment and gap; a grid does not offer direction", () => {
    expect(keysFor("container", "layout")).toEqual(
      expect.arrayContaining(["flexDirection", "flexWrap", "justifyContent", "alignItems", "gap"]),
    );
    expect(keysFor("text-input", "layout")).toEqual(
      expect.arrayContaining(["flexDirection", "justifyContent", "alignItems", "gap"]),
    );
    expect(STYLE_UI["text-input"]?.sections).toContain("layout");
    expect(keysFor("grid", "layout")).toEqual([
      "justifyContent",
      "alignItems",
      "gap",
      "gridColumnSpan",
      "gridRowSpan",
    ]);
    expect(keysFor("grid", "layout")).not.toContain("flexDirection");
    expect(keysFor("icon", "layout")).toEqual(
      expect.arrayContaining(["flexDirection", "justifyContent", "alignItems", "gap"]),
    );
    expect(keysFor("heading", "layout")).toEqual(["gridColumnSpan", "gridRowSpan"]);
    expect(keysFor("menu-item", "layout")).toEqual(["gridColumnSpan", "gridRowSpan"]);
    expect(keysFor("post-title", "layout")).toEqual(["gridColumnSpan", "gridRowSpan"]);
  });

  test("Direction, alignment and wrap are icon buttons, and the gap slider sets the length", async () => {
    await row("flexDirection");
    const rowButton = document.querySelector(
      '[data-emvb-choice="row"]',
    ) as HTMLButtonElement | null;
    expect(rowButton?.getAttribute("aria-checked")).toBe("false");
    await act(async () => rowButton?.click());
    expect(patches).toEqual([{ flexDirection: "row" }]);

    await cleanup();
    patches = [];
    await row("gap");
    const slider = document.querySelector('[aria-label="Gap slider"]') as HTMLInputElement | null;
    expect(slider?.value).toBe("0");
    slider?.focus();
    if (slider) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(slider, "20");
      await act(async () => {
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        slider.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
    expect(patches).toEqual([{ gap: { value: 20, unit: "px" } }]);
  });
});

describe("Container typography (W-159)", () => {
  test("a Container's Style tab has Typography with font family and colour", async () => {
    await panel(box());
    await styleTab();
    expect(sectionIds()).toContain("typography");
    await openSection("typography");
    expect(styleRows("typography")).toEqual(
      expect.arrayContaining(["fontFamily", "fontSize", "color", "lineHeight"]),
    );
  });
});
