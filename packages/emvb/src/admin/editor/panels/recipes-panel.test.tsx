import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { emptyDesign, type Layout } from "../../../core/index.ts";
import { paletteItems } from "../palette-items.ts";
import { AddPanel } from "./AddPanel.tsx";
import { cleanup, mount } from "../../../../test/dom/mount.ts";

afterEach(cleanup);

describe("W-320 recipes in the Add panel and palette", () => {
  test("W-320 the Add panel lists recipes and adds the one clicked", async () => {
    const added: string[] = [];
    const root = await mount(<AddPanel onAdd={() => {}} onRecipe={(id) => added.push(id)} />);
    const tiles = root.querySelectorAll("[data-emvb-recipe]");
    expect(tiles.length).toBeGreaterThanOrEqual(6);
    const hero = root.querySelector('[data-emvb-recipe="hero"]') as HTMLButtonElement;
    await act(async () => hero.click());
    expect(added).toEqual(["hero"]);
  });

  test("W-320 search finds recipes by name, even with no element match", async () => {
    const root = await mount(
      <AddPanel onAdd={() => {}} onRecipe={() => {}} defaultQuery="testimonial" />,
    );
    expect(root.querySelectorAll("[data-emvb-recipe]").length).toBe(1);
    expect(root.textContent).not.toContain("No elements match");
  });

  test("W-320 no recipe handler, no recipes", async () => {
    const root = await mount(<AddPanel onAdd={() => {}} />);
    expect(root.querySelector("[data-emvb-recipes]")).toBeNull();
  });

  test("W-320 the palette offers each recipe under Insert", () => {
    const layout: Layout = {
      schemaVersion: 13,
      root: { id: "root0001", type: "container", props: {}, children: [] },
    };
    const inserted: string[] = [];
    const items = paletteItems({
      layout,
      design: emptyDesign(),
      selected: null,
      formsAvailable: true,
      insert: () => {},
      insertRecipe: (id) => inserted.push(id),
      select: () => {},
      applyClass: () => {},
      actions: [],
    });
    const cta = items.find((i) => i.id === "recipe:cta");
    expect(cta?.group).toBe("Insert");
    cta?.run();
    expect(inserted).toEqual(["cta"]);
  });
});
