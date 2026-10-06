import { afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import {
  emptyDesign,
  type DesignSystem,
  type LayoutNode,
  type StyleProps,
} from "../../../../core/index.ts";
import { styleDeclarations } from "../../../../core/sanitize/css.ts";
import type { Fetcher } from "../../../api.ts";
import { cleanup, mount, settle } from "../../../../../test/dom/mount.ts";
import { ElementPanel } from "../ElementPanel.tsx";
import {
  BOX_GROUPS,
  linkedPatch,
  linkPatch,
  resetPatch,
  sidePatch,
  sideValues,
  unitPatch,
  type BoxGroup,
} from "./box-sides.ts";

const stubFetcher: Fetcher = async () => new Response("{}", { status: 200 });
const px = (value: number) => ({ value, unit: "px" as const });
const group = (id: string) => BOX_GROUPS.find((g) => g.id === id) as BoxGroup;

let nodes: LayoutNode[] = [];
afterEach(async () => {
  await cleanup();
  nodes = [];
});

function Harness({
  start,
  device,
  design = emptyDesign(),
}: {
  start: LayoutNode;
  device?: "desktop" | "tablet" | "mobile";
  design?: DesignSystem;
}) {
  const [node, set] = React.useState(start);
  return (
    <ElementPanel
      node={node}
      layout={{
        schemaVersion: 12,
        root: { id: "root0001", type: "container", props: {}, children: [node] },
      }}
      design={design}
      rejection={null}
      fetcher={stubFetcher}
      device={device}
      onChange={(next) => {
        nodes.push(next);
        set(next);
      }}
      onDesignChange={async () => undefined}
      onSelect={() => undefined}
    />
  );
}

const box = (style?: StyleProps): LayoutNode => ({
  id: "box00001",
  type: "container",
  props: {},
  children: [],
  ...(style ? { style } : {}),
});

async function panel(node: LayoutNode, device?: "desktop" | "tablet" | "mobile") {
  localStorage.setItem("emvb-style-sections:container", JSON.stringify(["spacing", "border"]));
  await mount(<Harness start={node} device={device} />);
  const tab = [...document.querySelectorAll('[role="tab"]')].find(
    (el) => el.textContent === "Style",
  ) as HTMLElement;
  await act(async () => tab.click());
}

const input = (label: string) =>
  document.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
const link = (id: string) =>
  document.querySelector(`[data-emvb-box-link="${id}"]`) as HTMLButtonElement;

async function type(label: string, text: string) {
  const field = input(label);
  await act(async () => {
    field.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => field.blur());
}

describe("linked four-box control (W-138)", () => {
  test("padding, margin, border width and radius each show four boxes and a pressed link", async () => {
    await panel(box());
    for (const id of ["padding", "margin", "borderWidth", "borderRadius"]) {
      const control = document.querySelector(`[data-emvb-box="${id}"]`);
      expect(control?.querySelectorAll("input[data-emvb-box-side]").length).toBe(4);
      expect(link(id).getAttribute("aria-pressed")).toBe("true");
    }
    expect(link("padding").getAttribute("aria-label")).toBe("Link padding sides");
    expect(link("borderRadius").getAttribute("aria-label")).toBe("Link radius corners");
    expect(input("Radius top left")).not.toBeNull();
    expect(document.querySelector('[data-emvb-style="paddingTop"]')).toBeNull();
  });

  test("linked, one value goes to all four sides in one change", async () => {
    await panel(box());
    await type("Padding right", "12");
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.style).toEqual({
      paddingTop: px(12),
      paddingRight: px(12),
      paddingBottom: px(12),
      paddingLeft: px(12),
    });
    expect(input("Padding left").value).toBe("12");
  });

  test("unlinked, a box sets only its side, and linking again copies the first value", async () => {
    await panel(
      box({ paddingTop: px(8), paddingRight: px(8), paddingBottom: px(8), paddingLeft: px(8) }),
    );
    await act(async () => link("padding").click());
    expect(link("padding").getAttribute("aria-pressed")).toBe("false");
    await type("Padding left", "20");
    expect(nodes.at(-1)?.style).toEqual({
      paddingTop: px(8),
      paddingRight: px(8),
      paddingBottom: px(8),
      paddingLeft: px(20),
    });
    expect(link("padding").getAttribute("aria-pressed")).toBe("false");
    await act(async () => link("padding").click());
    expect(link("padding").getAttribute("aria-pressed")).toBe("true");
    expect(nodes.at(-1)?.style?.paddingLeft).toEqual(px(8));
  });

  test("different sides open unlinked; border width per side beats the all-sides width", async () => {
    await panel(box({ borderWidth: px(1), borderTopWidth: px(4) }));
    expect(link("borderWidth").getAttribute("aria-pressed")).toBe("false");
    expect(input("Border top width").value).toBe("4");
    expect(input("Border left width").value).toBe("1");
    await type("Border bottom width", "2");
    expect(nodes.at(-1)?.style).toEqual({
      borderWidth: px(1),
      borderTopWidth: px(4),
      borderBottomWidth: px(2),
    });
    await act(async () => link("borderWidth").click());
    expect(nodes.at(-1)?.style).toEqual({ borderWidth: px(4) });
  });

  test("linked radius writes the one radius and drops the corners", async () => {
    await panel(box({ borderRadius: px(4) }));
    await type("Radius bottom right", "10");
    expect(nodes.at(-1)?.style).toEqual({ borderRadius: px(10) });
  });

  test("a bad value is refused with the length message and nothing changes", async () => {
    await panel(box());
    await type("Padding top", "-3");
    expect(nodes).toEqual([]);
    expect(document.querySelector('[data-emvb-box="padding"] [role="alert"]')?.textContent).toBe(
      "Padding top can't be negative. Enter 0 or more.",
    );
    expect(input("Padding top").getAttribute("aria-invalid")).toBe("true");
  });

  test("Reset clears the whole group", async () => {
    await panel(box({ marginTop: px(4), marginLeft: "auto", opacity: 0.5 }));
    const reset = document.querySelector(
      '[aria-label="Reset Margin to default"]',
    ) as HTMLButtonElement;
    expect(reset.disabled).toBe(false);
    await act(async () => reset.click());
    expect(nodes.at(-1)?.style).toEqual({ opacity: 0.5 });
  });

  test("on tablet the boxes edit the tablet styles", async () => {
    await panel(box({ paddingTop: px(30) }), "tablet");
    expect(input("Padding top").placeholder).toBe("30px");
    await type("Padding top", "10");
    expect(nodes.at(-1)?.style).toEqual({ paddingTop: px(30) });
    expect(nodes.at(-1)?.devices?.tablet).toEqual({
      paddingTop: px(10),
      paddingRight: px(10),
      paddingBottom: px(10),
      paddingLeft: px(10),
    });
  });

  test("in Hover the boxes edit the hover styles", async () => {
    await panel(box({ borderRadius: px(2) }));
    const hover = [
      ...document.querySelectorAll('[role="tablist"][aria-label="Style state"] [role="tab"]'),
    ].find((el) => el.textContent === "Hover") as HTMLElement;
    await act(async () => hover.click());
    expect(input("Radius top left").placeholder).toBe("2px");
    await act(async () => link("borderRadius").click());
    await type("Radius top left", "12");
    expect(nodes.at(-1)?.style).toEqual({ borderRadius: px(2) });
    expect(nodes.at(-1)?.states?.hover).toEqual({ borderTopLeftRadius: px(12) });
  });
});

describe("link state follows the values (W-149)", () => {
  test("unlinked and then Reset, the cleared group shows linked again", async () => {
    await panel(box({ paddingTop: px(4), paddingLeft: px(9) }));
    expect(link("padding").getAttribute("aria-pressed")).toBe("false");
    const reset = document.querySelector(
      '[aria-label="Reset Padding to default"]',
    ) as HTMLButtonElement;
    await act(async () => reset.click());
    expect(nodes.at(-1)?.style).toBeUndefined();
    expect(link("padding").getAttribute("aria-pressed")).toBe("true");
  });

  test("unlinking the element's own padding doesn't carry over to editing a class", async () => {
    localStorage.setItem("emvb-style-sections:container", JSON.stringify(["spacing", "border"]));
    const design: DesignSystem = {
      ...emptyDesign(),
      classes: [{ id: "card", name: "Card", style: {} }],
    };
    await mount(<Harness start={{ ...box(), classes: ["card"] }} design={design} />);
    const tab = [...document.querySelectorAll('[role="tab"]')].find(
      (el) => el.textContent === "Style",
    ) as HTMLElement;
    await act(async () => tab.click());
    await act(async () => link("padding").click());
    expect(link("padding").getAttribute("aria-pressed")).toBe("false");
    const chip = document.querySelector(
      '[data-emvb-class-id="card"] .emvb-chip-main',
    ) as HTMLButtonElement;
    await act(async () => chip.click());
    expect(link("padding").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("unit fields (W-151)", () => {
  const unitButton = (name: string) =>
    document.querySelector(`button[aria-label^="${name} unit ("]`) as HTMLButtonElement;
  async function openUnits(name: string) {
    await act(async () => unitButton(name).click());
    await settle();
  }

  test("typing 100% or 2rem sets that unit in the menu", async () => {
    localStorage.setItem(
      "emvb-style-sections:container",
      JSON.stringify(["spacing", "size", "border"]),
    );
    await mount(<Harness start={box()} />);
    const tab = [...document.querySelectorAll('[role="tab"]')].find(
      (el) => el.textContent === "Style",
    ) as HTMLElement;
    await act(async () => tab.click());
    await type("Width", "100%");
    expect(nodes.at(-1)?.style?.width).toEqual({ value: 100, unit: "%" });
    expect(unitButton("Width").textContent).toBe("%");
    expect(input("Width").value).toBe("100");
    await type("Padding top", "2rem");
    expect(unitButton("Padding").textContent).toBe("rem");
    expect(input("Padding left").value).toBe("2");
  });

  test("Margin says it takes auto, and its menu sets auto left and right", async () => {
    await panel(box({ marginTop: px(8) }));
    expect(input("Margin left").title).toContain("or auto");
    expect(input("Padding left").title).not.toContain("auto");
    await openUnits("Margin");
    const radios = document.querySelector('[data-emvb-unit-menu="margin"] [role="group"]');
    expect(radios?.getAttribute("aria-label")).toBe("Margin unit");
    const auto = document.querySelector(
      '[data-emvb-unit-menu="margin"] [data-emvb-unit-option="auto"]',
    ) as HTMLElement;
    expect(auto.getAttribute("role")).toBe("menuitem");
    await act(async () => auto.click());
    await settle();
    expect(nodes.at(-1)?.style).toEqual({
      marginTop: px(8),
      marginRight: "auto",
      marginLeft: "auto",
    });
    expect(input("Margin left").value).toBe("auto");
    expect(document.querySelector('[data-emvb-unit-menu="padding"]')).toBeNull();
  });
});

describe("four-box patches (W-138)", () => {
  test("a side falls back to the all-sides value", () => {
    expect(
      sideValues(group("borderWidth"), { borderWidth: px(1), borderLeftWidth: px(3) }),
    ).toEqual([px(1), px(1), px(1), px(3)]);
  });

  test("linked and side patches, reset, link and unit", () => {
    expect(linkedPatch(group("margin"), "auto")).toEqual({
      marginTop: "auto",
      marginRight: "auto",
      marginBottom: "auto",
      marginLeft: "auto",
    });
    expect(linkedPatch(group("borderRadius"), px(6))).toEqual({
      borderRadius: px(6),
      borderTopLeftRadius: undefined,
      borderTopRightRadius: undefined,
      borderBottomRightRadius: undefined,
      borderBottomLeftRadius: undefined,
    });
    expect(sidePatch(group("padding"), 2, px(5))).toEqual({ paddingBottom: px(5) });
    expect(Object.keys(resetPatch(group("borderWidth")))).toHaveLength(5);
    expect(linkPatch(group("padding"), { paddingBottom: px(7), paddingLeft: px(2) })).toEqual(
      linkedPatch(group("padding"), px(7)),
    );
    expect(
      unitPatch(group("borderRadius"), { borderRadius: px(4), borderTopLeftRadius: px(50) }, "%"),
    ).toEqual({
      borderRadius: { value: 4, unit: "%" },
      borderTopLeftRadius: { value: 50, unit: "%" },
    });
  });

  test("the all-sides CSS comes first, so a side or corner wins whatever the key order", () => {
    const { declarations } = styleDeclarations({
      borderTopWidth: px(4),
      borderWidth: px(1),
      borderBottomLeftRadius: px(9),
      borderRadius: px(2),
      borderLeftWidth: px(3),
    });
    expect(declarations).toEqual([
      { property: "border-width", value: "1px" },
      { property: "border-radius", value: "2px" },
      { property: "border-top-width", value: "4px" },
      { property: "border-end-start-radius", value: "9px" },
      { property: "border-inline-start-width", value: "3px" },
    ]);
  });
});
