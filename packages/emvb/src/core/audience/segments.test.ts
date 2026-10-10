import { describe, expect, test } from "bun:test";
import { validateLayout } from "../validate.ts";
import { upgradeLayout } from "../migrate/index.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { audienceShows, audienceSummary } from "./rules.ts";

const node = (audience: LayoutNode["audience"]) =>
  ({ id: "head0001", type: "heading", props: { text: "Hi", level: 2 }, audience }) as LayoutNode;

describe("Visitors rules match host segments (W-329)", () => {
  test("Only members: shows for a visitor in any listed segment, not for others", () => {
    const members = node({ segments: ["member", "pro"] });
    expect(audienceShows(members, { segments: ["pro"] })).toBe(true);
    expect(audienceShows(members, { segments: ["guest"] })).toBe(false);
    expect(audienceShows(members, {})).toBe(false);
    expect(audienceShows(members, undefined)).toBe(false);
  });

  test("Everyone except members, and segments combine with other rules", () => {
    expect(
      audienceShows(node({ segments: ["member"], hide: true }), { segments: ["member"] }),
    ).toBe(false);
    expect(audienceShows(node({ segments: ["member"], hide: true }), {})).toBe(true);
    const both = node({ segments: ["member"], devices: ["mobile"] });
    expect(audienceShows(both, { segments: ["member"], device: "desktop" })).toBe(false);
    expect(audienceShows(both, { segments: ["member"], device: "mobile" })).toBe(true);
  });

  test("the summary names the segments", () => {
    expect(audienceSummary({ segments: ["member", "pro"] })).toBe("Only member/pro");
    expect(audienceSummary({ segments: ["a", "b", "c", "d"], hide: true })).toBe(
      "Hidden for a/b/c…",
    );
  });

  test("schema 14: segments are checked, and a v13 page upgrades unchanged", () => {
    const page = (segments: unknown): unknown => ({
      schemaVersion: 14,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [{ ...node(undefined), audience: { segments } }],
      },
    });
    expect(validateLayout(page(["member", "pro_1"])).ok).toBe(true);
    expect(validateLayout(page(["Member"])).ok).toBe(false);
    expect(validateLayout(page([])).ok).toBe(false);
    const v13 = { ...(page(["member"]) as Layout), schemaVersion: 13 };
    const { audience: _a, ...plain } = node(undefined);
    const old = { ...v13, root: { ...v13.root, children: [plain] } };
    expect(upgradeLayout(old)).toEqual({
      ok: true,
      doc: { ...old, schemaVersion: 14 },
      from: 13,
    });
  });
});
