import { expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout, type LayoutNode } from "../schema/layout.ts";
import { measurePage } from "./meter.ts";

const image = (id: string, extra: Partial<LayoutNode> = {}): LayoutNode =>
  ({
    id,
    type: "image",
    props: { src: `/img/${id}.jpg`, alt: "x", width: 1600, height: 900 },
    ...extra,
  }) as LayoutNode;
const page = (children: LayoutNode[]): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: { id: "root0001", type: "container", props: {}, children },
});

test("an A/B test's images count once, for the heavier arm (W-973)", () => {
  const plain = measurePage(page([image("imga0001")]), emptyDesign());
  const ab = measurePage(
    page([
      image("imga0001", { variant: { test: "hero", arm: "a" } }),
      image("imgb0001", { variant: { test: "hero", arm: "b" } }),
    ]),
    emptyDesign(),
  );
  expect(ab.imageCount).toBe(1);
  expect(ab.bytes.images).toBe(plain.bytes.images);
});

test("the heavier arm wins when the arms differ", () => {
  const ab = measurePage(
    page([
      image("imga0001", { variant: { test: "hero", arm: "a" } }),
      {
        id: "boxb0001",
        type: "container",
        props: {},
        variant: { test: "hero", arm: "b" },
        children: [image("imgb0001"), image("imgb0002")],
      } as LayoutNode,
      image("imgc0001"),
    ]),
    emptyDesign(),
  );
  expect(ab.imageCount).toBe(3);
});
