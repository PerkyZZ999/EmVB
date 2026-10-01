import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { emptyDesign, type DesignSystem, type Layout } from "../../../core/index.ts";
import { SiteStylesDrawer } from "./SiteStylesDrawer.tsx";
import { cleanup, mount, settle } from "../../../../test/dom/mount.ts";

afterEach(cleanup);

const layout: Layout = {
  schemaVersion: 5,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        id: "head0001",
        type: "heading",
        props: { text: "A", level: 1 },
        classes: ["card"],
      },
      {
        id: "head0002",
        type: "heading",
        props: { text: "B", level: 2 },
        classes: ["card"],
      },
    ],
  },
};

describe("SiteStylesDrawer (W-032)", () => {
  test("Variables tab is default with footer; Classes tab lists usage counts", async () => {
    const design: DesignSystem = {
      ...emptyDesign(),
      classes: [{ id: "card", name: "Card", style: { color: "#112233" } }],
    };
    await mount(
      <SiteStylesDrawer
        design={design}
        layout={layout}
        onDesignChange={async () => undefined}
        onLayoutChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(document.querySelector("[data-emvb-site-styles]")).toBeTruthy();
    expect(
      [...document.querySelectorAll('[role="tab"]')].some((el) => el.textContent === "Variables"),
    ).toBe(true);
    expect(document.querySelector('[data-emvb-site-tab="variables"]')).toBeTruthy();
    expect(document.querySelector('[data-emvb-var-kind="spacing"]')).toBeTruthy();
    expect(document.body.textContent).toContain(
      "Changes to site styles apply to all pages immediately.",
    );

    const classesTab = [...document.querySelectorAll('[role="tab"]')].find(
      (t) => t.textContent === "Classes",
    ) as HTMLElement | undefined;
    expect(classesTab).toBeTruthy();
    await act(async () => classesTab?.click());
    expect(document.querySelector('[data-emvb-site-tab="classes"]')).toBeTruthy();
    expect(document.querySelector('[data-emvb-class-def="card"]')?.textContent).toContain(
      "2 on page",
    );
  });

  test("class edit styles button expands StyleRows and save receives patch", async () => {
    let design: DesignSystem = {
      ...emptyDesign(),
      classes: [{ id: "card", name: "Card", style: { color: "#112233" } }],
    };
    const saves: DesignSystem[] = [];
    await mount(
      <SiteStylesDrawer
        design={design}
        layout={layout}
        onDesignChange={async (next) => {
          design = next;
          saves.push(next);
        }}
        onLayoutChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    const classesTab = [...document.querySelectorAll('[role="tab"]')].find(
      (t) => t.textContent === "Classes",
    ) as HTMLElement | undefined;
    await act(async () => classesTab?.click());
    const row = document.querySelector(
      '[data-emvb-class-def="card"] .emvb-site-item-main',
    ) as HTMLButtonElement | null;
    expect(row?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => row?.click());
    expect(row?.getAttribute("aria-expanded")).toBe("true");
    const keys = document.querySelectorAll(".emvb-site-class-styles [data-emvb-style]");
    expect(new Set([...keys].map((el) => el.getAttribute("data-emvb-style"))).size).toBe(20);
    await act(async () => {
      row?.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }));
    });
    const nameInput = document.querySelector(
      '[data-emvb-class-def="card"] .emvb-site-rename',
    ) as HTMLInputElement | null;
    expect(nameInput?.value ?? null).toBe("Card");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(nameInput, "Card 2");
      nameInput?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(saves.length).toBe(1);
    expect(saves.at(-1)?.classes?.[0]?.name).toBe("Card 2");
  });
});

