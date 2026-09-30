import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { DesignSystem, Layout, VariableKind } from "../../../core/index.ts";
import { ClassesSection } from "./ClassesSection.tsx";
import { VariableSection } from "./VariableSection.tsx";
import { cleanup, mount as mountTree, settle } from "../../../../test/dom/mount.ts";

// Snapshots were recorded from both sections before W-086 M5 shared their pieces.
let host: HTMLElement;
let saved: DesignSystem[] = [];
let asked: string[] = [];
afterEach(async () => {
  await cleanup();
  saved = [];
  asked = [];
});

const px = (value: number) => ({ value, unit: "px" as const });
const design: DesignSystem = {
  schemaVersion: 3,
  variables: {
    colors: [
      { id: "brand", name: "Brand", value: "#112233" },
      { id: "ink", name: "Ink", value: "#000000" },
      { id: "paper", name: "Paper", value: "#ffffff" },
      { id: "accent", name: "Accent", value: "#ff0000" },
    ],
    fonts: [{ id: "brand", name: "Brand", value: "Inter, sans-serif" }],
    fontSizes: [
      { id: "brand", name: "Brand", value: px(20) },
      { id: "small", name: "Small", value: px(12) },
      { id: "big", name: "Big", value: px(32) },
      { id: "huge", name: "Huge", value: px(48) },
    ],
    spacings: [{ id: "brand", name: "Brand", value: px(8) }],
  },
  classes: [
    { id: "card", name: "Card", style: { color: "#112233" } },
    { id: "hero", name: "Hero", style: {} },
    { id: "note", name: "Note", style: {} },
    { id: "badge", name: "Badge", style: {} },
  ],
};

const layout: Layout = {
  schemaVersion: 3,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "head0001", type: "heading", props: { text: "Hi", level: 1 }, classes: ["card"] },
    ],
  },
} as Layout;

/** The section's HTML with generated element ids numbered by first appearance. */
function html() {
  const ids = new Map<string, string>();
  return host.innerHTML.replace(/base-ui-[\w-]+|_r_[0-9a-z]+_/g, (id) => {
    if (!ids.has(id)) ids.set(id, `id-${ids.size}`);
    return ids.get(id) ?? id;
  });
}

async function mount(element: React.ReactElement) {
  host = await mountTree(element);
}

const onSave = async (next: DesignSystem) => {
  saved.push(next);
};
const onAskDelete = (id: string, name: string) => asked.push(`${id}:${name}`);

const inputs = (label: string) =>
  [...host.querySelectorAll("label")]
    .filter((l) => l.textContent === label)
    .map((l) => (l.htmlFor ? host.querySelector<HTMLInputElement>(`[id="${l.htmlFor}"]`) : null))
    .filter((i): i is HTMLInputElement => Boolean(i));

async function type(field: HTMLInputElement | undefined, value: string) {
  expect(field).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, value);
    field?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(match: (b: HTMLButtonElement) => boolean) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(match);
  expect(button).toBeTruthy();
  await act(async () => button?.click());
}
const byText = (text: string) => (b: HTMLButtonElement) => b.textContent === text;
const byLabel = (text: string) => (b: HTMLButtonElement) => b.getAttribute("aria-label") === text;

const KINDS: [VariableKind, string, string][] = [
  ["color", "#abcdef", "Colors"],
  ["font", "Georgia, serif", "Fonts"],
  ["fontSize", "18", "Font sizes"],
  ["spacing", "24", "Spacing"],
];

const menuItem = (label: string) =>
  [...document.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent === label) as
    | HTMLElement
    | undefined;

async function pick(menu: string, label: string) {
  await click(byLabel(menu));
  await settle();
  const item = menuItem(label);
  expect(item?.textContent ?? null).toBe(label);
  await act(async () => item?.click());
  await settle();
}

/** Rename from a menu starts on the frame after the menu closes. */
const nextFrame = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });

const renameField = () => host.querySelector<HTMLInputElement>(".emvb-site-rename");

