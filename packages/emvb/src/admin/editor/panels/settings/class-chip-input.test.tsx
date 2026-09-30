import { afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { emptyDesign, type DesignSystem, type LayoutNode } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { ElementPanel } from "../ElementPanel.tsx";
import { ClassChipInput } from "./ClassChipInput.tsx";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";

const stubFetcher: Fetcher = async () => new Response("{}", { status: 200 });

afterEach(async () => {
  await cleanup();
  sessionStorage.clear();
});

const design: DesignSystem = {
  ...emptyDesign(),
  classes: [
    { id: "card", name: "Card", style: { paddingTop: { value: 8, unit: "px" as const } } },
    { id: "accent", name: "Accent", style: { color: "#ff0000" } },
    { id: "hero-title", name: "Hero title", style: {} },
  ],
};

const layout = {
  schemaVersion: 1 as const,
  root: {
    id: "root0001",
    type: "container" as const,
    props: {},
    children: [
      { id: "head0001", type: "heading" as const, props: { text: "Hi", level: 1 as const } },
    ],
  },
};

type Log = { classes: Array<string[] | undefined>; designs: DesignSystem[] };

function Harness({
  initial,
  start = design,
  log,
  failSave,
}: {
  initial?: string[];
  start?: DesignSystem;
  log: Log;
  failSave?: string;
}) {
  const [classes, setClasses] = React.useState(initial);
  const [current, setCurrent] = React.useState(start);
  return (
    <ClassChipInput
      applied={classes}
      design={current}
      onChange={(next) => {
        log.classes.push(next);
        setClasses(next);
      }}
      onDesignChange={async (next) => {
        if (failSave) throw new Error(failSave);
        log.designs.push(next);
        setCurrent(next);
      }}
    />
  );
}

const newLog = (): Log => ({ classes: [], designs: [] });
const input = () => document.querySelector("[data-emvb-class-input]") as HTMLInputElement;
const chipIds = () =>
  [...document.querySelectorAll("[data-emvb-class-id]")].map((el) =>
    el.getAttribute("data-emvb-class-id"),
  );
const optionIds = () =>
  [...document.querySelectorAll('[role="option"]')].map((el) =>
    el.getAttribute("data-emvb-class-option"),
  );
const chipButton = (id: string) =>
  document.querySelector(`[data-emvb-class-id="${id}"] .emvb-chip-main`) as HTMLButtonElement;
const localButton = () =>
  document.querySelector("[data-emvb-chip-local] .emvb-chip-main") as HTMLButtonElement;

async function type(text: string) {
  const field = input();
  await act(async () => {
    field.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function press(target: HTMLElement, key: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
  });
}

describe("class chip input: chips (W-087)", () => {
  test("shows Local first, then the applied classes in cascade order, by name", async () => {
    await mount(<Harness initial={["accent", "card"]} log={newLog()} />);
    expect(localButton().textContent).toBe("Local");
    expect(localButton().getAttribute("aria-pressed")).toBe("true");
    expect(chipIds()).toEqual(["accent", "card"]);
    expect(chipButton("accent").textContent).toBe("Accent");
    expect(chipButton("accent").title).toContain(".emvb-k-accent");
    expect(input().getAttribute("placeholder")).toBe("Add class…");
  });

  test("× removes a class, and the last one clears node.classes", async () => {
    const log = newLog();
    await mount(<Harness initial={["accent", "card"]} log={log} />);
    const x = () => document.querySelector('[aria-label="Remove Accent"]') as HTMLButtonElement;
    await act(async () => x().click());
    expect(chipIds()).toEqual(["card"]);
    const y = document.querySelector('[aria-label="Remove Card"]') as HTMLButtonElement;
    await act(async () => y.click());
    expect(log.classes.at(-1)).toBeUndefined();
    expect(chipIds()).toEqual([]);
  });
});

describe("class chip input: adding (W-087)", () => {
  test("focus lists the classes not applied; typing filters them", async () => {
    await mount(<Harness initial={["accent"]} log={newLog()} />);
    await act(async () => input().focus());
    expect(input().getAttribute("aria-expanded")).toBe("true");
    expect(optionIds()).toEqual(["card", "hero-title"]);
    await type("her");
    expect(optionIds()).toEqual(["hero-title", "create"]);
  });

  test("Enter adds the highlighted suggestion and clears the text", async () => {
    const log = newLog();
    await mount(<Harness log={log} />);
    await type("ca");
    await press(input(), "Enter");
    expect(log.classes.at(-1)).toEqual(["card"]);
    expect(input().value).toBe("");
    expect(log.designs).toEqual([]);
  });

  test("Arrow Down moves the highlight, tracked by aria-activedescendant", async () => {
    const log = newLog();
    await mount(<Harness log={log} />);
    await act(async () => input().focus());
    await press(input(), "ArrowDown");
    const active = input().getAttribute("aria-activedescendant");
    const selected = document.querySelector('[role="option"][aria-selected="true"]');
    expect(selected?.id).toBe(active ?? "missing");
    expect(selected?.getAttribute("data-emvb-class-option")).toBe("accent");
    await press(input(), "Enter");
    expect(log.classes.at(-1)).toEqual(["accent"]);
  });

  test("clicking a suggestion adds it", async () => {
    const log = newLog();
    await mount(<Harness log={log} />);
    await act(async () => input().focus());
    const option = document.querySelector('[data-emvb-class-option="hero-title"]') as HTMLElement;
    await act(async () => option.click());
    expect(log.classes.at(-1)).toEqual(["hero-title"]);
  });

  test("Enter with a new name creates the class site-wide, then applies it", async () => {
    const log = newLog();
    await mount(<Harness initial={["card"]} log={log} />);
    await type("  Big button ");
    expect(optionIds()).toEqual(["create"]);
    await press(input(), "Enter");
    expect(log.designs).toHaveLength(1);
    expect(log.designs[0]?.classes?.at(-1)).toEqual({
      id: "big-button",
      name: "Big button",
      style: {},
    });
    expect(log.classes.at(-1)).toEqual(["card", "big-button"]);
    expect(chipButton("big-button").textContent).toBe("Big button");
    expect(input().value).toBe("");
  });

  test("a failed create shows the error and applies nothing", async () => {
    const log = newLog();
    await mount(<Harness log={log} failSave="Site styles were changed somewhere else." />);
    await type("Fresh");
    await press(input(), "Enter");
    expect(log.classes).toEqual([]);
    expect(document.querySelector("[data-emvb-class-error]")?.textContent).toBe(
      "Site styles were changed somewhere else.",
    );
    expect(input().value).toBe("Fresh");
  });

  test("Enter on the name of a class already applied says so and changes nothing", async () => {
    const log = newLog();
    await mount(<Harness initial={["card"]} log={log} />);
    await type("card");
    await press(input(), "Enter");
    expect(log.classes).toEqual([]);
    expect(log.designs).toEqual([]);
    expect(document.querySelector("[data-emvb-class-error]")?.textContent).toBe(
      '"card" is already on this element.',
    );
  });

  test("with no classes yet, the list explains how to create one", async () => {
    await mount(<Harness start={emptyDesign()} log={newLog()} />);
    await act(async () => input().focus());
    expect(document.querySelector(".emvb-chip-option-hint")?.textContent).toBe(
      "No classes yet. Type a name to create one.",
    );
  });

  test("at 20 classes the input is disabled with a helper line", async () => {
    const many = Array.from({ length: 20 }, (_, i) => `c${i}`);
    const big = { ...emptyDesign(), classes: many.map((id) => ({ id, name: id, style: {} })) };
    await mount(<Harness initial={many} start={big} log={newLog()} />);
    expect(input().disabled).toBe(true);
    expect(document.querySelector("[data-emvb-cascade-caption]")?.textContent).toBe(
      "20 classes is the most one element can have.",
    );
  });
});

describe("class chip input: keyboard (W-087)", () => {
  test("Escape closes the suggestions, then clears the text", async () => {
    await mount(<Harness log={newLog()} />);
    await type("ca");
    await press(input(), "Escape");
    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    await press(input(), "Escape");
    expect(input().value).toBe("");
  });

  test("Backspace in the empty input removes the last class", async () => {
    const log = newLog();
    await mount(<Harness initial={["card", "accent"]} log={log} />);
    await act(async () => input().focus());
    await press(input(), "Backspace");
    expect(log.classes.at(-1)).toEqual(["card"]);
  });

  test("Arrow keys walk Local, the chips and the input", async () => {
    await mount(<Harness initial={["card", "accent"]} log={newLog()} />);
    await act(async () => input().focus());
    await press(input(), "ArrowLeft");
    expect(document.activeElement).toBe(chipButton("accent"));
    await press(chipButton("accent"), "ArrowLeft");
    expect(document.activeElement).toBe(chipButton("card"));
    await press(chipButton("card"), "ArrowLeft");
    expect(document.activeElement).toBe(localButton());
    await press(localButton(), "End");
    expect(document.activeElement).toBe(input());
    await press(chipButton("card"), "ArrowRight");
    expect(document.activeElement).toBe(chipButton("accent"));
    await press(chipButton("accent"), "ArrowRight");
    expect(document.activeElement).toBe(input());
  });

  test("Backspace on a chip removes it and focuses the one before; Delete focuses the next", async () => {
    const log = newLog();
    await mount(<Harness initial={["card", "accent", "hero-title"]} log={log} />);
    await act(async () => chipButton("accent").focus());
    await press(chipButton("accent"), "Backspace");
    expect(log.classes.at(-1)).toEqual(["card", "hero-title"]);
    expect(document.activeElement).toBe(chipButton("card"));
    await press(chipButton("card"), "Delete");
    expect(log.classes.at(-1)).toEqual(["hero-title"]);
    expect(document.activeElement).toBe(chipButton("hero-title"));
  });

  test("Backspace on the Local chip removes nothing", async () => {
    const log = newLog();
    await mount(<Harness initial={["card"]} log={log} />);
    await press(localButton(), "Backspace");
    expect(log.classes).toEqual([]);
  });

  test("keys handled in the box don't reach the editor's window shortcuts", async () => {
    const seen: string[] = [];
    const listener = (event: KeyboardEvent) => seen.push(event.key);
    window.addEventListener("keydown", listener);
    try {
      await mount(<Harness initial={["card", "accent"]} log={newLog()} />);
      await press(chipButton("accent"), "Backspace");
      await press(chipButton("card"), "ArrowLeft", { altKey: true });
      await press(input(), "Escape");
      expect(seen).toEqual([]);
    } finally {
      window.removeEventListener("keydown", listener);
    }
  });
});

describe("class chip input in the element panel (W-031, W-087)", () => {
  test("Alt+Arrow reorders the cascade, and the order persists", async () => {
    let current: LayoutNode = {
      id: "head0001",
      type: "heading",
      props: { text: "Hi", level: 1 },
      classes: ["card", "accent"],
    };
    const panel = () => (
      <ElementPanel
        node={current}
        layout={layout}
        design={design}
        rejection={null}
        fetcher={stubFetcher}
        onChange={(node) => {
          current = node;
        }}
        onDesignChange={async () => undefined}
        onSelect={() => undefined}
      />
    );
    await mount(panel());
    const styleTab = [...document.querySelectorAll('[role="tab"]')].find(
      (t) => t.textContent === "Style",
    ) as HTMLElement;
    await act(async () => styleTab.click());
    expect(document.querySelector("[data-emvb-cascade-caption]")?.textContent).toMatch(/override/);
    expect(chipIds()).toEqual(["card", "accent"]);
    await press(chipButton("accent"), "ArrowLeft", { altKey: true });
    expect(current.classes).toEqual(["accent", "card"]);
    await mount(panel());
    const again = [...document.querySelectorAll('[role="tab"]')].find(
      (t) => t.textContent === "Style",
    ) as HTMLElement;
    await act(async () => again.click());
    expect(chipIds()).toEqual(["accent", "card"]);
  });
});
