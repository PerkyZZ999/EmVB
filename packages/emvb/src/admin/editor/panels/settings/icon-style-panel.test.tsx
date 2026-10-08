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
