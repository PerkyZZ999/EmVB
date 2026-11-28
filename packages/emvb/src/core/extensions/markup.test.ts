import { beforeEach, describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout } from "../schema/layout.ts";
import { renderPage } from "../render/index.ts";
import { isAllowedAttr, isAllowedTag } from "../render/vnode.ts";
import { defineExtension } from "./define.ts";
import { markupOf, markupSpec } from "./markup.ts";
import { clearExtensions, rememberExtensions } from "./registry.ts";
import { safeExtensionOutput, withExtensionClasses } from "./safe-nodes.ts";
import type { ExtensionOutputNode } from "./types.ts";

/** The ten tags extensionApi 1.5 adds to the serializer's list (no `tfoot`). */
const NEW_TAGS = ["dialog", "table", "caption", "thead", "tbody", "tr", "th", "td", "pre", "kbd"];
/** The attributes extensionApi 1.5 adds to the attribute list. */
const NEW_ATTRS = ["scope", "rows", "selected", "accept", "inputmode"];

describe("markup allowlists (extensionApi 1.5)", () => {
  test.each(NEW_TAGS)("tag %s is on the list", (tag) => {
    expect(isAllowedTag(tag)).toBe(true);
  });

  test.each(NEW_ATTRS)("attribute %s is on the list", (name) => {
    expect(isAllowedAttr(name)).toBe(true);
  });

  test("tfoot, script and event handlers are not", () => {
    expect(isAllowedTag("tfoot")).toBe(false);
    expect(isAllowedTag("script")).toBe(false);
    expect(isAllowedAttr("onclick")).toBe(false);
    expect(isAllowedAttr("style")).toBe(false);
  });
});

describe("markupSpec", () => {
  test("accepts an allowed tag, its attributes and text", () => {
    expect(markupSpec({ tag: "td", attrs: { scope: "col" }, text: "Cell" })).toEqual({
      tag: "td",
      attrs: { scope: "col" },
      text: "Cell",
    });
  });

  test("refuses a tag, attribute, class, style or emvb id that is not allowed", () => {
    expect(markupSpec({ tag: "script" })).toBeUndefined();
    expect(markupSpec({ tag: "p", attrs: { onclick: "x()" } })).toBeUndefined();
    expect(markupSpec({ tag: "p", attrs: { style: "color:red" } })).toBeUndefined();
    expect(markupSpec({ tag: "p", attrs: { class: "x" } })).toBeUndefined();
    expect(markupSpec({ tag: "p", attrs: { id: "emvb-x" } })).toBeUndefined();
  });

  test("refuses a URL the href sanitizer rejects", () => {
    expect(markupSpec({ tag: "a", attrs: { href: "javascript:alert(1)" } })).toBeUndefined();
    expect(markupSpec({ tag: "a", attrs: { href: "https://example.com/" } })).toBeDefined();
  });

  test("refuses text or a value over the length cap", () => {
    expect(markupSpec({ tag: "p", text: "x".repeat(2001) })).toBeUndefined();
  });
});

describe("safe output of the markup node", () => {
  test("a valid markup node keeps its spec beside the validated node", () => {
    const node = only(
      safeExtensionOutput([{ type: "markup", props: { tag: "pre", text: "code" } }]),
    );
    expect(markupOf(node)).toEqual({ tag: "pre", attrs: {}, text: "code" });
  });

  test("a refused markup node is refused whole, so the element shows its placeholder", () => {
    expect(safeExtensionOutput([{ type: "markup", props: { tag: "script" } }])).toEqual([]);
  });

  test("the spec survives the admin round trip", () => {
    const node = only(
      safeExtensionOutput([
        { type: "markup", props: { tag: "th", attrs: { scope: "row" }, text: "Row" } },
      ]),
    );
    const again = only(safeExtensionOutput(withExtensionClasses([node])));
    expect(markupOf(again)).toEqual({ tag: "th", attrs: { scope: "row" }, text: "Row" });
  });
});

// --- Render: the element's markup, and its ids in one id space with the author's ---

