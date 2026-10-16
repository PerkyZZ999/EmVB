import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { emptyDesign, type Layout, type LayoutNode } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { AddPanel } from "../AddPanel.tsx";
import { ElementPanel } from "../ElementPanel.tsx";
import { FieldBindControl } from "./FieldBindControl.tsx";
import { EditorHostContext } from "../../host.ts";
import { FormBindControl } from "./FormBindControl.tsx";
import { cleanup, mount, rerender } from "../../../../../test/dom/mount.ts";

afterEach(cleanup);

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("FormBindControl (W-036)", () => {
  test("admin path shows list when forms/list succeeds", async () => {
    const fetcher: Fetcher = async (path) => {
      if (path.includes("/forms/list")) {
        return new Response(
          JSON.stringify({
            data: { items: [{ id: "01FORM", name: "Contact", slug: "contact" }] },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 404 });
    };
    await mount(<FormBindControl value="" fetcher={fetcher} onChange={() => undefined} />);
    await flush();
    expect(document.querySelector('[data-emvb-form-bind="list"]') !== null).toBe(true);
    expect(document.querySelector('[data-emvb-form-bind="manual"]')?.outerHTML ?? null).toBeNull();
  });

  test("editor path shows manual id when list is forbidden", async () => {
    const fetcher: Fetcher = async () =>
      new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "no" } }), {
        status: 403,
      });
    await mount(<FormBindControl value="paste-me" fetcher={fetcher} onChange={() => undefined} />);
    await flush();
    expect(document.querySelector('[data-emvb-form-bind="manual"]') !== null).toBe(true);
    expect((document.querySelector("input") as HTMLInputElement | null)?.value).toBe("paste-me");
  });
});

