import { expect, test } from "bun:test";
import type { DesignSystem } from "../schema/design.ts";
import { generateCss } from "./generate.ts";

// Unsafe values and ids reach generateCss unvalidated here on purpose: it must drop them itself.
const design = {
  schemaVersion: 1,
  variables: {
    colors: [
      { id: "brand", name: "Brand", value: "#112233" },
      { id: "Bad Id", name: "Bad", value: "#445566" },
      { id: "evil", name: "Evil", value: "red;}body{x:y" },
    ],
    fonts: [
      { id: "body", name: "Body", value: "Inter, sans-serif" },
      { id: "evil", name: "Evil", value: "x</style>" },
    ],
    fontSizes: [
      { id: "lg", name: "Large", value: { value: 1.5, unit: "rem" } },
      { id: "evil", name: "Evil", value: { value: 1, unit: "px;}" } },
    ],
    spacings: [
      { id: "gap", name: "Gap", value: { value: 16, unit: "px" } },
      { id: "BAD", name: "Bad", value: { value: 4, unit: "px" } },
    ],
  },
  classes: [
    { id: "card", name: "Card", style: { color: "#abcdef" } },
    { id: "Nope", name: "Nope", style: { color: "#000000" } },
    { id: "empty", name: "Empty", style: {} },
  ],
} as unknown as DesignSystem;

test("generateCss emits safe variables, used base CSS, classes and local rules in cascade order", () => {
  const css = generateCss({
    design,
    usedTypes: new Set(["text", "heading"]),
    baseCss: new Map([
      ["heading", ".emvb-heading{margin:0}"],
      ["text", ".emvb-text{margin:0}"],
      ["image", ".emvb-image{display:block}"],
    ]),
    localRules: [
      { id: "abc", declarations: [{ property: "color", value: "red" }] },
      { id: "none", declarations: [] },
    ],
  });
  expect(css).toBe(EXPECTED);
});

test("an empty design emits no variable block", () => {
  const css = generateCss({
    design: { schemaVersion: 1, variables: { colors: [] } },
    usedTypes: new Set(),
    baseCss: new Map(),
    localRules: [],
  });
  expect(css).toBe("");
});

const EXPECTED =
  ".emvb-root{--emvb-c-brand:#112233;--emvb-f-body:Inter, sans-serif;--emvb-fs-lg:1.5rem;--emvb-s-gap:16px}.emvb-heading{margin:0}.emvb-text{margin:0}.emvb-k-card{color:#abcdef}.emvb-e-abc{color:red}";
