import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import {
  clearVariableRefs,
  deleteVariable,
  findVariableUsages,
  findVariableUsagesInDesign,
  renameVariable,
  removeVariable,
} from "./variables.ts";

const layout = (): Layout => ({
  schemaVersion: 2,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { gap: { var: "md", from: "spacing" } },
    children: [
      {
        id: "head0001",
        type: "heading",
        props: { text: "Hi", level: 1 },
        style: {
          color: { var: "brand" },
          fontSize: { var: "lg", from: "fontSize" },
        },
      },
      {
        id: "wrap0001",
        type: "container",
        props: {},
        children: [
          {
            id: "text0001",
            type: "text",
            props: { text: "nested" },
            style: {
              color: { var: "brand" },
              fontFamily: { var: "body", from: "font" },
              paddingTop: { var: "md", from: "spacing" as const },
            },
          },
        ],
      },
    ],
  },
});

const designWithVars = () => {
  const d = emptyDesign();
  return {
    ...d,
    variables: {
      colors: [{ id: "brand", name: "Brand", value: "#0055ff" }],
      fonts: [{ id: "body", name: "Body", value: "Noto Sans, sans-serif" }],
      fontSizes: [{ id: "lg", name: "Large", value: { value: 24, unit: "px" as const } }],
      spacings: [{ id: "md", name: "Medium", value: { value: 16, unit: "px" as const } }],
    },
  };
};

describe("findVariableUsages (W-029)", () => {
  test("finds usages across nested trees", () => {
    const usages = findVariableUsages(layout(), "brand", "color");
    expect(usages).toEqual([
      { nodeId: "head0001", prop: "color" },
      { nodeId: "text0001", prop: "color" },
    ]);
  });

  test("matches spacing and fontSize kinds on nested and root nodes", () => {
    expect(findVariableUsages(layout(), "md", "spacing")).toEqual([
      { nodeId: "root0001", prop: "gap" },
      { nodeId: "text0001", prop: "paddingTop" },
    ]);
    expect(findVariableUsages(layout(), "lg", "fontSize")).toEqual([
      { nodeId: "head0001", prop: "fontSize" },
    ]);
    expect(findVariableUsages(layout(), "body", "font")).toEqual([
      { nodeId: "text0001", prop: "fontFamily" },
    ]);
  });

  test("kind filter ignores the same id under a different kind", () => {
    const page: Layout = {
      schemaVersion: 2,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "head0001",
            type: "heading",
            props: { text: "x", level: 1 },
            style: {
              color: { var: "shared", from: "color" },
              gap: { var: "shared", from: "spacing" },
            },
          },
        ],
      },
    };
    expect(findVariableUsages(page, "shared", "color")).toEqual([
      { nodeId: "head0001", prop: "color" },
    ]);
    expect(findVariableUsages(page, "shared", "spacing")).toEqual([
      { nodeId: "head0001", prop: "gap" },
    ]);
  });
});

describe("clearVariableRefs / deleteVariable (W-029)", () => {
  test("delete clears refs and removes the variable; unused delete is silent", () => {
    const before = layout();
    const design = designWithVars();

    const unused = deleteVariable(design, before, "missing", "color");
    expect(unused.design).toEqual(design);
    expect(unused.layout).toEqual(before);

    const { design: afterDesign, layout: afterLayout } = deleteVariable(
      design,
      before,
      "brand",
      "color",
    );
    expect(afterDesign.variables.colors).toEqual([]);
    expect(findVariableUsages(afterLayout, "brand", "color")).toEqual([]);
    // Other bindings stay.
    expect(findVariableUsages(afterLayout, "md", "spacing")).toHaveLength(2);
    expect(afterLayout.root.children[0]?.style).toEqual({
      fontSize: { var: "lg", from: "fontSize" },
    });
  });

  test("clearVariableRefs drops only matching props and removes empty style objects", () => {
    const page: Layout = {
      schemaVersion: 2,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "head0001",
            type: "heading",
            props: { text: "x", level: 1 },
            style: { color: { var: "brand" } },
          },
        ],
      },
    };
    const cleared = clearVariableRefs(page, "brand", "color");
    expect(cleared.root.children[0]?.style).toBeUndefined();
  });
});

describe("renameVariable / removeVariable (W-029)", () => {
  test("rename is name-only; ids stay stable", () => {
    const design = designWithVars();
    const renamed = renameVariable(design, "brand", "color", "Primary");
    expect(renamed.variables.colors[0]).toEqual({
      id: "brand",
      name: "Primary",
      value: "#0055ff",
    });
    expect(removeVariable(renamed, "brand", "color").variables.colors).toEqual([]);
  });
});

describe("findVariableUsagesInDesign (W-029 prep for classes)", () => {
  test("reports class style refs when classes are present", () => {
    const design = {
      ...emptyDesign(),
      classes: [
        {
          id: "card",
          name: "Card",
          style: {
            backgroundColor: { var: "brand" },
            paddingTop: { var: "md", from: "spacing" as const },
          },
        },
      ],
    };
    expect(findVariableUsagesInDesign(design, "brand", "color")).toEqual([
      { nodeId: "", prop: "backgroundColor", classId: "card" },
    ]);
  });
});

describe("box shadow colour refs (W-088)", () => {
  const shadowed = (): Layout => ({
    schemaVersion: 2,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      style: {
        boxShadow: { x: 0, y: 4, blur: 12, spread: 0, color: { var: "brand" }, inset: true },
        color: { var: "ink" },
      },
      children: [],
    },
  });

  test("the managers count a colour variable used by a box shadow", () => {
    expect(findVariableUsages(shadowed(), "brand", "color")).toEqual([
      { nodeId: "root0001", prop: "boxShadow.color" },
    ]);
    expect(findVariableUsages(shadowed(), "brand", "spacing")).toEqual([]);
    const design = {
      ...emptyDesign(),
      classes: [{ id: "lift", name: "Lift", style: shadowed().root.style ?? {} }],
    };
    expect(findVariableUsagesInDesign(design, "brand", "color")).toEqual([
      { nodeId: "", prop: "boxShadow.color", classId: "lift" },
    ]);
  });

  test("deleting the variable clears only the shadow's colour", () => {
    const next = clearVariableRefs(shadowed(), "brand", "color");
    expect(next.root.style).toEqual({
      boxShadow: { x: 0, y: 4, blur: 12, spread: 0, inset: true },
      color: { var: "ink" },
    });
    expect(clearVariableRefs(shadowed(), "other", "color")).toEqual(shadowed());
  });
});
