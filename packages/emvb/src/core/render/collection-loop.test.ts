import { describe, expect, test } from "bun:test";
import { canDrop } from "../arrange.ts";
import { emptyDesign } from "../schema/design.ts";
import { Layout as LayoutSchema, type LayoutNode } from "../schema/layout.ts";
type Layout = LayoutSchema;
import { collectCollectionLoops, type ThemePostFields } from "../theme/dynamic.ts";
import { renderPage } from "./index.ts";

const design = emptyDesign();
const title = { id: "ptit0001", type: "post-title", props: {} } as LayoutNode;
const empty = {
  id: "lemp0001",
  type: "loop-empty",
  props: {},
  children: [{ id: "etxt0001", type: "text", props: { text: "Nothing yet" } }],
} as LayoutNode;
const loop = (props: Record<string, unknown>, children: LayoutNode[] = [title, empty]) =>
  ({ id: "loop0001", type: "loop", props, children }) as LayoutNode;
const page = (...children: LayoutNode[]): Layout =>
  ({
    schemaVersion: 13,
    root: { id: "root0001", type: "container", props: {}, children },
  }) as Layout;
const entry = (n: number): ThemePostFields => ({
  id: `e${n}`,
  slug: `e-${n}`,
  title: `Entry ${n}`,
  excerpt: "",
  content: "",
  permalink: `/projects/e-${n}`,
});

describe("collection Loops (W-308)", () => {
  test("the schema takes collection, display, columns, limit and order, and refuses bad values", () => {
    const ok = LayoutSchema.safeParse(
      page(
        loop({ collection: "projects", display: "cards", columns: 3, limit: 6, order: "title" }),
      ),
    );
    expect(ok.success).toBe(true);
    for (const bad of [
      { collection: "Projects!" },
      { columns: 7 },
      { limit: 0 },
      { limit: 51 },
      { display: "carousel" },
      { order: "random" },
    ]) {
      expect(LayoutSchema.safeParse(page(loop(bad))).success).toBe(false);
    }
  });

  test("a collection Loop lists the host's entries, capped at its limit, without the Empty state", () => {
    const { html } = renderPage(page(loop({ collection: "projects", limit: 2 })), design, {
      dynamic: { collections: { loop0001: [entry(1), entry(2), entry(3)] } },
    });
    expect(html.match(/class="emvb-loop-item"/g)?.length).toBe(2);
    expect(html).toContain("Entry 1");
    expect(html).not.toContain("Entry 3");
    expect(html).not.toContain("Nothing yet");
  });

  test("no entries: the public page shows the designed Empty state, or nothing", () => {
    const withEmpty = renderPage(page(loop({ collection: "projects" })), design, {
      dynamic: { collections: { loop0001: [] } },
    }).html;
    expect(withEmpty).toContain("Nothing yet");
    expect(withEmpty).not.toContain("emvb-loop-item");
    const bare = renderPage(page(loop({ collection: "projects" }, [title])), design, {
      dynamic: { collections: {} },
    }).html;
    expect(bare).toBe('<div class="emvb-root emvb-container"></div>');
  });

  test("the editor shows sample entries before real ones load, and the Empty state below", () => {
    const { html } = renderPage(page(loop({ collection: "projects", limit: 2 })), design, {
      mode: "editor",
    });
    expect(html).toContain("projects entry 1");
    expect(html.match(/data-emvb-loop-item/g)?.length).toBe(2);
    expect(html).toContain("Nothing yet");
    expect(html.indexOf("Nothing yet")).toBeGreaterThan(html.lastIndexOf("data-emvb-loop-item"));
  });

  test("grid and cards get their class and a columns property; list gets neither", () => {
    const cards = renderPage(
      page(loop({ collection: "projects", display: "cards", columns: 3 })),
      design,
      {
        dynamic: { collections: { loop0001: [entry(1)] } },
      },
    );
    expect(cards.html).toContain("emvb-loop-cards");
    expect(cards.css).toContain("--emvb-loop-columns:3");
    const list = renderPage(page(loop({ collection: "projects", display: "list" })), design, {
      dynamic: { collections: { loop0001: [entry(1)] } },
    });
    expect(list.html).not.toMatch(/emvb-loop-(grid|cards)/);
  });

  test("hosts fetch each collection Loop with a sane limit and order", () => {
    expect(
      collectCollectionLoops(
        page(loop({ collection: "projects", order: "oldest" }), loop({}, [title])),
      ),
    ).toEqual([{ nodeId: "loop0001", collection: "projects", limit: 6, order: "oldest" }]);
  });

  test("an Empty state can only be dropped into a Loop", () => {
    const layout = page(loop({ collection: "projects" }, [title]), {
      id: "box00001",
      type: "container",
      props: {},
      children: [],
    } as LayoutNode);
    const fresh = { id: "lemp0002", type: "loop-empty", props: {}, children: [] } as LayoutNode;
    expect(canDrop(layout, { kind: "new", node: fresh }, "box00001").ok).toBe(false);
    expect(canDrop(layout, { kind: "new", node: fresh }, "loop0001").ok).toBe(true);
  });
});
