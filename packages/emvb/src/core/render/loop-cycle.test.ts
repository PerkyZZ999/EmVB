import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import { renderPage } from "./index.ts";

const layoutOf = (children: unknown[]) => ({
  schemaVersion: 17,
  root: { id: "root0001", type: "container", props: {}, children },
});
const loopUsing = (id: string, itemPartId: string) => ({
  id,
  type: "loop",
  props: { itemPartId },
  children: [],
});
const title = { id: "ptit0001", type: "post-title", props: {} };
const posts = Array.from({ length: 3 }, (_, i) => ({
  id: `p${i}`,
  slug: `p${i}`,
  title: `Post ${i}`,
  excerpt: "",
  content: "",
  permalink: `/p${i}`,
}));
const render = (loopTemplates: Record<string, unknown>) =>
  renderPage(layoutOf([loopUsing("loop0001", "aa")]) as never, emptyDesign(), {
    dynamic: { loopTemplates, posts } as never,
  }).html;

describe("loop item parts that lead back to themselves (W-654)", () => {
  test("a part holding a Loop that uses the same part renders once, not forever", () => {
    const html = render({ aa: layoutOf([title, loopUsing("loop0002", "aa")]) });
    expect(html.match(/class="emvb-loop-item"/g)?.length).toBe(3);
  });
  test("two parts that use each other stop too", () => {
    const html = render({
      aa: layoutOf([title, loopUsing("loop0002", "bb")]),
      bb: layoutOf([title, loopUsing("loop0003", "aa")]),
    });
    expect(html.match(/class="emvb-loop-item"/g)?.length).toBe(3 + 9);
  });
});
