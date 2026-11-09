import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { auditPage } from "./audit.ts";

const all = ["desktop", "laptop", "tablet", "mobile"];
const h = (id: string, level: number, extra: Record<string, unknown> = {}) => ({
  id,
  type: "heading",
  props: { text: "T", level },
  ...extra,
});

describe("elements hidden on every device are left out of the check (W-413)", () => {
  test("no H1, order or link issues from hidden elements", () => {
    const issues = auditPage(
      {
        schemaVersion: 15,
        root: {
          id: "root0001",
          type: "container",
          props: {},
          children: [
            h("head0001", 1, { hiddenOn: all }),
            h("head0002", 1),
            h("head0003", 4, { hiddenOn: all }),
            h("head0004", 2),
            { id: "lnk00001", type: "link", props: { text: "", href: "/x" }, hiddenOn: all },
          ],
        },
      } as unknown as Layout,
      emptyDesign(),
    ).issues;
    expect(issues.map((i) => `${i.rule}:${i.nodeId}`)).toEqual([]);
  });
  test("hidden on some devices is still checked", () => {
    const issues = auditPage(
      {
        schemaVersion: 15,
        root: {
          id: "root0001",
          type: "container",
          props: {},
          children: [
            h("head0001", 1),
            { id: "lnk00001", type: "link", props: { text: "", href: "/x" }, hiddenOn: ["mobile"] },
          ],
        },
      } as unknown as Layout,
      emptyDesign(),
    ).issues;
    expect(issues.map((i) => i.rule)).toEqual(["link-name"]);
  });
});
