import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { auditPage } from "./audit.ts";

const rules = (children: unknown[]) =>
  auditPage(
    {
      schemaVersion: 15,
      root: { id: "root0001", type: "container", props: {}, children },
    } as unknown as Layout,
    emptyDesign(),
  ).issues.map((i) => `${i.rule}:${i.nodeId}`);

const h1 = (id: string, hiddenOn?: string[]) => ({
  id,
  type: "heading",
  props: { text: id, level: 1 },
  ...(hiddenOn ? { hiddenOn } : {}),
});

describe("H1s are counted per device (W-444)", () => {
  test("a desktop H1 and a mobile H1 that swap are not two", () => {
    expect(
      rules([h1("head0001", ["mobile"]), h1("head0002", ["desktop", "laptop", "tablet"])]),
    ).toEqual([]);
    const box = {
      id: "boxx0001",
      type: "container",
      props: {},
      hiddenOn: ["mobile"],
      children: [h1("head0001")],
    };
    expect(rules([box, h1("head0002", ["desktop", "laptop", "tablet"])])).toEqual([]);
  });
  test("two H1s shown on the same device still warn", () => {
    expect(rules([h1("head0001", ["mobile"]), h1("head0002", ["desktop"])])).toEqual([
      "multiple-h1:head0002",
    ]);
    expect(rules([h1("head0001"), h1("head0002")])).toEqual(["multiple-h1:head0002"]);
  });
});
