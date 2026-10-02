import { afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { emptyDesign, type DesignSystem, type LayoutNode } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { ElementPanel } from "../ElementPanel.tsx";
import type { StyleStateChoice } from "./StateSwitcher.tsx";

const stubFetcher: Fetcher = async () => new Response("{}", { status: 200 });

afterEach(async () => {
  await cleanup();
  sessionStorage.clear();
});

const baseButton: LayoutNode = {
  id: "btn00001",
  type: "button",
  props: { text: "Go", href: "/go" },
  style: { opacity: 0.9, cursor: "pointer", width: { value: 120, unit: "px" } },
};

const card = (states?: object): DesignSystem => ({
  ...emptyDesign(),
  classes: [{ id: "card", name: "Card", style: { opacity: 0.7 }, ...(states ? { states } : {}) }],
});

let nodes: LayoutNode[] = [];
let designs: DesignSystem[] = [];
let reported: Array<[string, StyleStateChoice]> = [];
afterEach(() => {
  nodes = [];
  designs = [];
  reported = [];
});

let setNode: (node: LayoutNode) => void = () => undefined;

function Harness({ start, design: startDesign }: { start: LayoutNode; design: DesignSystem }) {
  const [node, set] = React.useState(start);
  const [design, setDesign] = React.useState(startDesign);
  setNode = set;
  return (
    <ElementPanel
      node={node}
      layout={{
        schemaVersion: 7,
        root: { id: "root0001", type: "container", props: {}, children: [node] },
      }}
      design={design}
      rejection={null}
      fetcher={stubFetcher}
      onChange={(next) => {
        nodes.push(next);
        set(next);
      }}
      onDesignChange={async (next) => {
        designs.push(next);
        setDesign(next);
      }}
      onSelect={() => undefined}
      onStyleState={(id, state) => reported.push([id, state])}
    />
  );
}

const open = (...sections: string[]) =>
  sessionStorage.setItem("emvb-style-sections:button", JSON.stringify(sections));

async function panel(node: LayoutNode = baseButton, design: DesignSystem = emptyDesign()) {
  await mount(<Harness start={node} design={design} />);
  const style = [...document.querySelectorAll('[role="tab"]')].find(
    (el) => el.textContent === "Style",
  ) as HTMLElement | undefined;
  await act(async () => style?.click());
}

const stateTabs = () => [
  ...document.querySelectorAll('[role="tablist"][aria-label="Style state"] [role="tab"]'),
];

async function pick(label: string) {
  const tab = stateTabs().find((el) => el.textContent === label) as HTMLElement | undefined;
  await act(async () => tab?.click());
}

const numberInput = (key: string) =>
  document.querySelector<HTMLInputElement>(`input[data-emvb-number="${key}"]`);

async function commitText(field: HTMLInputElement | null, text: string) {
  await act(async () => {
    field?.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(field, text);
    field?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => field?.blur());
}

const helper = () => document.querySelector("[data-emvb-state-help]")?.textContent ?? null;

describe("style state switcher (W-089)", () => {
  test("Normal | Hover | Focus | Active, named Style state, starting at Normal", async () => {
    await panel();
    expect(stateTabs().map((t) => t.textContent)).toEqual(["Normal", "Hover", "Focus", "Active"]);
    expect(stateTabs()[0]?.getAttribute("aria-selected")).toBe("true");
    expect(helper()).toBeNull();
    await pick("Focus");
    expect(helper()).toBe("Editing Focus for this element");
    expect(reported.at(-1)).toEqual(["btn00001", "focus"]);
  });

  test("in Hover, a row edits the hover value and shows the Normal value as its placeholder", async () => {
    open("effects");
    await panel();
    await pick("Hover");
    expect(numberInput("opacity")?.value).toBe("");
    expect(numberInput("opacity")?.placeholder).toBe("90");
    expect(document.querySelector('[data-emvb-style="opacity"]')?.getAttribute("data-set")).toBe(
      null,
    );
    await commitText(numberInput("opacity"), "50");
    expect(nodes.at(-1)?.style).toEqual(baseButton.style);
    expect(nodes.at(-1)?.states).toEqual({ hover: { opacity: 0.5 } });
    expect(document.querySelector('[data-emvb-style="opacity"]')?.getAttribute("data-set")).toBe(
      "true",
    );
  });

  test("a select shows the Normal choice, marked as inherited", async () => {
    open("effects");
    await panel();
    await pick("Active");
    const row = document.querySelector('[data-emvb-style="cursor"]');
    expect(row?.getAttribute("data-inherited")).toBe("true");
    expect(row?.querySelector('[role="combobox"]')?.textContent).toContain("Pointer");
  });

  test("reset in a state clears only that value, and an empty state is dropped", async () => {
    open("effects");
    await panel({ ...baseButton, states: { hover: { opacity: 0.5 }, active: { opacity: 0.2 } } });
    await pick("Hover");
    const reset = document.querySelector<HTMLButtonElement>(
      '[data-emvb-style="opacity"] button[aria-label="Reset Opacity to default"]',
    );
    await act(async () => reset?.click());
    expect(nodes.at(-1)?.style).toEqual(baseButton.style);
    expect(nodes.at(-1)?.states).toEqual({ active: { opacity: 0.2 } });
  });

  test("section counts count the chosen state's values", async () => {
    open();
    await panel({ ...baseButton, states: { hover: { opacity: 0.5, cursor: "grab" } } });
    const count = () =>
      document.querySelector('[data-emvb-section="effects"] .emvb-count')?.textContent;
    expect(count()).toBe(" · 2");
    await pick("Hover");
    expect(count()).toBe(" · 2");
    await pick("Focus");
    expect(count()).toBeUndefined();
  });

  test("Transition is offered only in Normal", async () => {
    open("effects");
    await panel();
    expect(Boolean(document.querySelector('[data-emvb-style="transition"]'))).toBe(true);
    await pick("Hover");
    expect(Boolean(document.querySelector('[data-emvb-style="transition"]'))).toBe(false);
  });

  test("Size, Layout and Position warn that a state change can make the page jump", async () => {
    open("size", "effects");
    await panel();
    expect(Boolean(document.querySelector("[data-emvb-jump-help]"))).toBe(false);
    await pick("Hover");
    const help = [...document.querySelectorAll("[data-emvb-jump-help]")];
    expect(help.map((p) => p.textContent)).toEqual([
      "Changing size or position on hover can make the page jump.",
    ]);
    expect(
      Boolean(help[0]?.closest(".emvb-section-body")?.querySelector('[data-emvb-style="width"]')),
    ).toBe(true);
  });

  test("editing a class state saves the class, not the element", async () => {
    open("effects");
    await panel({ ...baseButton, classes: ["card"] }, card());
    const chip = document.querySelector<HTMLButtonElement>(
      '[data-emvb-class-id="card"] .emvb-chip-main',
    );
    await act(async () => chip?.click());
    await pick("Hover");
    expect(helper()).toBe('Editing Hover for class "Card"');
    expect(numberInput("opacity")?.placeholder).toBe("70");
    await commitText(numberInput("opacity"), "40");
    expect(nodes).toEqual([]);
    expect(designs.at(-1)?.classes?.[0]).toEqual({
      id: "card",
      name: "Card",
      style: { opacity: 0.7 },
      states: { hover: { opacity: 0.4 } },
    });
  });

  test("a new selection starts at Normal again", async () => {
    await panel();
    await pick("Active");
    await act(async () => setNode({ ...baseButton, id: "btn00002" }));
    const style = [...document.querySelectorAll('[role="tab"]')].find(
      (el) => el.textContent === "Style",
    ) as HTMLElement | undefined;
    await act(async () => style?.click());
    expect(stateTabs()[0]?.getAttribute("aria-selected")).toBe("true");
    expect(helper()).toBeNull();
    expect(reported.at(-1)).toEqual(["btn00002", "normal"]);
  });

  test("dots mark the states and sections that have values", async () => {
    open();
    await panel({ ...baseButton, states: { focus: { opacity: 0.5 } } });
    const dotted = stateTabs()
      .filter((t) => t.querySelector(".emvb-state-dot"))
      .map((t) => t.textContent);
    expect(dotted).toEqual(["Focus"]);
    const sectionDot = (id: string) =>
      document.querySelector(`[data-emvb-section="${id}"] [aria-label="Has state styles"]`);
    expect(Boolean(sectionDot("effects"))).toBe(true);
    expect(Boolean(sectionDot("size"))).toBe(false);
    await pick("Focus");
    expect(Boolean(sectionDot("effects"))).toBe(false);
  });

  test("the class chip shows a dot when the class has state styles", async () => {
    await panel({ ...baseButton, classes: ["card"] }, card({ hover: { opacity: 0.4 } }));
    expect(
      Boolean(
        document.querySelector(
          '[data-emvb-class-id="card"] .emvb-chip-main [aria-label="Has state styles"]',
        ),
      ),
    ).toBe(true);
    await panel({ ...baseButton, classes: ["card"] }, card());
    expect(
      Boolean(
        document.querySelector(
          '[data-emvb-class-id="card"] .emvb-chip-main [aria-label="Has state styles"]',
        ),
      ),
    ).toBe(false);
  });
});
