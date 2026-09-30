import { describe, expect, test } from "bun:test";
import type { PublicPluginApiRouteHandler } from "emdash/plugin-utils";
import { defaultElement, type Layout, type LayoutNode } from "../core/index.ts";
import { formIdsInLayout, loadFormDefinitions } from "./forms-definitions.ts";

const form = (id: string, formId?: string): LayoutNode =>
  ({ ...defaultElement("form", id), props: formId ? { formId } : {} }) as LayoutNode;

const layout = (...children: LayoutNode[]): Layout => ({
  schemaVersion: 3,
  root: { id: "root0001", type: "container", props: {}, children },
});

const definition = (name: string) => ({
  name,
  slug: name,
  status: "active",
  settings: {},
  pages: [],
});
const BASE = new URL("http://example.test/contact");

/** The forms route as the host calls it; it may answer bare or wrapped, which the type doesn't allow. */
type Answer = (plugin: string, method: string, path: string, request: Request) => Promise<unknown>;
const asHandler = (answer: Answer) => answer as unknown as PublicPluginApiRouteHandler;

describe("form ids in a layout (D-015)", () => {
  test("finds forms at any depth, once each, and skips forms with no form chosen", () => {
    const nested = {
      id: "cont0001",
      type: "container",
      props: {},
      children: [form("form0002", "newsletter"), form("form0003", "contact")],
    } as LayoutNode;
    expect(formIdsInLayout(layout(form("form0001", "contact"), nested, form("form0004")))).toEqual([
      "contact",
      "newsletter",
    ]);
  });

  test("a layout without forms has none", () => {
    expect(
      formIdsInLayout(layout({ id: "head0001", type: "heading", props: { text: "x", level: 1 } })),
    ).toEqual([]);
  });
});

describe("loading public form definitions (D-015)", () => {
  test("asks the forms plugin in-process for each form and keeps the definitions it returns", async () => {
    const calls: string[] = [];
    const handler: Answer = async (plugin, method, path, request) => {
      const { id } = (await request.json()) as { id: string };
      calls.push(`${plugin} ${method} ${path} ${request.url} ${id}`);
      // The route answers either wrapped in { success, data } or bare.
      return id === "contact" ? { success: true, data: definition("contact") } : definition(id);
    };
    const defs = await loadFormDefinitions(asHandler(handler), BASE, ["contact", "newsletter"]);
    expect([...defs.entries()]).toEqual([
      ["contact", definition("contact")],
      ["newsletter", definition("newsletter")],
    ]);
    expect(calls.toSorted()).toEqual([
      "emdash-forms POST /definition http://example.test/_emdash/api/plugins/emdash-forms/definition contact",
      "emdash-forms POST /definition http://example.test/_emdash/api/plugins/emdash-forms/definition newsletter",
    ]);
  });

  test("a form the plugin can't find, or answers without pages, is left out", async () => {
    const handler: Answer = async (_plugin, _method, _path, request) => {
      const { id } = (await request.json()) as { id: string };
      if (id === "missing") throw new Error("Form not found");
      if (id === "failed") return { success: false, error: { code: "NOT_FOUND" } };
      if (id === "odd") return { success: true, data: { name: "odd" } };
      return definition(id);
    };
    const defs = await loadFormDefinitions(asHandler(handler), BASE, [
      "missing",
      "failed",
      "odd",
      "contact",
    ]);
    expect([...defs.keys()]).toEqual(["contact"]);
  });

  test("without the forms plugin or without forms, nothing is asked", async () => {
    const calls: string[] = [];
    const handler: Answer = async (plugin) => {
      calls.push(plugin);
      return definition("x");
    };
    expect((await loadFormDefinitions(undefined, BASE, ["contact"])).size).toBe(0);
    expect((await loadFormDefinitions(asHandler(handler), BASE, [])).size).toBe(0);
    expect(calls).toEqual([]);
  });
});
