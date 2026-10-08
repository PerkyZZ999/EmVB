import { afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { emptyDesign, type LayoutNode } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { ElementPanel } from "../ElementPanel.tsx";
import { keysFor, sectionsFor, STYLE_UI } from "./style-sections.ts";

// W-237: the Icon's Style tab opens on an Icon section: colour, glyph controls, hover duration.

const stubFetcher: Fetcher = async () => new Response("{}", { status: 200 });
let nodes: LayoutNode[] = [];

afterEach(async () => {
  await cleanup();
  localStorage.clear();
  nodes = [];
});

const star: LayoutNode = {
  id: "icon0001",
  type: "icon",
  props: { iconId: "star", title: "Star", size: 24 },
};

function Harness({ start }: { start: LayoutNode }) {
  const [node, set] = React.useState(start);
  return (
    <ElementPanel
      node={node}
      layout={{
        schemaVersion: 12,
        root: { id: "root0001", type: "container", props: {}, children: [node] },
      }}
      design={emptyDesign()}
      rejection={null}
      fetcher={stubFetcher}
      onChange={(next) => {
        nodes.push(next);
        set(next);
      }}
      onDesignChange={async () => undefined}
      onSelect={() => undefined}
    />
  );
}

async function panel(node: LayoutNode = star) {
  await mount(<Harness start={node} />);
  const tab = [...document.querySelectorAll('[role="tab"]')].find(
    (el) => el.textContent === "Style",
  ) as HTMLElement | undefined;
  await act(async () => tab?.click());
}

const rows = (section: string) => {
  const header = document.querySelector(`[data-emvb-section="${section}"]`);
  const body = header?.parentElement?.querySelector(".emvb-section-body");
  return [...(body?.querySelectorAll("[data-emvb-style]") ?? [])]
    .filter((el) => el.parentElement?.closest("[data-emvb-style]") === null)
    .map((el) => el.getAttribute("data-emvb-style"));
};

async function click(selector: string) {
  const el = document.querySelector<HTMLElement>(selector);
  await act(async () => el?.click());
}

async function commitText(field: HTMLInputElement | null, text: string) {
  await act(async () => {
    field?.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(field, text);
    field?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => field?.blur());
}

async function pickState(label: string) {
  const tab = [
    ...document.querySelectorAll('[role="tablist"][aria-label="Style state"] [role="tab"]'),
  ].find((el) => el.textContent === label) as HTMLElement | undefined;
  await act(async () => tab?.click());
}

describe("Icon section (W-237)", () => {
  test("sections: Icon first and open; Background and Border join; no Typography", () => {
    expect(STYLE_UI.icon?.sections[0]).toBe("icon");
    expect(STYLE_UI.icon?.defaultOpen).toBe("icon");
    expect(STYLE_UI.icon?.sections).toContain("background");
    expect(STYLE_UI.icon?.sections).toContain("border");
    expect(STYLE_UI.icon?.sections).not.toContain("typography");
  });

  test("Colour leads and Transition ends the Icon section; other sections leave them out", () => {
    expect(keysFor("icon", "icon")).toEqual([
      "color",
      "iconRotate",
      "iconFlip",
      "iconScale",
      "iconStrokeWidth",
      "iconShadow",
      "iconAnimation",
      "transition",
    ]);
    expect(keysFor("icon", "effects")).not.toContain("transition");
    expect(keysFor("icon", "typography", { color: "#ff0000" })).not.toContain("color");
    expect(sectionsFor(STYLE_UI.icon?.sections ?? [], { color: "#ff0000" }, "icon")).not.toContain(
      "typography",
    );
    // Other types never get the glyph keys.
    expect(keysFor("button", "icon")).toEqual([]);
    expect(keysFor("heading", "effects")).toContain("transition");
  });

  test("the panel opens on the Icon section with its rows in order", async () => {
    await panel();
    expect(rows("icon")).toEqual([
      "color",
      "iconRotate",
      "iconFlip",
      "iconScale",
      "iconStrokeWidth",
      "iconShadow",
      "iconAnimation",
      "transition",
    ]);
  });

  test("Flip is two toggles stored as one value", async () => {
    await panel();
    await click('[data-emvb-flip="horizontal"]');
    expect(nodes.at(-1)?.style).toEqual({ iconFlip: "horizontal" });
    await click('[data-emvb-flip="vertical"]');
    expect(nodes.at(-1)?.style).toEqual({ iconFlip: "both" });
    await click('[data-emvb-flip="horizontal"]');
    expect(nodes.at(-1)?.style).toEqual({ iconFlip: "vertical" });
    await click('[data-emvb-flip="vertical"]');
    expect(nodes.at(-1)?.style).toEqual({ iconFlip: "none" });
  });

  test("Rotate takes a number or the slider; Add drop shadow starts soft", async () => {
    await panel();
    await commitText(document.querySelector('input[data-emvb-number="iconRotate"]'), "-90");
    expect(nodes.at(-1)?.style).toEqual({ iconRotate: -90 });
    await commitText(document.querySelector('input[data-emvb-number="iconRotate"]'), "400");
    expect(document.querySelector('[data-emvb-style="iconRotate"]')?.textContent).toContain(
      "Rotate can be from -360 to 360.",
    );
    const slider = document.querySelector<HTMLInputElement>('input[aria-label="Rotate slider"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(slider, "180");
      slider?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(nodes.at(-1)?.style?.iconRotate).toBe(180);
    await click('[data-emvb-style="iconShadow"] .emvb-add-shadow');
    expect(nodes.at(-1)?.style?.iconShadow).toEqual({ x: 0, y: 2, blur: 4, color: "#00000040" });
  });

  test("in Hover, Animation and Transition are hidden and Rotate edits the hover value", async () => {
    await panel({ ...star, style: { iconRotate: 10 } });
    await pickState("Hover");
    expect(rows("icon")).toEqual([
      "color",
      "iconRotate",
      "iconFlip",
      "iconScale",
      "iconStrokeWidth",
      "iconShadow",
    ]);
    const rotate = document.querySelector<HTMLInputElement>('input[data-emvb-number="iconRotate"]');
    expect(document.querySelector("[data-emvb-icon-shape]")).toBeNull();
    expect(rotate?.placeholder).toBe("10");
    await commitText(rotate, "45");
    expect(nodes.at(-1)?.states).toEqual({ hover: { iconRotate: 45 } });
    expect(nodes.at(-1)?.style).toEqual({ iconRotate: 10 });
  });

  test("a fill icon offers no Stroke width unless one is already set", async () => {
    const fill: LayoutNode = {
      ...star,
      props: {
        ...star.props,
        iconId: "fa-solid:square",
        iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M0 0h24v24H0z"/></svg>',
      },
    };
    await panel(fill);
    expect(rows("icon")).not.toContain("iconStrokeWidth");
    await cleanup();
    await panel({ ...fill, style: { iconStrokeWidth: 3 } });
    expect(rows("icon")).toContain("iconStrokeWidth");
  });
});

describe("Force single colour and Shape (W-238)", () => {
  const upload: LayoutNode = {
    ...star,
    props: {
      ...star.props,
      iconId: "upload:abc",
      iconSvg: '<svg viewBox="0 0 24 24"><path d="M0 0h4" fill="#e11d48"/></svg>',
    },
  };

  test("Animation shows its label, not the stored value", async () => {
    await panel();
    const trigger = () =>
      document.querySelector('[data-emvb-style="iconAnimation"] button')?.textContent ?? "";
    expect(trigger()).toContain("None");
    expect(trigger()).not.toContain("none");
    await cleanup();
    await panel({ ...star, style: { iconAnimation: { type: "pulse", duration: 900 } } });
    expect(trigger()).toContain("Pulse");
  });

  test("Force single color shows under Colour for a multi-colour SVG and sets the prop", async () => {
    await panel(upload);
    const toggle = () =>
      document.querySelector<HTMLElement>('[data-emvb-icon-single-color] [role="switch"]');
    expect(toggle()).not.toBeNull();
    await act(async () => toggle()?.click());
    expect(nodes.at(-1)?.props).toMatchObject({ singleColor: true });
    await act(async () => toggle()?.click());
    expect(nodes.at(-1)?.props).not.toHaveProperty("singleColor");
  });

  test("it's not offered for a currentColor icon, nor in Hover", async () => {
    await panel();
    expect(document.querySelector("[data-emvb-icon-single-color]")).toBeNull();
    await cleanup();
    await panel(upload);
    await pickState("Hover");
    expect(document.querySelector("[data-emvb-icon-single-color]")).toBeNull();
  });

  test("Shape: Circle adds a background, 50% radius and padding; None takes them away", async () => {
    await panel();
    expect(
      document.querySelector("[data-emvb-icon-shape]")?.getAttribute("data-emvb-icon-shape"),
    ).toBe("none");
    await click('[data-emvb-icon-shape] [data-emvb-choice="circle"]');
    const px12 = { value: 12, unit: "px" } as const;
    expect(nodes.at(-1)?.style).toEqual({
      backgroundColor: "#f1f5f9",
      borderRadius: { value: 50, unit: "%" },
      paddingTop: px12,
      paddingRight: px12,
      paddingBottom: px12,
      paddingLeft: px12,
    });
    expect(
      document.querySelector("[data-emvb-icon-shape]")?.getAttribute("data-emvb-icon-shape"),
    ).toBe("circle");
    await click('[data-emvb-icon-shape] [data-emvb-choice="rounded"]');
    expect(nodes.at(-1)?.style?.borderRadius).toEqual({ value: 12, unit: "px" });
    await click('[data-emvb-icon-shape] [data-emvb-choice="none"]');
    expect(nodes.at(-1)?.style ?? {}).toEqual({});
  });

  test("a shape keeps a colour and padding already set", async () => {
    const px4 = { value: 4, unit: "px" } as const;
    await panel({ ...star, style: { backgroundColor: "#111111", paddingTop: px4 } });
    await click('[data-emvb-icon-shape] [data-emvb-choice="square"]');
    expect(nodes.at(-1)?.style).toEqual({
      backgroundColor: "#111111",
      paddingTop: px4,
      borderRadius: { value: 0, unit: "px" },
    });
  });
});
