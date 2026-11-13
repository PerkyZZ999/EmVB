import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { s1Page } from "../fixtures/layouts.ts";
import { createTestRuntime, ROLES, userWithRole } from "./runtime.ts";

// PLAN_1.2 part D: agents list, add and change the 1.2 widgets like any element.

let t: Awaited<ReturnType<typeof createTestRuntime>>;
beforeEach(async () => {
  t = await createTestRuntime();
  await t.agentSettings();
});
afterEach(async () => {
  await t.dispose();
});

type Result = { success: boolean; data?: unknown; error?: { code: string; message: string } };
const call = async <T>(tool: string, input: unknown) =>
  (await t.mcp(tool, input, userWithRole(ROLES.editor))) as Result & { data: T };
const newPage = async () =>
  ((await t.savePage({ title: "Home", layout: s1Page() })) as { data: { item: { id: string } } })
    .data.item.id;
type Element = { type: string; name: string; props: { properties?: Record<string, unknown> } };
const catalogue = async () =>
  new Map(
    (await call<{ elements: Element[] }>("list_element_types", {})).data.elements.map((e) => [
      e.type,
      e,
    ]),
  );

describe("Star rating over MCP (W-1023)", () => {
  test("list_element_types describes it", async () => {
    const rating = (await catalogue()).get("rating");
    expect(rating?.name).toBe("Star rating");
    expect(Object.keys(rating?.props.properties ?? {}).toSorted()).toEqual([
      "label",
      "max",
      "size",
      "value",
    ]);
  });

  test("add_element adds one; an out-of-range value is refused with the reason", async () => {
    const pageId = await newPage();
    const added = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "rating", props: { value: 4.5 } },
    });
    expect(added.success).toBe(true);
    const refused = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "rating", props: { value: 12 } },
    });
    expect(refused.success).toBe(false);
    expect(JSON.stringify(refused.error)).toContain("value");
  });
});

describe("Alert over MCP (W-1025)", () => {
  test("add_element adds a dismissible warning; an unknown kind is refused", async () => {
    const pageId = await newPage();
    expect((await catalogue()).get("alert")?.name).toBe("Alert");
    const added = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element: {
        type: "alert",
        props: { variant: "warning", text: "Maintenance tonight.", dismissible: true },
      },
    });
    expect(added.success).toBe(true);
    const refused = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "alert", props: { variant: "error", text: "x" } },
    });
    expect(refused.success).toBe(false);
  });
});

describe("Icon box over MCP (W-1020)", () => {
  test("add_element adds a linked icon box; an empty icon id is refused", async () => {
    const pageId = await newPage();
    expect((await catalogue()).get("icon-box")?.name).toBe("Icon box");
    const added = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element: {
        type: "icon-box",
        props: { iconId: "star", title: "Fast", text: "Quick.", href: "/features" },
      },
    });
    expect(added.success).toBe(true);
    const refused = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "icon-box", props: { iconId: "", title: "Fast", text: "Quick." } },
    });
    expect(refused.success).toBe(false);
  });
});

describe("Image box over MCP (W-1021)", () => {
  test("add_element adds one with alt text; one without alt is refused", async () => {
    const pageId = await newPage();
    expect((await catalogue()).get("image-box")?.name).toBe("Image box");
    const element = (alt: string) => ({
      type: "image-box",
      props: { src: "/_emdash/api/media/file/a.jpg", alt, title: "People", text: "Us." },
    });
    expect(
      (await call("add_element", { pageId, parentId: "root0001", element: element("Our team") }))
        .success,
    ).toBe(true);
    const refused = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: element(""),
    });
    expect(refused.success).toBe(false);
    expect(JSON.stringify(refused.error)).toContain("Alt text is required");
  });
});

describe("Testimonial over MCP (W-1022)", () => {
  test("add_element adds a rated testimonial; a rating above 10 is refused", async () => {
    const pageId = await newPage();
    expect((await catalogue()).get("testimonial")?.name).toBe("Testimonial");
    const element = (rating: number) => ({
      type: "testimonial",
      props: { quote: "It works.", name: "Ada", rating },
    });
    expect(
      (await call("add_element", { pageId, parentId: "root0001", element: element(5) })).success,
    ).toBe(true);
    expect(
      (await call("add_element", { pageId, parentId: "root0001", element: element(11) })).success,
    ).toBe(false);
  });
});

describe("Social icons over MCP (W-1024)", () => {
  test("Social links are allowed only in Social icons; add_element adds a list with links", async () => {
    const types = await catalogue();
    expect(types.get("social-icons")?.name).toBe("Social icons");
    expect(
      (types.get("social-link") as { allowedParents?: string[] } | undefined)?.allowedParents,
    ).toEqual(["social-icons"]);
    const pageId = await newPage();
    const added = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element: {
        type: "social-icons",
        props: { shape: "circle" },
        children: [
          { type: "social-link", props: { network: "github", href: "https://github.com/emvb" } },
        ],
      },
    });
    expect(added.success).toBe(true);
    const stray = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "social-link", props: { network: "github", href: "https://github.com/x" } },
    });
    expect(stray.success).toBe(false);
  });
});
