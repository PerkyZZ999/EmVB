import { describe, expect, test } from "bun:test";
import type { Layout } from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { loadPartTemplates, loadSectionTemplates } from "./section-templates.ts";

const layout = {
  schemaVersion: 17,
  root: { id: "root0001", type: "container", props: {}, children: [] },
} as Layout;

describe("section templates (W-374)", () => {
  test("a failed sibling keeps the sections that loaded", async () => {
    const read = (id: string) =>
      id === "bad" ? Promise.reject(new Error("missing")) : Promise.resolve(layout);
    const result = await loadSectionTemplates({} as Fetcher, ["good", "bad"], read);
    expect(result["good"]).toBe(layout);
    expect(result["bad"]).toBeUndefined();
  });
});

describe("part templates on the canvas (W-658)", () => {
  const loopNode = (id: string, itemPartId: string) => ({
    id,
    type: "loop",
    props: { itemPartId },
    children: [],
  });
  const withRoot = (children: unknown[]) =>
    ({
      schemaVersion: 17,
      root: { id: "root0001", type: "container", props: {}, children },
    }) as unknown as Layout;

  test("a chosen Loop Item and a Loop Item nested inside it both load", async () => {
    const outerItem = withRoot([loopNode("loop0002", "inner")]);
    const innerItem = withRoot([]);
    const parts: Record<string, Layout> = { outer: outerItem, inner: innerItem };
    const asked: string[] = [];
    const read = (id: string, kind: string) => {
      asked.push(`${kind}:${id}`);
      return Promise.resolve(kind === "loop_item" ? (parts[id] ?? null) : null);
    };
    const result = await loadPartTemplates(
      {} as Fetcher,
      withRoot([loopNode("loop0001", "outer")]),
      read,
    );
    expect(result.loopTemplates["outer"]).toBe(outerItem);
    expect(result.loopTemplates["inner"]).toBe(innerItem);
    expect(asked).toEqual(["loop_item:outer", "loop_item:inner"]);
  });

  test("a loop item that leads back to itself is read once", async () => {
    const self = withRoot([loopNode("loop0002", "self")]);
    let reads = 0;
    const read = () => {
      reads++;
      return Promise.resolve(self);
    };
    const result = await loadPartTemplates({} as Fetcher, self, read);
    expect(result.loopTemplates["self"]).toBe(self);
    expect(reads).toBe(1);
  });
});
