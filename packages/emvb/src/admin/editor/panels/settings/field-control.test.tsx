import { afterEach, describe, expect, test } from "bun:test";
import { act, useState } from "react";
import type { FieldDescriptor, LayoutNode } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { cleanup, mount, settle } from "../../../../../test/dom/mount.ts";
import { FieldControl } from "./FieldControl.tsx";

afterEach(cleanup);

// W-091: the Content-tab router was only reached through whole-panel snapshots; what a boolean
// or select field commits, and the media field without a session, weren't checked.

const node = (props: Record<string, unknown>) =>
  ({ id: "nd000001", type: "heading", props }) as LayoutNode;

async function control(field: FieldDescriptor, props: Record<string, unknown>) {
  const sent: Record<string, unknown>[] = [];
  const host = await mount(
    <FieldControl
      field={field}
      node={node(props)}
      onChange={(next) => sent.push({ ...(next.props as Record<string, unknown>) })}
    />,
  );
  return { host, sent };
}

async function choose(label: string, option: string) {
  const trigger = document.querySelector<HTMLElement>(`[role="combobox"][aria-label="${label}"]`);
  if (!trigger) throw new Error(`no ${label} select`);
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    trigger.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
  const match = options.find((o) => o.textContent === option);
  if (!match) throw new Error(`no ${option} option`);
  await act(async () => {
    match.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

const LEVEL: FieldDescriptor = {
  key: "level",
  kind: "select",
  label: "Level",
  options: [
    { value: 2, label: "Heading 2" },
    { value: 3, label: "Heading 3" },
  ],
};

describe("FieldControl (W-091)", () => {
  test("a boolean field sets true, and turning it off removes the prop", async () => {
    const field: FieldDescriptor = { key: "newTab", kind: "boolean", label: "Open in a new tab" };
    const off = await control(field, { text: "A" });
    const toggle = () => off.host.querySelector<HTMLElement>('[role="switch"]');
    expect(toggle()?.getAttribute("aria-checked")).toBe("false");
    await act(async () => toggle()?.click());
    expect(off.sent).toStrictEqual([{ text: "A", newTab: true }]);
    await cleanup();
    const on = await control(field, { text: "A", newTab: true });
    const toggleOn = on.host.querySelector<HTMLElement>('[role="switch"]');
    expect(toggleOn?.getAttribute("aria-checked")).toBe("true");
    await act(async () => toggleOn?.click());
    expect(on.sent).toHaveLength(1);
    expect("newTab" in (on.sent[0] ?? {})).toBe(false);
  });

  test("a select shows the first option when unset and commits the option's own value type", async () => {
    const view = await control(LEVEL, {});
    expect(view.host.querySelector('[role="combobox"]')?.textContent).toContain("Heading 2");
    await choose("Level", "Heading 3");
    expect(view.sent).toStrictEqual([{ level: 3 }]);
  });

  test("a select shows the stored value's label", async () => {
    const view = await control(LEVEL, { level: 3 });
    expect(view.host.querySelector('[role="combobox"]')?.textContent).toContain("Heading 3");
  });

  test("a media field without a session says it needs one", async () => {
    const view = await control({ key: "src", kind: "media", label: "Image" }, {});
    expect(view.host.querySelector("[data-emvb-field='src']")?.textContent).toBe(
      "Media library needs a signed-in session.",
    );
  });
});

describe("picking a form field copies its label (W-166)", () => {
  test("Email from the definition replaces the default Name label", async () => {
    const sent: Record<string, unknown>[] = [];
    const fetcher: Fetcher = async () =>
      new Response(
        JSON.stringify({
          data: {
            pages: [{ fields: [{ name: "email", type: "email", label: "Email", required: true }] }],
          },
        }),
        { status: 200 },
      );
    const input = {
      id: "inp00001",
      type: "text-input",
      props: { field: "name", label: "Name" },
    } as LayoutNode;
    await mount(
      <FieldControl
        field={{ key: "field", kind: "text", label: "Field name" }}
        node={input}
        fetcher={fetcher}
        parentFormId="01FORM"
        onChange={(next) => sent.push({ ...(next.props as Record<string, unknown>) })}
      />,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await choose("Field", "Email *");
    expect(sent).toStrictEqual([{ field: "email", label: "Email" }]);
  });
});

describe("field-name recovery (W-720)", () => {
  const fields: Fetcher = async () =>
    Response.json({
      data: {
        pages: [
          {
            fields: [
              { name: "email", type: "email", label: "Email", required: true },
              { name: "note", type: "textarea", label: "Note", required: false },
            ],
          },
        ],
      },
    });

  async function boundField(initial: string) {
    const sent: Record<string, unknown>[] = [];
    function BoundField() {
      const [current, setCurrent] = useState<LayoutNode>({
        id: "input001",
        type: "text-input",
        props: { field: initial, label: "Old label" },
      });
      return (
        <FieldControl
          field={{ key: "field", kind: "text", label: "Field name" }}
          node={current}
          fetcher={fields}
          parentFormId="01FORM"
          onChange={(next) => {
            sent.push({ ...next.props });
            setCurrent(next);
          }}
        />
      );
    }
    await mount(<BoundField />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    return sent;
  }

  const input = () => document.querySelector<HTMLInputElement>("input.emvb-mono");
  async function typeName(value: string) {
    const field = input();
    if (!field) throw new Error("no field-name input");
    await act(async () => {
      field.focus();
      field.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      await settle();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new KeyboardEvent("keyup", { key: "a", bubbles: true }));
    });
  }

  test.each(["note", "email"])(
    "W-720: picking Email replaces an invalid draft when the stored name is %s",
    async (initial) => {
      const sent = await boundField(initial);
      await typeName("bad name");
      expect(input()?.value).toBe("bad name");
      expect(input()?.getAttribute("aria-invalid")).toBe("true");
      expect(sent).toEqual([]);
      expect(document.querySelector('[role="combobox"]')?.textContent).toContain("Choose a field…");

      await choose("Field", "Email *");
      expect(input()?.value).toBe("email");
      expect(input()?.getAttribute("aria-invalid")).not.toBe("true");
      expect(
        document.querySelector("[data-emvb-field-name-error]")?.textContent ?? null,
      ).toBeNull();
      expect(sent.at(-1)).toEqual({ field: "email", label: "Email" });
      expect(document.querySelector('[role="combobox"]')?.textContent).toContain("Email *");
    },
  );

  test("W-720: manual drafts stay editable and only valid names update the field", async () => {
    const sent = await boundField("email");
    await typeName("bad name");
    await act(async () => input()?.blur());
    expect(input()?.value).toBe("bad name");
    expect(sent).toEqual([]);

    const before = input();
    await typeName("first_name");
    expect(input()?.value).toBe("first_name");
    expect(sent).toEqual([{ field: "first_name", label: "Old label" }]);
    expect(document.activeElement === input() && input() === before).toBe(true);
    expect(document.querySelector("[data-emvb-field-name-error]")?.textContent ?? null).toBeNull();
  });
});

test("UX-042: the Image switches say when to turn them on, and the switch is described by it", async () => {
  const image = { id: "imag0001", type: "image", props: { src: "/a.jpg", alt: "A" } } as LayoutNode;
  const described = async (key: string) => {
    const field: FieldDescriptor = { key, kind: "boolean", label: key, optional: true };
    const host = await mount(
      <FieldControl field={field} node={image} onChange={() => undefined} />,
    );
    const id = host.querySelector('[role="switch"]')?.getAttribute("aria-describedby") ?? "";
    return id ? (host.querySelector(`[id="${id}"]`)?.textContent ?? "missing") : "not described";
  };
  expect(await described("priority")).toBe(
    "For the first large image on the page. Others load as they scroll into view.",
  );
  expect(await described("decorative")).toBe(
    "For images that add nothing to the text. Screen readers skip them.",
  );
  expect(await described("newTab")).toBe("not described");
});