describe("FieldBindControl (W-036)", () => {
  test("W-735: loading fields announces progress and keeps the input focused when options arrive", async () => {
    const pending = Promise.withResolvers<Response>();
    const sent: string[] = [];
    const fetcher: Fetcher = async () => pending.promise;
    const host = await mount(
      <FieldBindControl
        value="email"
        formId="01FORM"
        fetcher={fetcher}
        onChange={(name) => sent.push(name)}
      />,
    );
    const input = host.querySelector<HTMLInputElement>("input.emvb-mono");
    if (!input) throw new Error("No field name input");
    try {
      expect(host.querySelector('[role="status"]')?.textContent).toBe(
        "Loading form fields… You can enter a field name.",
      );
      expect(input.disabled).toBe(false);
      await act(async () => {
        input.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
          input,
          "unfinished name",
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () =>
        pending.resolve(
          Response.json({
            data: {
              pages: [
                { fields: [{ name: "email", type: "email", label: "Email", required: true }] },
              ],
            },
          }),
        ),
      );
      await flush();
      expect(host.querySelector<HTMLInputElement>("input.emvb-mono") === input).toBe(true);
      expect(document.activeElement === input).toBe(true);
      expect(input.value).toBe("unfinished name");
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(host.querySelector('[data-emvb-field-bind="list"]') !== null).toBe(true);
      expect(host.querySelector('[role="status"]')?.textContent).toBe("");
      expect(sent).toEqual([]);
    } finally {
      await act(async () => pending.resolve(Response.json({ data: { pages: [] } })));
    }
  });

  test.each([
    ["empty", "01FORM", "This form has no fields yet. Enter a field name manually."],
    ["unavailable", "01FORM", "Could not load form fields. Enter a field name manually."],
    [
      "no parent",
      undefined,
      "Choose a form on the parent Form element to list its fields, or enter a field name manually.",
    ],
  ])("W-735: %s definitions explain manual entry", async (result, formId, message) => {
    let requests = 0;
    const sent: string[] = [];
    const fetcher: Fetcher = async () => {
      requests++;
      return result === "empty"
        ? Response.json({ data: { pages: [] } })
        : new Response("{}", { status: 503 });
    };
    const host = await mount(
      <FieldBindControl
        value="email"
        formId={formId}
        fetcher={fetcher}
        onChange={(name) => sent.push(name)}
      />,
    );
    await flush();
    expect(host.querySelector('[role="status"]')?.textContent).toBe(message);
    const input = host.querySelector<HTMLInputElement>("input.emvb-mono");
    expect(input?.value).toBe("email");
    expect(input?.disabled).toBe(false);
    expect(host.querySelector('[data-emvb-field-bind="manual"]') !== null).toBe(true);
    expect(requests).toBe(formId ? 1 : 0);
    expect(sent).toEqual([]);
  });

  test("shows field options from definition", async () => {
    const fetcher: Fetcher = async () =>
      new Response(
        JSON.stringify({
          data: {
            pages: [
              {
                fields: [{ name: "email", type: "email", label: "Email", required: true }],
              },
            ],
          },
        }),
        { status: 200 },
      );
    await mount(
      <FieldBindControl value="" formId="01FORM" fetcher={fetcher} onChange={() => undefined} />,
    );
    await flush();
    expect(document.querySelector('[data-emvb-field-bind="list"]') !== null).toBe(true);
    expect(document.querySelector('[data-emvb-field-bind="manual"]')?.outerHTML ?? null).toBeNull();
  });

  test("falls back to manual field name without form id", async () => {
    const fetcher: Fetcher = async () => new Response("{}", { status: 404 });
    await mount(
      <FieldBindControl
        value="email"
        formId={undefined}
        fetcher={fetcher}
        onChange={() => undefined}
      />,
    );
    await flush();
    expect(document.querySelector('[data-emvb-field-bind="manual"]') !== null).toBe(true);
  });
});

const shown = () =>
  [...document.querySelectorAll('[data-kumo-part="trigger"] > span:first-child')].map(
    (el) => el.textContent,
  );

describe("form and field pickers show names, never sentinel values (QA-7)", () => {
  const forms: Fetcher = async (path) =>
    path.includes("/forms/list")
      ? new Response(
          JSON.stringify({ data: { items: [{ id: "01FORM", name: "Contact", slug: "contact" }] } }),
          { status: 200 },
        )
      : new Response("{}", { status: 404 });
  const fields: Fetcher = async () =>
    new Response(
      JSON.stringify({
        data: {
          pages: [{ fields: [{ name: "email", type: "email", label: "Email", required: true }] }],
        },
      }),
      { status: 200 },
    );

  test.each([
    ["", "Choose a form…"],
    ["01FORM", "Contact"],
    ["gone", "Current id (not in list)"],
  ])("form %p reads %p", async (value, label) => {
    await mount(<FormBindControl value={value} fetcher={forms} onChange={() => undefined} />);
    await flush();
    expect(shown()).toEqual([label]);
  });

  test.each([
    ["", "Choose a field…"],
    ["email", "Email *"],
    ["phone", "Choose a field…"],
  ])("field %p reads %p", async (value, label) => {
    await mount(
      <FieldBindControl
        value={value}
        formId="01FORM"
        fetcher={fields}
        onChange={() => undefined}
      />,
    );
    await flush();
    expect(shown()).toEqual([label]);
  });
});

describe("AddPanel forms group (W-036)", () => {
  test("hides Form group when formsAvailable is false", async () => {
    await mount(<AddPanel onAdd={() => undefined} formsAvailable={false} />);
    expect(document.querySelector('[data-emvb-add-tile="form"]')?.outerHTML ?? null).toBeNull();
    expect(document.querySelector('[data-emvb-add-tile="heading"]') !== null).toBe(true);
    const titles = [...document.querySelectorAll(".emvb-add-group-title")].map(
      (el) => el.textContent,
    );
    expect(titles).not.toContain("Form");
  });

  test("shows Form tiles when formsAvailable is true", async () => {
    await mount(<AddPanel onAdd={() => undefined} formsAvailable={true} />);
    expect(document.querySelector('[data-emvb-add-tile="form"]') !== null).toBe(true);
    const titles = [...document.querySelectorAll(".emvb-add-group-title")].map(
      (el) => el.textContent,
    );
    expect(titles).toContain("Form");
  });
});

describe("ElementPanel forms missing (W-036)", () => {
  const formLayout: Layout = {
    schemaVersion: 16,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        {
          id: "form0001",
          type: "form",
          props: { formId: "01FORM" },
          children: [
            { id: "inp00001", type: "text-input", props: { field: "email", label: "Email" } },
          ],
        },
      ],
    },
  };

  test("warns on form elements when forms plugin is missing", async () => {
    const form = formLayout.root.children[0] as LayoutNode;
    const stub: Fetcher = async () => new Response("{}", { status: 200 });
    await mount(
      <ElementPanel
        node={form}
        layout={formLayout}
        design={emptyDesign()}
        rejection={null}
        fetcher={stub}
        formsAvailable={false}
        onChange={() => undefined}
        onDesignChange={async () => undefined}
        onSelect={() => undefined}
      />,
    );
    expect(document.querySelector("[data-emvb-forms-missing]") !== null).toBe(true);
  });
});