const kit = () =>
  defineExtension({
    id: "emvb-ext-kit",
    label: "Kit",
    classes: { prefix: "kit-", allow: ["kit-table", "kit-cell"] },
    elements: [
      {
        name: "table",
        label: "Table",
        schema: { type: "object", properties: {} },
        fields: [],
        defaults: () => ({}),
        render: (): ExtensionOutputNode[] => [
          {
            type: "markup",
            props: { tag: "table", attrs: {} },
            children: [
              {
                type: "markup",
                props: { tag: "td", attrs: { scope: "col" }, text: "Cell" },
              },
            ],
          },
        ],
      },
      {
        name: "anchored",
        label: "Anchored",
        schema: { type: "object", properties: {} },
        fields: [],
        defaults: () => ({}),
        render: (): ExtensionOutputNode[] => [
          { type: "markup", props: { tag: "p", attrs: { id: "title" }, text: "Copy" } },
          { type: "markup", props: { tag: "a", attrs: { href: "#title" }, text: "Jump" } },
          { type: "markup", props: { tag: "a", attrs: { href: "#nowhere" }, text: "Lost" } },
        ],
      },
      {
        // The kit's classes on markup nodes, as a kit's own table needs them.
        name: "classed",
        label: "Classed",
        schema: { type: "object", properties: {} },
        fields: [],
        defaults: () => ({}),
        render: (): ExtensionOutputNode[] => [
          {
            type: "markup",
            props: { tag: "table" },
            extClasses: ["kit-table", "not-allowed"],
            children: [
              { type: "markup", props: { tag: "td", text: "Cell" }, extClasses: ["kit-cell"] },
            ],
          },
        ],
      },
      {
        // A form: EmVB generates its control and label ids (`emvb-field-<id>`) inside this output.
        name: "formed",
        label: "Formed",
        schema: { type: "object", properties: {} },
        fields: [],
        defaults: () => ({}),
        render: (): ExtensionOutputNode[] => [
          asOutput({
            id: "form0001",
            type: "form",
            props: { formId: "newsletter" },
            children: [
              { id: "inpt0001", type: "text-input", props: { field: "email", label: "Email" } },
            ],
          }),
        ],
      },
      {
        // References to EmVB ids that this output does not hold: the form's control, and its
        // honeypot, which sit in another element on the same page.
        name: "foreign",
        label: "Foreign",
        schema: { type: "object", properties: {} },
        fields: [],
        defaults: () => ({}),
        render: (): ExtensionOutputNode[] => [
          { type: "markup", props: { tag: "label", attrs: { for: "emvb-field-inpt0001" } } },
          { type: "markup", props: { tag: "a", attrs: { href: "#emvb-field-inpt0001" } } },
          { type: "markup", props: { tag: "p", attrs: { "aria-controls": "emvb-hp-form0001" } } },
        ],
      },
      {
        // A built-in node that carries an author id starting with emvb.
        name: "emvbid",
        label: "Emvbid",
        schema: { type: "object", properties: {} },
        fields: [],
        defaults: () => ({}),
        render: (): ExtensionOutputNode[] => [
          asOutput({
            id: "head0001",
            type: "heading",
            htmlId: "emvb-taken",
            props: { text: "Built in", level: 2 },
          }),
        ],
      },
    ],
  });
/** A built-in node as extension output. The cast skips only the type's strict prop shapes. */
const asOutput = (node: unknown): ExtensionOutputNode => node as ExtensionOutputNode;

/** The only item of a one-item list, without a non-null assertion. */
function only<T>(items: readonly T[]): T {
  const [item] = items;
  if (items.length !== 1 || item === undefined) throw new Error("expected exactly one item");
  return item;
}

const EXT_TABLE = "ext:emvb-ext-kit/table";
const EXT_ANCHORED = "ext:emvb-ext-kit/anchored";
const EXT_CLASSED = "ext:emvb-ext-kit/classed";
const EXT_FORMED = "ext:emvb-ext-kit/formed";
const EXT_FOREIGN = "ext:emvb-ext-kit/foreign";
const EXT_EMVBID = "ext:emvb-ext-kit/emvbid";

/** A page of the given children; a heading with an Advanced id `ext-title` joins them. */
const pageOf = (children: Layout["root"]["children"]): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: { id: "root0001", type: "container", props: {}, children },
});

const extNode = (id: string, type: string) => ({ id, type, props: {} });
const authorHeading = {
  id: "head0001",
  type: "heading",
  props: { text: "Author", level: 2 },
  htmlId: "ext-title",
};

beforeEach(() => {
  clearExtensions();
  rememberExtensions([kit()]);
});

