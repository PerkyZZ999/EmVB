import { describe, expect, test } from "bun:test";
import { clearVariableRefs, findVariableUsages } from "../design/variables.ts";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { StyleProps } from "../schema/style.ts";
import { styleDeclarations } from "./css.ts";

const image = "https://cdn.example/photo.png";

describe("background images, gradients and overlays (W-094)", () => {
  test("an image is quoted into url(), with cover, center and no-repeat unless set", () => {
    expect(styleDeclarations({ backgroundImage: image })).toEqual({
      declarations: [
        { property: "background-image", value: `url("${image}")` },
        { property: "background-size", value: "cover" },
        { property: "background-position", value: "center" },
        { property: "background-repeat", value: "no-repeat" },
      ],
      rejected: [],
    });
    expect(
      styleDeclarations({
        backgroundImage: image,
        backgroundSize: "contain",
        backgroundPosition: "top left",
        backgroundRepeat: "repeat-x",
      }).declarations,
    ).toEqual([
      { property: "background-image", value: `url("${image}")` },
      { property: "background-size", value: "contain" },
      { property: "background-position", value: "top left" },
      { property: "background-repeat", value: "repeat-x" },
    ]);
  });

  test("a javascript: URL, a protocol-relative URL and a parenthesis are refused", () => {
    for (const url of [
      "javascript:alert(1)",
      "//cdn.example/a.png",
      "/photo (1).png",
      "data:text/plain,hi",
    ]) {
      expect(StyleProps.safeParse({ backgroundImage: url }).success).toBe(false);
      expect(styleDeclarations({ backgroundImage: url }).rejected).toEqual(["backgroundImage"]);
    }
  });

  test("a gradient is a two-stop linear-gradient, including a colour variable", () => {
    expect(
      styleDeclarations({ gradient: { angle: 90, from: "#112233", to: { var: "ink" } } }),
    ).toEqual({
      declarations: [
        {
          property: "background-image",
          value: "linear-gradient(90deg, #112233, var(--emvb-c-ink))",
        },
      ],
      rejected: [],
    });
    expect(
      StyleProps.safeParse({ gradient: { angle: 361, from: "#fff", to: "#000" } }).success,
    ).toBe(false);
    expect(
      styleDeclarations({ gradient: { angle: 361, from: "#112233", to: "#445566" } }).rejected,
    ).toEqual(["gradient"]);
  });

  test("an overlay is the top layer, then the image, then the gradient", () => {
    const { declarations } = styleDeclarations({
      backgroundImage: image,
      gradient: { angle: 180, from: "#ffffff", to: "#000000" },
      overlay: { color: "#000000", opacity: 0.4 },
    });
    expect(declarations.map((d) => d.property)).toEqual([
      "background-image",
      "background-size",
      "background-position",
      "background-repeat",
    ]);
    expect(declarations[0]?.value).toBe(
      `linear-gradient(#00000066, #00000066),url("${image}"),linear-gradient(180deg, #ffffff, #000000)`,
    );
    expect(declarations[1]?.value).toBe("auto,cover,auto");
  });

  test("an overlay on a colour variable uses color-mix", () => {
    expect(styleDeclarations({ overlay: { color: { var: "ink" }, opacity: 0.5 } })).toEqual({
      declarations: [
        {
          property: "background-image",
          value:
            "linear-gradient(color-mix(in srgb, var(--emvb-c-ink) 50%, transparent), color-mix(in srgb, var(--emvb-c-ink) 50%, transparent))",
        },
      ],
      rejected: [],
    });
  });

  test("deleting a colour variable clears a gradient stop and an overlay that use it", () => {
    const page: Layout = {
      schemaVersion: 6,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        style: {
          gradient: { angle: 180, from: { var: "brand" }, to: "#ffffff" },
          overlay: { color: { var: "brand" }, opacity: 0.4 },
        },
        children: [],
      },
    };
    expect(
      findVariableUsages(page, "brand", "color")
        .map((u) => u.prop)
        .toSorted(),
    ).toEqual(["gradient.from", "overlay.color"]);
    const cleared = clearVariableRefs(page, "brand", "color");
    expect(cleared.root.style).toBeUndefined();
    expect(findVariableUsages(cleared, "brand", "color")).toEqual([]);
    expect(emptyDesign().schemaVersion).toBe(6);
  });
});