async function press(target: Element | null | undefined, key: string) {
  expect(target?.tagName ?? null).not.toBeNull();
  await act(async () => {
    target?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

async function renameTo(text: string, key: "Enter" | "Escape" | "blur") {
  const field = renameField();
  expect(field?.tagName ?? null).toBe("INPUT");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, text);
  if (key === "blur") await act(async () => field?.blur());
  else await press(field, key);
  await nextFrame();
}

const classRow = (id: string) =>
  host.querySelector<HTMLButtonElement>(`[data-emvb-class-def="${id}"] .emvb-site-item-main`);
const search = (label: string) =>
  host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
const mountClasses = (d: DesignSystem = design) =>
  mount(<ClassesSection design={d} layout={layout} onSave={onSave} onAskDelete={onAskDelete} />);

const varRow = (id: string) =>
  host.querySelector<HTMLButtonElement>(`[data-emvb-var-id="${id}"] .emvb-site-item-main`);
const valueField = (name: string) =>
  host.querySelector<HTMLInputElement>(`input[aria-label="Value of ${name}"]`);
/** Focus, then blur, so the field really fires its blur handler. */
const blurField = (field: HTMLInputElement | null | undefined) =>
  act(async () => {
    field?.focus();
    field?.blur();
  });
const mountVars = (kind: VariableKind, title: string, d: DesignSystem = design, l = layout) =>
  mount(
    <VariableSection
      title={title}
      kind={kind}
      design={d}
      layout={l}
      onSave={onSave}
      onAskDelete={onAskDelete}
    />,
  );

describe("VariableSection", () => {
  for (const [kind, newValue, title] of KINDS) {
    test(`${kind}: list, filter, rename, value, create`, async () => {
      await mountVars(kind, title);
      expect(html()).toMatchSnapshot("list");
      const filter = search(`Search ${title.toLowerCase()}`) ?? undefined;
      if (filter) {
        await type(filter, "zz");
        expect(html()).toMatchSnapshot("no matches");
        await type(filter, "--emvb");
        await type(filter, "b");
        expect(html()).toMatchSnapshot("filtered");
        await type(filter, "");
      }
      await press(varRow("brand"), "F2");
      await renameTo("Renamed", "Enter");
      await act(async () => varRow("brand")?.click());
      expect(html()).toMatchSnapshot("open");
      await type(valueField("Brand") ?? undefined, "-1");
      await press(valueField("Brand"), "Enter");
      await type(valueField("Brand") ?? undefined, newValue);
      await press(valueField("Brand"), "Enter");
      await pick(`Actions for ${design.variables.colors[0]?.name}`, "Delete");
      await click(byText("New"));
      expect(html()).toMatchSnapshot("create row");
      await type(inputs("Name").at(-1), "Brand");
      await click(byText("Create"));
      await click(byText("New"));
      await type(inputs("Name").at(-1), "  ");
      await click(byText("Create"));
      await click(byText("Cancel"));
      expect({ saved, asked }).toMatchSnapshot("saves");
      expect(html()).toMatchSnapshot("after");
    });
  }

  test("rows preview each kind: swatch, font, capped type size and spacing bar", async () => {
    const preview = (id: string) =>
      host.querySelector<HTMLElement>(`[data-emvb-var-id="${id}"] .emvb-site-preview`);
    await mountVars("color", "Colors");
    expect(preview("brand")?.style.background).toBe("#112233");
    expect(host.querySelector('[data-emvb-var-id="brand"] [data-emvb-var-text]')?.textContent).toBe(
      "#112233",
    );
    await mountVars("font", "Fonts");
    expect(preview("brand")?.style.fontFamily).toBe("Inter, sans-serif");
    expect(preview("brand")?.textContent).toBe("Ag");
    await mountVars("fontSize", "Font sizes");
    expect(preview("small")?.style.fontSize).toBe("12px");
    expect(preview("huge")?.style.fontSize).toBe("24px");
    expect(host.querySelector('[data-emvb-var-id="huge"] [data-emvb-var-text]')?.textContent).toBe(
      "48px",
    );
    const bars: DesignSystem = {
      ...design,
      variables: {
        ...design.variables,
        spacings: [
          { id: "tight", name: "Tight", value: { value: 1, unit: "px" } },
          { id: "roomy", name: "Roomy", value: { value: 1.5, unit: "rem" } },
          { id: "vast", name: "Vast", value: { value: 200, unit: "px" } },
        ],
      },
    };
    await mountVars("spacing", "Spacing", bars);
    const bar = (id: string) =>
      host.querySelector<HTMLElement>(`[data-emvb-var-id="${id}"] [data-emvb-var-bar]`)?.style
        .width;
    expect([bar("tight"), bar("roomy"), bar("vast")]).toEqual(["2px", "24px", "64px"]);
    expect(host.querySelector('[data-emvb-var-id="roomy"] [data-emvb-var-text]')?.textContent).toBe(
      "1.5rem",
    );
  });

  test("a value saves once on Enter or blur, keeps its unit, and Escape reverts", async () => {
    await mountVars("fontSize", "Font sizes");
    await act(async () => varRow("brand")?.click());
    const field = () => valueField("Brand") ?? undefined;
    await type(field(), "1");
    await type(field(), "1.2");
    expect(saved.length).toBe(0);
    await type(field(), "1.25rem");
    await press(field(), "Enter");
    await blurField(field());
    expect(saved.map((d) => d.variables.fontSizes?.[0]?.value)).toEqual([
      { value: 1.25, unit: "rem" },
    ]);
    await type(field(), "99");
    await press(field(), "Escape");
    expect(field()?.value).toBe("1.25rem");
    await blurField(field());
    expect(saved.length).toBe(1);
  });

  test("an invalid value explains the fix inline and saves nothing", async () => {
    await mountVars("color", "Colors");
    await act(async () => varRow("brand")?.click());
    await type(valueField("Brand") ?? undefined, "#12");
    await blurField(valueField("Brand"));
    expect(host.querySelector('[data-emvb-var-id="brand"] [role="alert"]')?.textContent).toBe(
      "Enter a hex color such as #1a2b3c.",
    );
    expect(valueField("Brand")?.getAttribute("aria-invalid")).toBe("true");
    expect(saved.length).toBe(0);
    await type(valueField("Brand") ?? undefined, "#123");
    expect(
      host.querySelector('[data-emvb-var-id="brand"] [role="alert"]')?.textContent ?? null,
    ).toBeNull();
    await press(valueField("Brand"), "Enter");
    expect(saved.map((d) => d.variables.colors[0]?.value)).toEqual(["#123"]);
  });

  test("the colour picker saves on its change event, not while dragging", async () => {
    await mountVars("color", "Colors");
    await act(async () => varRow("brand")?.click());
    const picker = host.querySelector<HTMLInputElement>('input[aria-label="Pick Brand"]');
    expect(picker?.value ?? null).toBe("#112233");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        picker,
        "#445566",
      );
      picker?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(saved.length).toBe(0);
    expect(valueField("Brand")?.value).toBe("#445566");
    await act(async () => picker?.dispatchEvent(new Event("change", { bubbles: true })));
    expect(saved.map((d) => d.variables.colors[0]?.value)).toEqual(["#445566"]);
  });

  test("an invalid new value is explained in the create row and not saved", async () => {
    await mountVars("spacing", "Spacing");
    await click(byText("New"));
    await type(inputs("Name").at(-1), "Gutter");
    await type(inputs("Value (px, rem, em or %)").at(-1), "wide");
    await click(byText("Create"));
    expect(host.querySelector("[data-emvb-var-create] [role='alert']")?.textContent).toBe(
      "Enter a length such as 16, 16px or 1.5rem.",
    );
    expect(saved.length).toBe(0);
    await type(inputs("Value (px, rem, em or %)").at(-1), "2em");
    await click(byText("Create"));
    expect(saved.map((d) => d.variables.spacings?.at(-1))).toEqual([
      { id: "gutter", name: "Gutter", value: { value: 2, unit: "em" } },
    ]);
  });

  test("shows page usage, with class usage in the tooltip", async () => {
    const used: DesignSystem = {
      ...design,
      classes: [
        { id: "card", name: "Card", style: { color: { var: "brand" } } },
        {
          id: "hero",
          name: "Hero",
          style: { backgroundColor: { var: "brand" }, color: { var: "brand" } },
        },
      ],
    };
    const page = {
      ...layout,
      root: {
        ...layout.root,
        children: [
          {
            id: "head0001",
            type: "heading",
            props: { text: "Hi", level: 1 },
            style: { color: { var: "brand" } },
          },
        ],
      },
    } as Layout;
    await mountVars("color", "Colors", used, page);
    const usage = (id: string) =>
      host.querySelector(`[data-emvb-var-id="${id}"] [data-emvb-usage]`);
    expect(usage("brand")?.textContent).toBe("1 on page");
    expect(usage("brand")?.getAttribute("title")).toBe("Used 1 time on this page and in 2 classes");
    expect(usage("ink")?.textContent).toBe("0 on page");
    expect(usage("ink")?.getAttribute("title")).toBe("Used 0 times on this page");
  });

  test("the menu edits, renames, copies the CSS variable and deletes last", async () => {
    const copiedText: string[] = [];
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => void copiedText.push(text) },
    });
    try {
      await mountVars("spacing", "Spacing");
      await click(byLabel("Actions for Brand"));
      await settle();
      const parts = [
        ...(document
          .querySelector('[role="menu"]')
          ?.querySelectorAll('[role="menuitem"], [role="separator"]') ?? []),
      ];
      expect(parts.map((el) => el.textContent || el.getAttribute("role"))).toEqual([
        "Edit value",
        "Rename",
        "Copy CSS variable",
        "separator",
        "Delete",
      ]);
      await act(async () => menuItem("Copy CSS variable")?.click());
      await settle();
      expect(copiedText).toEqual(["var(--emvb-s-brand)"]);
      expect(host.querySelector('[data-emvb-var-id="brand"] [data-emvb-usage]')?.textContent).toBe(
        "Copied",
      );
      await pick("Actions for Brand", "Edit value");
      expect(varRow("brand")?.getAttribute("aria-expanded")).toBe("true");
      await pick("Actions for Brand", "Rename");
      await nextFrame();
      await renameTo("Base", "Enter");
      expect(saved.map((d) => d.variables.spacings?.[0]?.name)).toEqual(["Base"]);
      expect(document.activeElement === varRow("brand")).toBe(true);
    } finally {
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  test("an empty section explains what the kind is for", async () => {
    const none: DesignSystem = {
      schemaVersion: 3,
      variables: { colors: [], fonts: [], fontSizes: [], spacings: [] },
    };
    const texts: string[] = [];
    for (const [kind, , title] of KINDS) {
      // oxlint-disable-next-line no-await-in-loop -- one mounted section at a time
      await mountVars(kind, title, none);
      texts.push(host.querySelector(`[data-emvb-var-empty="${kind}"]`)?.textContent ?? "");
    }
    expect(texts).toEqual([
      "No colors yet. Add one to reuse it in any color field.",
      "No fonts yet. Add a font stack to reuse it.",
      "No font sizes yet. Add one to build a type scale.",
      "No spacing yet. Add one to keep gaps consistent.",
    ]);
    await click(byText("New"));
    expect(host.querySelector("[data-emvb-var-empty]")?.tagName ?? null).toBeNull();
  });
});

describe("ClassesSection", () => {
  test("list, filter, duplicate, delete, create", async () => {
    await mountClasses();
    expect(html()).toMatchSnapshot("list");
    await type(search("Search classes") ?? undefined, "emvb-k-no");
    expect(html()).toMatchSnapshot("filtered");
    await type(search("Search classes") ?? undefined, "zz");
    expect(host.querySelector("[data-emvb-classes-nomatch]")?.textContent).toBe(
      'No classes match "zz".',
    );
    await press(search("Search classes"), "Escape");
    expect(search("Search classes")?.value).toBe("");
    expect(host.querySelectorAll("[data-emvb-class-def]").length).toBe(4);
    await pick("Actions for Card", "Duplicate");
    await pick("Actions for Hero", "Delete");
    await act(async () => classRow("card")?.click());
    expect(classRow("card")?.getAttribute("aria-expanded")).toBe("true");
    expect(html()).toMatchSnapshot("editing");
    await act(async () => classRow("card")?.click());
    expect(classRow("card")?.getAttribute("aria-expanded")).toBe("false");
    await click(byText("New"));
    await type(inputs("Name").at(-1), "Card");
    await click(byText("Create class"));
    expect({ saved, asked }).toMatchSnapshot("saves");
    expect(html()).toMatchSnapshot("after");
  });

  test("the row menu offers Edit styles, Rename, Duplicate, then Delete after a separator", async () => {
    await mountClasses();
    await click(byLabel("Actions for Card"));
    await settle();
    const content = document.querySelector('[role="menu"]');
    const parts = [...(content?.querySelectorAll('[role="menuitem"], [role="separator"]') ?? [])];
    expect(parts.map((el) => el.textContent || el.getAttribute("role"))).toEqual([
      "Edit styles",
      "Rename",
      "Duplicate",
      "separator",
      "Delete",
    ]);
    await act(async () => menuItem("Edit styles")?.click());
    await settle();
    expect(classRow("card")?.getAttribute("aria-expanded")).toBe("true");
    await click(byLabel("Actions for Card"));
    await settle();
    expect(menuItem("Hide styles")?.textContent ?? null).toBe("Hide styles");
  });

  test("renames in place from the menu, F2 or a double-click; Enter or blur saves once", async () => {
    await mountClasses();
    await pick("Actions for Card", "Rename");
    await nextFrame();
    expect(renameField()?.getAttribute("aria-label")).toBe("Rename Card");
    expect(document.activeElement === renameField()).toBe(true);
    await renameTo("  Card big  ", "Enter");
    expect(saved.map((d) => d.classes?.[0]?.name)).toEqual(["Card big"]);
    expect(renameField()?.tagName ?? null).toBeNull();
    expect(document.activeElement === classRow("card")).toBe(true);

    await press(classRow("hero"), "F2");
    await renameTo("Hero banner", "blur");
    expect(saved.at(-1)?.classes?.[1]?.name).toBe("Hero banner");
    expect(saved.length).toBe(2);

    await act(async () =>
      classRow("note")?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })),
    );
    await renameTo("Ignored", "Escape");
    await press(classRow("badge"), "F2");
    await renameTo("   ", "Enter");
    await press(classRow("badge"), "F2");
    await renameTo("Badge", "Enter");
    expect(saved.length).toBe(2);
  });

  test("shows the page usage count, with the full sentence in the tooltip", async () => {
    await mountClasses();
    const usage = (id: string) =>
      host.querySelector(`[data-emvb-class-def="${id}"] [data-emvb-usage]`);
    expect(usage("card")?.textContent).toBe("1 on page");
    expect(usage("card")?.getAttribute("title")).toBe("Used by 1 element on this page");
    expect(usage("hero")?.textContent).toBe("0 on page");
    expect(usage("hero")?.getAttribute("title")).toBe("Used by 0 elements on this page");
  });

  test("an empty site shows a Kumo Empty that points to the Style tab, and no list", async () => {
    await mountClasses({ ...design, classes: [] });
    const empty = host.querySelector("[data-emvb-classes-empty]");
    expect(empty?.textContent).toContain("No classes yet");
    expect(empty?.textContent).toContain("Style tab");
    expect(search("Search classes")?.tagName ?? null).toBeNull();
    await click(byText("New"));
    expect(host.querySelector("[data-emvb-classes-empty]")?.tagName ?? null).toBeNull();
  });
});
