import { describe, expect, test } from "bun:test";
import type { PublicPluginApiRouteHandler } from "emdash/plugin-utils";
import {
  defaultElement,
  emptyDesign,
  renderPage,
  type Layout,
  type LayoutNode,
} from "../core/index.ts";
import { formIdsInLayout, loadFormDefinitions } from "./forms-definitions.ts";

const form = (id: string, formId?: string): LayoutNode =>
  ({ ...defaultElement("form", id), props: formId ? { formId } : {} }) as LayoutNode;

const layout = (...children: LayoutNode[]): Layout => ({
  schemaVersion: 12,
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

describe("form definitions the forms plugin answers oddly (W-092)", () => {
  const answer = (data: unknown) => asHandler(async () => ({ success: true, data }));

  test("a definition without settings renders the form with the default submit label", async () => {
    const defs = await loadFormDefinitions(answer({ name: "Bare", pages: [] }), BASE, ["bare"]);
    expect(defs.get("bare")?.settings).toStrictEqual({});
    const { html } = renderPage(layout(form("form0001", "bare")), emptyDesign(), {
      formDefinitions: defs,
    });
    expect(html).toContain('data-submit-label="Submit"');
  });

  test("settings that aren't text, and pages, fields and options of the wrong shape, are left out", async () => {
    const defs = await loadFormDefinitions(
      answer({
        name: "Odd",
        settings: { submitLabel: 5, spamProtection: ["x"], extra: "kept" },
        pages: [
          null,
          { fields: "none" },
          {
            fields: [
              null,
              { name: 7 },
              { name: "email" },
              {
                name: "topic",
                type: "select",
                label: "Topic",
                required: "yes",
                placeholder: 3,
                options: [{ label: "A", value: "a" }, { label: 1, value: "b" }, "c"],
              },
            ],
          },
        ],
      }),
      BASE,
      ["odd"],
    );
    const odd = defs.get("odd");
    expect(odd?.settings as Record<string, unknown> | undefined).toStrictEqual({ extra: "kept" });
    expect(odd?.pages).toStrictEqual([
      { fields: [] },
      {
        fields: [
          { name: "email", type: "", label: "email", required: false },
          {
            name: "topic",
            type: "select",
            label: "Topic",
            required: false,
            options: [{ label: "A", value: "a" }],
          },
        ],
      },
    ]);
  });

  test("a text submit label is kept", async () => {
    const defs = await loadFormDefinitions(
      answer({ name: "Labelled", settings: { submitLabel: "Send" }, pages: [] }),
      BASE,
      ["labelled"],
    );
    const { html } = renderPage(layout(form("form0001", "labelled")), emptyDesign(), {
      formDefinitions: defs,
    });
    expect(html).toContain('data-submit-label="Send"');
  });
});

describe("field limits from the forms plugin (W-297)", () => {
  test("only finite numbers and a text pattern are kept", async () => {
    const field = (name: string, validation: unknown) => ({
      name,
      type: "text",
      label: name,
      required: false,
      validation,
    });
    const handler: Answer = async () => ({
      ...definition("contact"),
      pages: [
        {
          fields: [
            field("a", { min: 1, maxLength: "9", pattern: 5, accept: ".pdf", max: Infinity }),
            field("b", "junk"),
            field("c", { minLength: 2, pattern: "[a-z]+" }),
          ],
        },
      ],
    });
    const defs = await loadFormDefinitions(asHandler(handler), BASE, ["contact"]);
    const fields = defs.get("contact")?.pages[0]?.fields ?? [];
    expect(fields.map((f) => f.validation)).toEqual([
      { min: 1 },
      undefined,
      { minLength: 2, pattern: "[a-z]+" },
    ]);
    expect(fields[1]).not.toHaveProperty("validation");
  });
});