describe("SiteStylesDrawer managers (W-071)", () => {
  test("shows Variables Manager label and CSS tokens", async () => {
    const design: DesignSystem = {
      ...emptyDesign(),
      variables: {
        ...emptyDesign().variables,
        colors: [{ id: "brand", name: "Brand", value: "#112233" }],
      },
    };
    await mount(
      <SiteStylesDrawer
        design={design}
        layout={layout}
        onDesignChange={async () => undefined}
        onLayoutChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(document.querySelector("[data-emvb-manager-label]")?.textContent).toContain(
      "Variables Manager",
    );
    const row = document.querySelector(
      '[data-emvb-var-id="brand"] .emvb-site-item-main',
    ) as HTMLButtonElement | null;
    expect(row?.title).toBe("Brand · var(--emvb-c-brand)");
    await act(async () => row?.click());
    expect(document.querySelector('[data-emvb-var-id="brand"]')?.textContent).toContain(
      "var(--emvb-c-brand)",
    );
    expect(document.querySelector("[data-emvb-var-swatch]")).toBeTruthy();
  });

  test("Classes Manager shows cascade help, token, and duplicate", async () => {
    let design: DesignSystem = {
      ...emptyDesign(),
      classes: [{ id: "card", name: "Card", style: { color: "#112233" } }],
    };
    const saves: DesignSystem[] = [];
    await mount(
      <SiteStylesDrawer
        design={design}
        layout={layout}
        onDesignChange={async (next) => {
          design = next;
          saves.push(next);
        }}
        onLayoutChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    const classesTab = [...document.querySelectorAll('[role="tab"]')].find(
      (tab) => tab.textContent === "Classes",
    ) as HTMLElement | undefined;
    await act(async () => classesTab?.click());
    expect(document.querySelector("[data-emvb-manager-label]")?.textContent).toContain(
      "Classes Manager",
    );
    expect(document.querySelector("[data-emvb-cascade-help]")?.textContent).toMatch(/Cascade/);
    expect(document.querySelector('[data-emvb-class-def="card"]')?.textContent).toContain(
      "emvb-k-card",
    );
    const menu = document.querySelector(
      '[data-emvb-class-def="card"] button[aria-label="Actions for Card"]',
    ) as HTMLButtonElement | null;
    await act(async () => menu?.click());
    await settle();
    const dup = [...document.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent === "Duplicate",
    ) as HTMLElement | undefined;
    expect(dup?.textContent ?? null).toBe("Duplicate");
    await act(async () => dup?.click());
    expect(saves.at(-1)?.classes?.length).toBe(2);
  });
});

describe("SiteStylesDrawer keyboard (W-087)", () => {
  test("keys pressed inside the drawer don't reach the editor's window shortcuts", async () => {
    const seen: string[] = [];
    const listener = (event: KeyboardEvent) => seen.push(event.key);
    window.addEventListener("keydown", listener);
    try {
      await mount(
        <SiteStylesDrawer
          design={{ ...emptyDesign(), classes: [{ id: "card", name: "Card", style: {} }] }}
          layout={layout}
          onDesignChange={async () => undefined}
          onLayoutChange={() => undefined}
          onClose={() => undefined}
        />,
      );
      const tab = [...document.querySelectorAll('[role="tab"]')].find(
        (t) => t.textContent === "Classes",
      ) as HTMLElement | undefined;
      await act(async () => tab?.click());
      const row = document.querySelector(".emvb-site-item-main") as HTMLElement | null;
      for (const key of ["Delete", "Backspace", "Enter", "ArrowDown", "Escape"]) {
        // oxlint-disable-next-line no-await-in-loop -- one key at a time
        await act(async () => {
          row?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
        });
      }
      await act(async () => {
        row?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true }),
        );
      });
      expect(seen).toEqual(["s"]);
    } finally {
      window.removeEventListener("keydown", listener);
    }
  });
});

describe("deleting a variable from Site styles", () => {
  test("the dialog counts page and class uses, and Delete clears both", async () => {
    const design: DesignSystem = {
      ...emptyDesign(),
      variables: {
        ...emptyDesign().variables,
        colors: [{ id: "brand", name: "Brand", value: "#0055ff" }],
      },
      classes: [
        { id: "card", name: "Card", style: { backgroundColor: { var: "brand" }, opacity: 0.5 } },
        { id: "tint", name: "Tint", style: { color: { var: "brand" } } },
      ],
    };
    const page: Layout = {
      schemaVersion: 5,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "head0001",
            type: "heading",
            props: { text: "A", level: 1 },
            style: { color: { var: "brand" } },
          },
        ],
      },
    };
    const saves: DesignSystem[] = [];
    const layouts: Layout[] = [];
    await mount(
      <SiteStylesDrawer
        design={design}
        layout={page}
        onDesignChange={async (next) => {
          saves.push(next);
        }}
        onLayoutChange={(next) => layouts.push(next)}
        onClose={() => undefined}
      />,
    );
    const button = (match: (b: HTMLButtonElement) => boolean) =>
      [...document.querySelectorAll<HTMLButtonElement>("button")].find(match);
    await act(async () =>
      button((b) => b.getAttribute("aria-label") === "Actions for Brand")?.click(),
    );
    await settle();
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (el) => el.textContent === "Delete",
    );
    expect(item?.textContent ?? null).toBe("Delete");
    await act(async () => item?.click());
    await settle();
    const dialog = document.querySelector("[data-emvb-site-confirm]");
    expect(dialog?.textContent ?? "").toContain(
      "In use in 1 place on this page and 2 classes. Deleting drops those bindings.",
    );
    await act(async () =>
      [...(dialog?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
        .find((b) => b.textContent === "Delete")
        ?.click(),
    );
    await settle();
    expect(saves.at(-1)?.variables.colors).toEqual([]);
    expect(saves.at(-1)?.classes).toEqual([
      { id: "card", name: "Card", style: { opacity: 0.5 } },
      { id: "tint", name: "Tint", style: {} },
    ]);
    expect(layouts.at(-1)?.root.children[0]?.style).toBeUndefined();
  });
});
