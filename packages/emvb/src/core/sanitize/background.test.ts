import { describe, expect, test } from "bun:test";
import { clearVariableRefs, findVariableUsages } from "../design/variables.ts";
import { DESIGN_SCHEMA_VERSION, emptyDesign } from "../schema/design.ts";
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
      styleDeclarations({
        gradient: {
          type: "linear",
          angle: 90,
          stops: [
            { color: "#112233", at: 0 },
            { color: { var: "ink" }, at: 100 },
          ],
        },
      }),
    ).toEqual({
      declarations: [
        {
          property: "background-image",
          value: "linear-gradient(90deg, #112233 0%, var(--emvb-c-ink) 100%)",
        },
      ],
      rejected: [],
    });
    expect(
      StyleProps.safeParse({
        gradient: {
          type: "linear",
          angle: 361,
          stops: [
            { color: "#fff", at: 0 },
            { color: "#000", at: 100 },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      styleDeclarations({
        gradient: {
          type: "linear",
          angle: 361,
          stops: [
            { color: "#112233", at: 0 },
            { color: "#445566", at: 100 },
          ],
        },
      }).rejected,
    ).toEqual(["gradient"]);
  });

  test("a gradient can be radial or conic, and stops stay at their locations", () => {
    expect(
      styleDeclarations({
        gradient: {
          type: "radial",
          position: "top left",
          stops: [
            { color: "#ffffff", at: 10 },
            { color: "#000000", at: 90 },
          ],
        },
      }).declarations[0]?.value,
    ).toBe("radial-gradient(circle at top left, #ffffff 10%, #000000 90%)");
    expect(
      styleDeclarations({
        gradient: {
          type: "conic",
          angle: 40,
          stops: [
            { color: "#ff0000", at: 0 },
            { color: "#00ff00", at: 50 },
            { color: "#0000ff", at: 100 },
          ],
        },
      }).declarations[0]?.value,
    ).toBe("conic-gradient(from 40deg, #ff0000 0%, #00ff00 50%, #0000ff 100%)");
    expect(
      StyleProps.safeParse({
        gradient: {
          type: "linear",
          angle: 0,
          stops: Array.from({ length: 11 }, () => ({ color: "#ffffff", at: 0 })),
        },
      }).success,
    ).toBe(false);
  });

  test("stops are drawn in location order, whatever order they were added in (W-172)", () => {
    const css = (stops: { color: string; at: number }[]) =>
      styleDeclarations({ gradient: { type: "linear", angle: 90, stops } }).declarations[0]?.value;
    expect(
      css([
        { color: "#000000", at: 100 },
        { color: "#ffffff", at: 0 },
        { color: "#ff0000", at: 50 },
      ]),
    ).toBe("linear-gradient(90deg, #ffffff 0%, #ff0000 50%, #000000 100%)");
    expect(
      css([
        { color: "#ffffff", at: 0 },
        { color: "#00ff00", at: 50 },
        { color: "#ff0000", at: 50 },
        { color: "#000000", at: 100 },
      ]),
    ).toBe("linear-gradient(90deg, #ffffff 0%, #00ff00 50%, #ff0000 50%, #000000 100%)");
  });

  test("an overlay is the top layer, then the image, then the gradient", () => {
    const { declarations } = styleDeclarations({
      backgroundImage: image,
      gradient: {
        type: "linear",
        angle: 180,
        stops: [
          { color: "#ffffff", at: 0 },
          { color: "#000000", at: 100 },
        ],
      },
      overlay: { color: "#000000", opacity: 0.4 },
    });
    expect(declarations.map((d) => d.property)).toEqual([
      "background-image",
      "background-size",
      "background-position",
      "background-repeat",
    ]);
    expect(declarations[0]?.value).toBe(
      `linear-gradient(#00000066, #00000066),url("${image}"),linear-gradient(180deg, #ffffff 0%, #000000 100%)`,
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
      schemaVersion: 13,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        style: {
          gradient: {
            type: "linear",
            angle: 180,
            stops: [
              { color: { var: "brand" }, at: 0 },
              { color: "#ffffff", at: 100 },
            ],
          },
          overlay: { color: { var: "brand" }, opacity: 0.4 },
        },
        children: [],
      },
    };
    expect(
      findVariableUsages(page, "brand", "color")
        .map((u) => u.prop)
        .toSorted(),
    ).toEqual(["gradient.stops.0", "overlay.color"]);
    const cleared = clearVariableRefs(page, "brand", "color");
    expect(cleared.root.style).toBeUndefined();
    expect(findVariableUsages(cleared, "brand", "color")).toEqual([]);
    expect(emptyDesign().schemaVersion).toBe(DESIGN_SCHEMA_VERSION);
  });
});
