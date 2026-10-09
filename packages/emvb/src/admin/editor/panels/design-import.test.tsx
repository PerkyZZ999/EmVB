import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import {
  designToJson,
  emptyDesign,
  importLosses,
  type DesignSystem,
  type Layout,
} from "../../../core/index.ts";
import { SiteStylesDrawer } from "./SiteStylesDrawer.tsx";
import { cleanup, mount, settle } from "../../../../test/dom/mount.ts";

afterEach(cleanup);

const layout: Layout = {
  schemaVersion: 13,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "head0001", type: "heading", props: { text: "A", level: 2 }, classes: ["card"] },
      {
        id: "head0002",
        type: "heading",
        props: { text: "B", level: 2 },
        style: { color: { var: "brand", from: "color" } },
      },
    ],
  },
} as Layout;

const current: DesignSystem = {
  ...emptyDesign(),
  variables: {
    colors: [
      { id: "brand", name: "Brand", value: "#ff0000" },
      { id: "muted", name: "Muted", value: "#888888" },
    ],
  },
  classes: [
    { id: "card", name: "Card", style: {} },
    { id: "hero", name: "Hero", style: {} },
  ],
} as DesignSystem;
const incoming: DesignSystem = {
  ...emptyDesign(),
  variables: { colors: [{ id: "muted", name: "Muted", value: "#777777" }] },
  classes: [{ id: "hero", name: "Hero", style: {} }],
} as DesignSystem;

describe("design Import (W-214)", () => {
  test("importLosses counts what the file drops and what this page uses", () => {
    expect(importLosses(current, incoming, layout)).toEqual({
      classes: 1,
      variables: 1,
      usedOnPage: 2,
    });
    expect(importLosses(current, current, layout)).toEqual({
      classes: 0,
      variables: 0,
      usedOnPage: 0,
    });
    expect(importLosses(current, incoming, null).usedOnPage).toBe(0);
  });

  const pick = async (file: File) => {
    const input = document.querySelector<HTMLInputElement>("[data-emvb-design-import]");
    if (!input) throw new Error("no import input");
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
  };

  test("Import asks first and saves only on Replace", async () => {
    const saved: DesignSystem[] = [];
    await mount(
      <SiteStylesDrawer
        design={current}
        layout={layout}
        onDesignChange={async (d) => {
          saved.push(d);
        }}
        onLayoutChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    await pick(new File([designToJson(incoming)], "theirs.json", { type: "application/json" }));
    const dialog = document.querySelector("[data-emvb-import-confirm]");
    expect(dialog?.textContent).toContain("theirs.json");
    expect(dialog?.textContent).toContain("1 class and 1 variable");
    expect(dialog?.textContent).toContain("This page uses 2 of them");
    expect(saved).toHaveLength(0);
    const replace = [...(dialog?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent === "Replace",
    );
    await act(async () => {
      replace?.click();
    });
    await settle();
    expect(saved.map((d) => d.classes?.map((c) => c.id))).toEqual([["hero"]]);
    expect(document.querySelector("[data-emvb-import-confirm]")).toBeNull();
  });

  test("W-283: the confirm lists names the file repeats, and Replace saves them renamed", async () => {
    const saved: DesignSystem[] = [];
    await mount(
      <SiteStylesDrawer
        design={current}
        layout={layout}
        onDesignChange={async (d) => {
          saved.push(d);
        }}
        onLayoutChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    const twice = {
      ...incoming,
      classes: [
        { id: "hero", name: "Hero", style: {} },
        { id: "hero-b", name: "hero", style: {} },
      ],
    } as DesignSystem;
    await pick(new File([designToJson(twice)], "twice.json", { type: "application/json" }));
    expect(document.querySelector("[data-emvb-import-renamed]")?.textContent).toBe(
      "The file repeats some names, so one is renamed: hero → hero 2.",
    );
    const dialog = document.querySelector("[data-emvb-import-confirm]");
    const replace = [...(dialog?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent === "Replace",
    );
    await act(async () => {
      replace?.click();
    });
    await settle();
    expect(saved.map((d) => d.classes?.map((c) => c.name))).toEqual([["Hero", "hero 2"]]);
  });

  test("W-283: a file with no repeats doesn't mention renaming", async () => {
    await mount(
      <SiteStylesDrawer
        design={current}
        layout={layout}
        onDesignChange={async () => undefined}
        onLayoutChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    await pick(new File([designToJson(incoming)], "theirs.json", { type: "application/json" }));
    expect(document.querySelector("[data-emvb-import-confirm]")).not.toBeNull();
    expect(document.querySelector("[data-emvb-import-renamed]")).toBeNull();
  });

  test("a file over 1 MB is refused before it is read", async () => {
    await mount(
      <SiteStylesDrawer
        design={current}
        layout={layout}
        onDesignChange={async () => undefined}
        onLayoutChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    await pick(new File(["x".repeat(1024 * 1024 + 1)], "huge.json"));
    expect(document.querySelector("[data-emvb-import-confirm]")).toBeNull();
    expect(document.body.textContent).toContain("too big");
  });
});
