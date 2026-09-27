import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { emptyDesign, type DesignSystem, type Layout } from "../../../core/index.ts";
import { SiteStylesDrawer } from "./SiteStylesDrawer.tsx";

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  host?.remove();
  host = undefined;
  document.body.innerHTML = "";
});

async function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(node));
}

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
