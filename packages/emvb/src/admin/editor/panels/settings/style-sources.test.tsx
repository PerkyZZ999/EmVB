import { afterEach, describe, expect, test } from "bun:test";
import {
  DESIGN_SCHEMA_VERSION,
  type DesignSystem,
  type LayoutNode,
} from "../../../../core/index.ts";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { sourceValue, StyleSources } from "./StyleSources.tsx";

afterEach(cleanup);

const design: DesignSystem = {
  schemaVersion: DESIGN_SCHEMA_VERSION,
  variables: { colors: [], fonts: [], fontSizes: [], spacings: [] },
  defaults: { h2: { color: "#111111" } },
  classes: [{ id: "card", name: "Card", style: { color: "#aa0000", opacity: 0.5 } }],
};

const heading = {
  id: "head0001",
  type: "heading",
  props: { text: "Hi", level: 2 },
  classes: ["card"],
  style: { opacity: 1 },
} as LayoutNode;

describe("W-318 Where styles come from", () => {
  test("W-318 lists each property with its source and what it overrides", async () => {
    const root = await mount(
      <StyleSources node={heading} design={design} device="desktop" state="normal" />,
    );
    expect(root.querySelector("summary")?.textContent).toContain("2 set, 1 inherited");
    const color = root.querySelector('[data-emvb-source="color"]');
    expect(color?.getAttribute("data-kind")).toBe("class");
    expect(color?.textContent).toContain(".Card");
    expect(color?.textContent).toContain("overrides Site default (H2) (#111111)");
    const opacity = root.querySelector('[data-emvb-source="opacity"]');
    expect(opacity?.getAttribute("data-kind")).toBe("local");
    expect(opacity?.textContent).toContain("overrides .Card (0.5)");
  });

  test("W-318 says so when nothing is set", async () => {
    const bare = { id: "s", type: "section", props: {}, children: [] } as unknown as LayoutNode;
    const root = await mount(
      <StyleSources node={bare} design={design} device="mobile" state="normal" />,
    );
    expect(root.textContent).toContain("nothing set");
  });

  test("W-318 values read short", () => {
    expect(sourceValue({ value: 12, unit: "px" })).toBe("12px");
    expect(sourceValue({ var: "brand" })).toBe("var brand");
    expect(
      sourceValue(
        { var: "brand" },
        {
          ...design,
          variables: {
            ...design.variables,
            colors: [{ id: "brand", name: "Brand blue", value: "#1d4ed8" }],
          },
        },
      ),
    ).toBe("Brand blue");
    expect(sourceValue({ a: "x".repeat(60) }).endsWith("…")).toBe(true);
  });
});
