import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { s1Page } from "../fixtures/layouts.ts";
import {
  clearExtensions,
  defaultElement,
  defineExtension,
  ELEMENT_DESCRIPTORS,
  rememberExtensions,
  type ElementType,
} from "../../src/core/index.ts";
import { KNOWN_NODE_SCHEMAS } from "../../src/core/schema/layout.ts";
import { AGENT_SAMPLE_PROPS } from "../../src/mcp/agent-defaults.ts";
import { createTestRuntime, ROLES, userWithRole } from "./runtime.ts";

// W-1089: public issues #28, #29 and #38 against agents' direct tools.

let t: Awaited<ReturnType<typeof createTestRuntime>>;
beforeEach(async () => {
  clearExtensions();
  t = await createTestRuntime();
  await t.agentSettings();
});
afterEach(async () => {
  clearExtensions();
  await t.dispose();
});

type Node = { id: string; type: string; props: Record<string, unknown>; children?: Node[] };
type Result = { success: boolean; data?: unknown; error?: { code: string; message: string } };
const call = async <T>(tool: string, input: unknown) =>
  (await t.mcp(tool, input, userWithRole(ROLES.editor))) as Result & { data: T };
const ok = async <T>(tool: string, input: unknown) => {
  const result = await call<T>(tool, input);
  if (!result.success) throw new Error(JSON.stringify(result.error));
  return result.data;
};
const layoutOf = async (pageId: string) =>
  (await ok<{ rev: string; layout: { root: Node } }>("get_layout", { pageId })).layout.root;
const nodeOf = async (pageId: string, id: string) => {
  const find = (node: Node): Node | undefined =>
    node.id === id ? node : (node.children ?? []).map(find).find(Boolean);
  return find(await layoutOf(pageId));
};
const h1s = (node: Node): Node[] => [
  ...(node.type === "heading" && node.props.level === 1 ? [node] : []),
  ...(node.children ?? []).flatMap(h1s),
];
const hero = (text: string) => ({
  type: "layout-section",
  props: {},
  children: [{ type: "heading", props: { text, level: 1 } }],
});

describe("W-1089 #28: create_page's title heading and an agent's own H1", () => {
  test("W-1089 an added section with an H1 replaces the untouched title heading", async () => {
    const { pageId } = await ok<{ pageId: string }>("create_page", { title: "Spring sale" });
    const before = await layoutOf(pageId);
    const title = h1s(before)[0] as Node;
    expect(title.props.text).toBe("Spring sale");
    const added = await ok<{ changed: string[]; summary: string }>("add_element", {
      pageId,
      parentId: before.id,
      element: hero("Spring sale: 30 % off"),
    });
    const after = await layoutOf(pageId);
    expect(h1s(after).map((h) => h.props.text)).toEqual(["Spring sale: 30 % off"]);
    expect(after.children?.[0]?.id).toBe(added.changed[0]);
    expect(added.changed).toContain(title.id);
    expect(added.summary).toContain("title heading");
  });

  test("W-1089 an H1 added at the top replaces the title heading too", async () => {
    const { pageId } = await ok<{ pageId: string }>("create_page", { title: "Menu" });
    const root = await layoutOf(pageId);
    await ok("add_element", { pageId, parentId: root.id, index: 0, element: hero("Our menu") });
    expect(h1s(await layoutOf(pageId)).map((h) => h.props.text)).toEqual(["Our menu"]);
  });

  test("W-1089 a title heading someone changed stays, and an H2 never removes it", async () => {
    const { pageId } = await ok<{ pageId: string }>("create_page", { title: "Team" });
    const root = await layoutOf(pageId);
    const title = h1s(root)[0] as Node;
    await ok("add_element", {
      pageId,
      parentId: root.id,
      element: { type: "heading", props: { text: "People", level: 2 } },
    });
    expect(h1s(await layoutOf(pageId)).map((h) => h.id)).toEqual([title.id]);
    await ok("update_element", {
      pageId,
      nodeId: title.id,
      set: { props: { text: "Our team" } },
    });
    await ok("add_element", { pageId, parentId: root.id, element: hero("Meet us") });
    expect(h1s(await layoutOf(pageId)).length).toBe(2);
  });

  test("W-1089 create_page with titleHeading false starts empty; the default keeps the heading", async () => {
    const { pageId } = await ok<{ pageId: string }>("create_page", {
      title: "Blank",
      titleHeading: false,
    });
    expect((await layoutOf(pageId)).children).toEqual([]);
    const kept = await ok<{ pageId: string }>("create_page", { title: "Kept" });
    expect(h1s(await layoutOf(kept.pageId)).map((h) => h.props.text)).toEqual(["Kept"]);
  });
});

