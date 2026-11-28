import { beforeEach, describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout } from "../schema/layout.ts";
import { renderPage } from "../render/index.ts";
import { defineExtension } from "./define.ts";
import { clearExtensions, liveElement, rememberExtensions } from "./registry.ts";
import { safeExtensionOutput } from "./safe-nodes.ts";
import { slotNameOf } from "./slots.ts";
import { validateLayout } from "../validate.ts";
import { canHoldChild, clearSlotRules, holdsChildren, setSlotRules } from "./slot-rules.ts";
import type { ExtensionOutputNode } from "./types.ts";

const PKG = "emvb-ext-cards";
const CARD = `ext:${PKG}/card`;
const TWO = `ext:${PKG}/two`;
const TABS = `ext:${PKG}/tabs`;
const PANEL = `ext:${PKG}/panel`;

/** An element with one slot named `body`. Its output marks where the stored children go. */
const element = (name: string, slots: { name: string; accepts?: string[] }[], output: string) => ({
  name,
  label: name,
  schema: { type: "object" as const, properties: {} },
  fields: [],
  defaults: () => ({}),
  slots: slots.map((s) => ({ label: s.name, ...s })),
  render: (): ExtensionOutputNode[] => [{ type: "ext-slot", name: output }],
});

const cards = () =>
  defineExtension({
    id: PKG,
    label: "Cards",
    elements: [
      element("card", [{ name: "body", accepts: ["text"] }], "body"),
      element("two", [{ name: "a" }, { name: "b" }], "a"),
      element("undeclared", [{ name: "body" }], "other"),
      {
        // A marker nested in a container. Its type allows a marker at the top level only, so the
        // nested form needs a cast; at runtime it works at any depth.
        ...element("boxed", [{ name: "body" }], "body"),
        render: () =>
          [
            { type: "container", props: {}, children: [{ type: "ext-slot", name: "body" }] },
          ] as unknown as ExtensionOutputNode[],
      },
    ],
  });

/** A page with one card whose stored children are a heading and a text node. */
const pageWithCard = (type: string): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        id: "card0001",
        type,
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text: "Skipped", level: 2 } },
          { id: "text0001", type: "text", props: { text: "Kept copy" } },
        ],
      },
    ],
  },
});

beforeEach(() => {
  clearExtensions();
  clearSlotRules();
});

describe("slot markers in output", () => {
  test("a valid marker keeps its name beside the validated node", () => {
    const [node] = safeExtensionOutput([{ type: "ext-slot", name: "body" }]);
    expect(node && slotNameOf(node)).toBe("body");
  });

  test("a marker with a name that is not a slot name is refused", () => {
    expect(safeExtensionOutput([{ type: "ext-slot", name: "Bad Name" }])).toEqual([]);
  });
});

describe("rendering the stored children into the slot", () => {
  test("the children an element declares accepts render in its slot", () => {
    rememberExtensions([cards()]);
    const page = renderPage(pageWithCard(CARD), emptyDesign(), { mode: "public" });
    expect(page.html).toContain("Kept copy");
    expect(page.html).toContain("emvb-ext-slot");
  });

  test("a child not on the slot's accepts list does not render", () => {
    rememberExtensions([cards()]);
    const page = renderPage(pageWithCard(CARD), emptyDesign(), { mode: "public" });
    expect(page.html).not.toContain("Skipped");
  });

  test("a marker nested in a container renders the children there", () => {
    rememberExtensions([cards()]);
    const page = renderPage(pageWithCard(`ext:${PKG}/boxed`), emptyDesign(), { mode: "public" });
    expect(page.html).toContain("Kept copy");
    expect(page.html).toContain("Skipped");
  });

  test("with the extension missing, the children stay saved and visitors see nothing", () => {
    const stored = pageWithCard(CARD);
    const page = renderPage(stored, emptyDesign(), { mode: "public" });
    expect(page.html).not.toContain("Kept copy");
    expect(page.html).not.toContain("Skipped");
    expect(validateLayout(stored).ok).toBe(true);
    expect(JSON.stringify(stored)).toContain("Kept copy");
  });

  test("a marker whose name the element does not declare renders nothing", () => {
    rememberExtensions([cards()]);
    const undeclared = pageWithCard(`ext:${PKG}/undeclared`);
    const page = renderPage(undeclared, emptyDesign(), { mode: "public" });
    expect(page.html).not.toContain("Kept copy");
  });
});

describe("manifest declarations", () => {
  test("an element with more than one slot is not registered (1.5 allows one)", () => {
    rememberExtensions([cards()]);
    expect(liveElement(TWO)).toBeUndefined();
    expect(liveElement(CARD)).toBeDefined();
  });

  test("a slot's accepts list is kept as stored types", () => {
    rememberExtensions([cards()]);
    const manifest = liveElement(CARD)?.manifest;
    expect(manifest?.slots?.[0]?.accepts).toEqual(["text"]);
  });
});

describe("drop rules (setSlotRules / canHoldChild)", () => {
  test("only an element with a slot holds children", () => {
    setSlotRules([{ type: CARD, slots: [{}] }]);
    expect(holdsChildren(CARD)).toBe(true);
    expect(holdsChildren("container")).toBe(false);
  });

  test("a part lives only inside the element that lists it", () => {
    setSlotRules([
      { type: TABS, slots: [{}], parts: [PANEL] },
      { type: PANEL, slots: [{}], parts: [] },
    ]);
    expect(canHoldChild(TABS, PANEL)).toBe(true);
    expect(canHoldChild("container", PANEL)).toBe(false);
    expect(canHoldChild(CARD, PANEL)).toBe(false);
  });

  test("an element with accepts takes only those children; without accepts, any non-part", () => {
    setSlotRules([
      { type: CARD, slots: [{ accepts: ["text"] }] },
      { type: TABS, slots: [{}] },
    ]);
    expect(canHoldChild(CARD, "text")).toBe(true);
    expect(canHoldChild(CARD, "heading")).toBe(false);
    expect(canHoldChild(TABS, "heading")).toBe(true);
  });
});