describe("render of the markup node", () => {
  test("a table renders its own tags and attributes", () => {
    const page = renderPage(pageOf([extNode("ext00001", EXT_TABLE)]), emptyDesign(), {
      mode: "public",
    });
    expect(page.html).toContain("<table>");
    expect(page.html).toContain('<td scope="col">Cell</td>');
  });

  test("a markup node carries the kit's allowlisted classes, and no others", () => {
    const page = renderPage(pageOf([extNode("ext00001", EXT_CLASSED)]), emptyDesign(), {
      mode: "public",
    });
    expect(page.html).toContain('<table class="kit-table">');
    expect(page.html).toContain('<td class="kit-cell">Cell</td>');
    expect(page.html).not.toContain("not-allowed");
  });

  test("a reference to an id outside the element is dropped", () => {
    const page = renderPage(pageOf([extNode("ext00001", EXT_ANCHORED)]), emptyDesign(), {
      mode: "public",
    });
    expect(page.html).not.toContain("#nowhere");
    expect(page.html).toContain("Lost");
  });

  // The owner's case: an extension's generated id beside an Advanced id with the same spelling.
  // The author's id keeps its spelling (its CSS targets it); the extension's copies take a suffix,
  // and their references follow them, whichever element renders first.
  test.each([
    ["the extension first", [extNode("ext00001", EXT_ANCHORED), authorHeading]],
    ["the author's heading first", [authorHeading, extNode("ext00001", EXT_ANCHORED)]],
  ])("ids share one id space, with %s", (_order, children) => {
    const twice = [...children, extNode("ext00002", EXT_ANCHORED)];
    const page = renderPage(pageOf(twice), emptyDesign(), { mode: "public" });
    // The author keeps `ext-title` once.
    expect(page.html.match(/id="ext-title"/g)?.length).toBe(1);
    // Each extension copy has its own id, and its link points at that copy.
    for (const suffix of ["-r2", "-r3"]) {
      expect(page.html).toContain(`id="ext-title${suffix}"`);
      expect(page.html).toContain(`href="#ext-title${suffix}"`);
    }
  });
});

describe("emvb ids in extension output (#52 review)", () => {
  const publicPage = (children: Layout["root"]["children"]) =>
    renderPage(pageOf(children), emptyDesign(), { mode: "public" }).html;

  test("an author id in a synced section is reserved too, in either order", () => {
    const section = {
      schemaVersion: LAYOUT_SCHEMA_VERSION,
      root: { id: "root0001", type: "container", props: {}, children: [authorHeading] },
    };
    const ref = { id: "sect0001", type: "part-ref", props: { partId: "pa" }, children: [] };
    for (const children of [
      [extNode("ext00001", EXT_ANCHORED), ref],
      [ref, extNode("ext00001", EXT_ANCHORED)],
    ]) {
      const html = renderPage(pageOf(children as never), emptyDesign(), {
        mode: "public",
        dynamic: { sectionTemplates: { pa: section } } as never,
      }).html;
      expect(html.match(/id="ext-title"/g)?.length).toBe(1);
      expect(html).toContain('id="ext-title-r2"');
      expect(html).toContain('href="#ext-title-r2"');
    }
  });

  test("a form label inside extension output keeps its for, and the control its id", () => {
    const html = publicPage([extNode("ext00001", EXT_FORMED)]);
    expect(html).toContain('for="emvb-field-inpt0001"');
    expect(html).toContain('id="emvb-field-inpt0001"');
  });

  test("a reference to an emvb id outside the element's own output is dropped", () => {
    // The form is on the page, so its ids exist, but they are not in the other element's output.
    const html = publicPage([extNode("ext00001", EXT_FORMED), extNode("ext00002", EXT_FOREIGN)]);
    expect(html.match(/for="emvb-field-inpt0001"/g)?.length).toBe(1);
    expect(html).not.toContain('href="#emvb-field-inpt0001"');
    expect(html).not.toContain('aria-controls="emvb-hp-form0001"');
  });

  test("an author id that starts with emvb on a built-in output node is not written", () => {
    const html = publicPage([extNode("ext00001", EXT_EMVBID)]);
    expect(html).toContain("Built in");
    expect(html).not.toContain('id="emvb-taken"');
  });

  test("an author id that starts with emvb on a markup node refuses the element", () => {
    expect(markupSpec({ tag: "p", attrs: { id: "emvb-taken" } })).toBeUndefined();
  });
});