/**
 * Optional props whose default is a setting, not sample content: they stay on agent elements.
 * Labels and titles that name a control or a picture for screen readers stay too. Every optional
 * default is in one list or the other (agent-defaults test).
 */
const AGENT_KEPT_PROPS: Readonly<Partial<Record<ElementType, readonly string[]>>> = {
  rating: ["max"],
  "social-link": ["newTab"],
  counter: ["separator"],
  progress: ["showValue"],
  countdown: ["ticking"],
  cta: ["layout"],
  headline: ["level"],
  "share-buttons": ["shape"],
  "search-form": ["placeholder"],
  image: ["decorative"],
  icon: ["title", "decorative", "size"],
  "form-step": ["title"],
  "text-input": ["label"],
  textarea: ["label"],
  select: ["label"],
  checkbox: ["label"],
  radio: ["label"],
  submit: ["label"],
  "post-title": ["level"],
  "post-image": ["decorative"],
  svg: ["title", "decorative", "size"],
  "menu-item": ["href"],
};

describe("W-1089 #29: agent-made elements get no sample content", () => {
  test("W-1089 every optional default is either sample content or a kept setting", () => {
    const schemas = new Map(
      KNOWN_NODE_SCHEMAS.map((schema) => [
        (schema.shape.type as unknown as { value: string }).value,
        schema.shape.props as unknown as {
          shape?: Record<string, { safeParse(v: unknown): { success: boolean } }>;
        },
      ]),
    );
    const unclassified: string[] = [];
    for (const { type } of ELEMENT_DESCRIPTORS) {
      const props = (defaultElement(type as ElementType, "x") as { props?: object }).props ?? {};
      const shape = schemas.get(type)?.shape ?? {};
      for (const key of Object.keys(props)) {
        if (!shape[key]?.safeParse(undefined).success) continue;
        const listed = [
          ...(AGENT_SAMPLE_PROPS[type as ElementType] ?? []),
          ...(AGENT_KEPT_PROPS[type as ElementType] ?? []),
        ];
        if (!listed.includes(key)) unclassified.push(`${type}.${key}`);
      }
      for (const key of AGENT_SAMPLE_PROPS[type as ElementType] ?? []) {
        // A sample prop must be optional, or dropping it would leave the element invalid.
        if (!shape[key]?.safeParse(undefined).success)
          unclassified.push(`${type}.${key} (required)`);
      }
    }
    expect(unclassified).toEqual([]);
  });

  const add = async (element: unknown) => {
    const pageId = (
      (await t.savePage({ title: "Home", layout: s1Page() })) as { data: { item: { id: string } } }
    ).data.item.id;
    const out = await ok<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element,
    });
    return (await nodeOf(pageId, out.changed[0] as string)) as Node;
  };

  test("W-1089 a price table keeps only what the agent set, plus required props", async () => {
    const node = await add({
      type: "price-table",
      props: {
        title: "Team",
        price: "49",
        features: ["10 seats"],
        buttonText: "Buy",
        buttonHref: "/buy",
      },
    });
    expect(node.props).toEqual({
      title: "Team",
      price: "49",
      features: ["10 seats"],
      buttonText: "Buy",
      buttonHref: "/buy",
    });
  });

  test("W-1089 required props still get valid values; settings stay", async () => {
    const table = await add({ type: "price-table", props: {} });
    expect(table.props).toEqual({ title: "Pro", price: "29" });
    const map = await add({ type: "map", props: { address: "1 Main St, Springfield" } });
    expect(map.props).toEqual({ address: "1 Main St, Springfield" });
    const cta = await add({ type: "cta", props: { title: "Join" } });
    expect(cta.props).toEqual({ title: "Join", layout: "top" });
    const counter = await add({ type: "counter", props: { value: 3 } });
    expect(counter.props).toEqual({ value: 3, separator: "," });
    const icon = await add({ type: "icon", props: {} });
    expect(icon.props["title"]).toBe("Star");
  });

  test("W-1089 nested children get no sample content either", async () => {
    const list = await add({
      type: "flexbox",
      props: {},
      children: [{ type: "testimonial", props: { quote: "Great.", name: "Ana" } }],
    });
    expect(list.children?.[0]?.props).toEqual({ quote: "Great.", name: "Ana" });
  });
});

