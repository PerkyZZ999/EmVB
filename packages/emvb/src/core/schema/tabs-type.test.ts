import { describe, expect, test } from "bun:test";
import { Layout, type TabsNode } from "./layout.ts";

const page = (tabs: unknown) => ({
  schemaVersion: 17,
  root: { id: "root0001", type: "container", props: {}, children: [tabs] },
});

describe("W-790 the Tabs type matches its schema", () => {
  test("tabs take no props: the schema refuses href and newTab", () => {
    const ok: TabsNode = { id: "tabs0001", type: "tabs", props: {}, children: [] };
    // W-790: href and newTab were on the type but never in the schema.
    const linked = { id: "tabs0002", type: "tabs", props: { href: "/x" }, children: [] };
    const newTab = { id: "tabs0003", type: "tabs", props: { newTab: true }, children: [] };
    expect(Layout.safeParse(page(ok)).success).toBe(true);
    expect(Layout.safeParse(page(linked)).success).toBe(false);
    expect(Layout.safeParse(page(newTab)).success).toBe(false);
  });
});
