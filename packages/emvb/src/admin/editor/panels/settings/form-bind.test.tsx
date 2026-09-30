import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { emptyDesign, type Layout, type LayoutNode } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { AddPanel } from "../AddPanel.tsx";
import { ElementPanel } from "../ElementPanel.tsx";
import { FieldBindControl } from "./FieldBindControl.tsx";
import { FormBindControl } from "./FormBindControl.tsx";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";

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
    expect(document.querySelector('[data-emvb-form-bind="list"]')).toBeTruthy();
    expect(document.querySelector('[data-emvb-form-bind="manual"]')).toBeNull();
  });

  test("editor path shows manual id when list is forbidden", async () => {
    const fetcher: Fetcher = async () =>
      new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "no" } }), {
        status: 403,
      });
    await mount(<FormBindControl value="paste-me" fetcher={fetcher} onChange={() => undefined} />);
    await flush();
    expect(document.querySelector('[data-emvb-form-bind="manual"]')).toBeTruthy();
    expect((document.querySelector("input") as HTMLInputElement | null)?.value).toBe("paste-me");
  });
});

describe("FieldBindControl (W-036)", () => {
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
    expect(document.querySelector('[data-emvb-field-bind="list"]')).toBeTruthy();
    expect(document.querySelector('[data-emvb-field-bind="manual"]')).toBeNull();
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
    expect(document.querySelector('[data-emvb-field-bind="manual"]')).toBeTruthy();
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
    expect(document.querySelector('[data-emvb-add-tile="form"]')).toBeNull();
    expect(document.querySelector('[data-emvb-add-tile="heading"]')).toBeTruthy();
    const titles = [...document.querySelectorAll(".emvb-add-group-title")].map(
      (el) => el.textContent,
    );
    expect(titles).not.toContain("Form");
  });

  test("shows Form tiles when formsAvailable is true", async () => {
    await mount(<AddPanel onAdd={() => undefined} formsAvailable={true} />);
    expect(document.querySelector('[data-emvb-add-tile="form"]')).toBeTruthy();
    const titles = [...document.querySelectorAll(".emvb-add-group-title")].map(
      (el) => el.textContent,
    );
    expect(titles).toContain("Form");
  });
});

describe("ElementPanel forms missing (W-036)", () => {
  const formLayout: Layout = {
    schemaVersion: 2,
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
    expect(document.querySelector("[data-emvb-forms-missing]")).toBeTruthy();
  });
});
