import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { emptyDesign, type DesignSystem, type Layout } from "../../../core/index.ts";
import { SiteStylesDrawer } from "./SiteStylesDrawer.tsx";
import { cleanup, mount } from "../../../../test/dom/mount.ts";

afterEach(cleanup);

const layout: Layout = {
  schemaVersion: 1,
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
    expect(document.querySelector('[data-emvb-class-def="card"]')?.textContent).toContain("2 used");
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
    const edit = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Edit styles",
    );
    await act(async () => edit?.click());
    expect(document.querySelector(".emvb-site-class-styles")).toBeTruthy();
    // Rename triggers save
    const nameInput = document.querySelector(
      '[data-emvb-class-def="card"] input',
    ) as HTMLInputElement | null;
    expect(nameInput).toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(nameInput, "Card 2");
      nameInput?.dispatchEvent(new Event("input", { bubbles: true }));
      nameInput?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(saves.length).toBeGreaterThan(0);
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
    expect(document.querySelector('[data-emvb-var-id="brand"]')?.textContent).toContain(
      "--emvb-c-brand",
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
    const dup = document.querySelector(
      '[data-emvb-class-def="card"] button[aria-label="Duplicate Card"]',
    ) as HTMLButtonElement | null;
    expect(dup).toBeTruthy();
    await act(async () => dup?.click());
    expect(saves.at(-1)?.classes?.length).toBe(2);
  });
});