const notice = defineExtension({
  id: "fieldnotes",
  elements: [
    {
      name: "notice",
      label: "Notice",
      schema: {
        type: "object",
        properties: {
          text: { type: "string", maxLength: 40 },
          tone: { type: "enum", values: ["info", "warn"], default: "info" },
        },
        required: ["text"],
      },
      fields: [
        { key: "text", kind: "text", label: "Text" },
        {
          key: "tone",
          kind: "select",
          label: "Tone",
          options: [
            { value: "info", label: "Info" },
            { value: "warn", label: "Warning" },
          ],
        },
      ],
      render: (props) => ({ id: "n", type: "text", props: { text: String(props.text ?? "") } }),
    },
  ],
});

describe("W-1089 #38: extension elements in agents' direct tools", () => {
  const newPage = async () =>
    ((await t.savePage({ title: "Home", layout: s1Page() })) as { data: { item: { id: string } } })
      .data.item.id;

  test("W-1089 list_element_types lists a registered extension element with its schema and fields", async () => {
    type Entry = { type: string; name: string; props: unknown; fields?: unknown[] };
    const before = await ok<{ elements: Entry[] }>("list_element_types", {});
    expect(before.elements.some((e) => e.type.startsWith("ext:"))).toBe(false);
    rememberExtensions([notice]);
    const all = await ok<{ elements: Entry[] }>("list_element_types", {});
    const entry = all.elements.find((e) => e.type === "ext:fieldnotes/notice");
    expect(entry?.name).toBe("Notice");
    expect(JSON.stringify(entry?.props)).toContain('"maxLength":40');
    expect(entry?.fields?.length).toBe(2);
    const one = await ok<{ elements: Entry[] }>("list_element_types", {
      type: "ext:fieldnotes/notice",
    });
    expect(one.elements.map((e) => e.type)).toEqual(["ext:fieldnotes/notice"]);
  });

  test("W-1089 add_element and update_element take a registered extension element, checked by its schema", async () => {
    rememberExtensions([notice]);
    const pageId = await newPage();
    const added = await ok<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "ext:fieldnotes/notice", props: { text: "Closed Monday" } },
    });
    const id = added.changed[0] as string;
    expect((await nodeOf(pageId, id))?.props).toEqual({ text: "Closed Monday", tone: "info" });
    await ok("update_element", { pageId, nodeId: id, set: { props: { tone: "warn" } } });
    expect((await nodeOf(pageId, id))?.props).toEqual({ text: "Closed Monday", tone: "warn" });

    const badAdd = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "ext:fieldnotes/notice", props: { text: "x".repeat(41) } },
    });
    expect(badAdd.error?.code).toBe("INVALID_INPUT");
    expect(badAdd.error?.message).toContain("text");
    const badUpdate = await call("update_element", {
      pageId,
      nodeId: id,
      set: { props: { tone: "loud" } },
    });
    expect(badUpdate.error?.code).toBe("INVALID_INPUT");
    expect((await nodeOf(pageId, id))?.props["tone"]).toBe("warn");
  });

  test("W-1089 an extension element that isn't registered is refused and not listed", async () => {
    const pageId = await newPage();
    const refused = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "ext:fieldnotes/notice", props: { text: "Hi" } },
    });
    expect(refused.error?.code).toBe("REFUSED");
    expect(refused.error?.message).toContain("list_element_types");
    expect((await call("list_element_types", { type: "ext:fieldnotes/notice" })).error?.code).toBe(
      "NOT_FOUND",
    );

    rememberExtensions([notice]);
    const added = await ok<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "ext:fieldnotes/notice", props: { text: "Hi" } },
    });
    clearExtensions();
    const gone = await call("update_element", {
      pageId,
      nodeId: added.changed[0],
      set: { props: { text: "Changed" } },
    });
    expect(gone.error?.code).toBe("REFUSED");
    const label = await call("update_element", {
      pageId,
      nodeId: added.changed[0],
      set: { editorLabel: "Note" },
    });
    expect(label.error?.code).toBe("REFUSED");
  });
});
