import { describe, expect, test } from "bun:test";
import { emptyDesign, type DesignSystem, type Layout } from "../index.ts";
import { renderPage } from "./index.ts";

const page = (extra: Record<string, unknown>): Layout =>
  ({
    schemaVersion: 17,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        { id: "box00001", type: "container", props: {}, children: [], classes: ["hero"], ...extra },
      ],
    },
  }) as Layout;
const design: DesignSystem = {
  ...emptyDesign(),
  classes: [{ id: "hero", name: "Hero", style: { backgroundImage: "https://e.com/hero.jpg" } }],
};
const localRule = (css: string) => {
  const at = css.indexOf(".emvb-e-box00001{");
  return at < 0 ? "" : (css.slice(at).split("}")[0] ?? "");
};

describe("W-569: an element's own background layer keeps its class's image", () => {
  test("a local overlay on a class with an image keeps the image", () => {
    const out = renderPage(
      page({ style: { overlay: { color: "#000000", opacity: 0.5 } } }),
      design,
    );
    expect(localRule(out.css)).toContain("hero.jpg");
  });
  test("a tablet overlay keeps the class image too", () => {
    const out = renderPage(
      page({ devices: { tablet: { overlay: { color: "#000000", opacity: 0.5 } } } }),
      design,
    );
    const tablet = out.css.slice(out.css.indexOf("@media (max-width: 1024.98px)"));
    expect(localRule(tablet)).toContain("hero.jpg");
  });
});