describe("Forms links outside the EmDash admin (W-289)", () => {
  const listing: Fetcher = async (path) =>
    path.includes("/forms/list")
      ? new Response(
          JSON.stringify({ data: { items: [{ id: "01FORM", name: "Contact", slug: "contact" }] } }),
          { status: 200 },
        )
      : new Response("{}", { status: 404 });
  const forbidden: Fetcher = async () =>
    new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "no" } }), { status: 403 });
  const noAdmin = {
    exit: () => undefined,
    back: { label: "x", go: () => undefined },
    adminLinks: false,
  };
  const hrefs = () => [...document.querySelectorAll("a")].map((a) => a.getAttribute("href"));

  test("in the admin, both binders link to the Forms screen", async () => {
    await mount(<FormBindControl value="" fetcher={listing} onChange={() => undefined} />);
    await flush();
    expect(hrefs()).toEqual(["/_emdash/admin/plugins/emdash-forms/pages"]);
    await cleanup();
    await mount(<FormBindControl value="" fetcher={forbidden} onChange={() => undefined} />);
    await flush();
    expect(hrefs()).toEqual(["/_emdash/admin/plugins/emdash-forms/pages"]);
  });

  const noLinks = async (fetcher: Fetcher) => {
    await mount(
      <EditorHostContext.Provider value={noAdmin}>
        <FormBindControl value="" fetcher={fetcher} onChange={() => undefined} />
      </EditorHostContext.Provider>,
    );
    await flush();
    expect(hrefs()).toEqual([]);
    await cleanup();
  };

  test("a host without the admin (the playground) shows no Forms links", async () => {
    await noLinks(listing);
    await noLinks(forbidden);
  });
});

describe("the form picker marks paused forms (W-326)", () => {
  test("a paused form's option reads (paused)", async () => {
    const fetcher: Fetcher = async (path) =>
      path.includes("/forms/list")
        ? Response.json({
            data: {
              items: [
                { id: "01A", name: "Contact", slug: "contact", status: "active" },
                { id: "01B", name: "Survey", slug: "survey", status: "paused" },
              ],
            },
          })
        : new Response("{}", { status: 404 });
    await mount(<FormBindControl value="01B" fetcher={fetcher} onChange={() => undefined} />);
    await flush();
    const picker = document.querySelector('[data-emvb-form-bind="list"]')?.textContent ?? "";
    expect(picker).toContain("Survey (paused)");
    expect(picker).not.toContain("Contact (paused)");
  });
});

describe("field definition changes (W-721)", () => {
  const definition = (label: string) =>
    Response.json({
      data: {
        pages: [{ fields: [{ name: "email", type: "email", label, required: false }] }],
      },
    });
  const name = () => document.querySelector<HTMLInputElement>("input.emvb-mono")?.value;
  const hasList = () => document.querySelector('[data-emvb-field-bind="list"]') !== null;

  test.each(["form", "fetcher"])(
    "W-721: changing the %s hides old options until the new definition arrives",
    async (source) => {
      const pending = Promise.withResolvers<Response>();
      const sent: string[] = [];
      const onChange = (next: string) => sent.push(next);
      let requests = 0;
      const fetcher: Fetcher = async () =>
        ++requests === 1 ? definition("Old contact") : pending.promise;
      const nextFetcher: Fetcher = async () => pending.promise;
      try {
        await mount(
          <FieldBindControl value="email" formId="old" fetcher={fetcher} onChange={onChange} />,
        );
        await flush();
        expect(shown()).toEqual(["Old contact"]);

        await rerender(
          <FieldBindControl
            value="email"
            formId={source === "form" ? "new" : "old"}
            fetcher={source === "fetcher" ? nextFetcher : fetcher}
            onChange={onChange}
          />,
        );
        expect(hasList()).toBe(false);
        expect(name()).toBe("email");
        expect(sent).toEqual([]);

        await act(async () => pending.resolve(definition("New contact")));
        await flush();
        expect(shown()).toEqual(["New contact"]);
        expect(name()).toBe("email");
        expect(sent).toEqual([]);
      } finally {
        await act(async () => pending.resolve(definition("New contact")));
      }
    },
  );

  test.each(["another form", "no form"])(
    "W-721: a late old definition cannot restore options after moving to %s",
    async (destination) => {
      const old = Promise.withResolvers<Response>();
      const next = Promise.withResolvers<Response>();
      const fetcher: Fetcher = async (_path, init) => {
        const body = JSON.parse(String(init?.body)) as { id: string };
        return body.id === "old" ? old.promise : next.promise;
      };
      const onChange = () => undefined;
      try {
        await mount(
          <FieldBindControl value="email" formId="old" fetcher={fetcher} onChange={onChange} />,
        );
        await rerender(
          <FieldBindControl
            value="email"
            formId={destination === "another form" ? "new" : undefined}
            fetcher={fetcher}
            onChange={onChange}
          />,
        );
        await act(async () => next.resolve(definition("New contact")));
        await flush();
        expect(shown()).toEqual(destination === "another form" ? ["New contact"] : []);

        await act(async () => old.resolve(definition("Old contact")));
        await flush();
        expect(shown()).toEqual(destination === "another form" ? ["New contact"] : []);
        expect(hasList()).toBe(destination === "another form");
        expect(name()).toBe("email");
      } finally {
        await act(async () => {
          next.resolve(definition("New contact"));
          old.resolve(definition("Old contact"));
        });
      }
    },
  );
});
