import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { FieldDescriptor, LayoutNode } from "../../../../core/index.ts";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { DraftTextField } from "./DraftTextField.tsx";

// Recorded before W-086 L3 shared the committing input of number and link fields.
afterEach(cleanup);

type Step = { type: string; end: "blur" | "enter" | "none" };

async function run(field: FieldDescriptor, start: unknown, steps: Step[]) {
  const node = {
    id: "node0001",
    type: "heading",
    props: { [field.key]: start },
  } as unknown as LayoutNode;
  const sent: unknown[] = [];
  const host = await mount(
    <DraftTextField
      field={field}
      node={node}
      onChange={(next) => sent.push(next.props[field.key as never] ?? "<removed>")}
    />,
  );
  const control = host.querySelector("input, textarea") as HTMLInputElement | HTMLTextAreaElement;
  const initial = control.value;
  const seen: string[] = [];
  for (const step of steps) {
    // oxlint-disable-next-line no-await-in-loop
    await act(async () => {
      const proto = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set?.call(control, step.type);
      control.dispatchEvent(new Event("input", { bubbles: true }));
      if (step.end === "blur") control.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      if (step.end === "enter")
        control.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    seen.push(host.textContent ?? "");
  }
  return { initial, label: host.querySelector("label")?.textContent, sent, seen };
}

const text: FieldDescriptor = { key: "text", kind: "text", label: "Text" } as FieldDescriptor;
const area: FieldDescriptor = { key: "body", kind: "textarea", label: "Body" } as FieldDescriptor;
const list: FieldDescriptor = {
  key: "items",
  kind: "list-items",
  label: "Items",
} as FieldDescriptor;
const int: FieldDescriptor = { key: "level", kind: "int", label: "Level" } as FieldDescriptor;
const num: FieldDescriptor = {
  key: "height",
  kind: "number",
  label: "Height",
  message: "No negatives.",
} as FieldDescriptor;
const optNum: FieldDescriptor = {
  key: "size",
  kind: "number",
  label: "Size",
  optional: true,
} as FieldDescriptor;
const href: FieldDescriptor = { key: "href", kind: "href", label: "Link" } as FieldDescriptor;
const optHref: FieldDescriptor = {
  key: "href",
  kind: "href",
  label: "Link",
  optional: true,
} as FieldDescriptor;

const CASES: [string, FieldDescriptor, unknown, Step[]][] = [
  [
    "text",
    text,
    "Hi",
    [
      { type: "Hello", end: "none" },
      { type: "x".repeat(2001), end: "blur" },
    ],
  ],
  ["textarea", area, "a", [{ type: "one\ntwo  ", end: "blur" }]],
  [
    "list",
    list,
    ["a", "b"],
    [
      { type: "x  \n\n y \n", end: "blur" },
      { type: "  \n", end: "blur" },
    ],
  ],
  [
    "int",
    int,
    2,
    [
      { type: "0", end: "blur" },
      { type: "2.5", end: "enter" },
      { type: "20000", end: "blur" },
      { type: "3", end: "enter" },
      { type: "", end: "blur" },
    ],
  ],
  [
    "number",
    num,
    { value: 4, unit: "rem" },
    [
      { type: "-1", end: "blur" },
      { type: "abc", end: "enter" },
      { type: "0", end: "blur" },
      { type: "12.5", end: "enter" },
    ],
  ],
  [
    "optional number",
    optNum,
    undefined,
    [
      { type: "  ", end: "blur" },
      { type: "8", end: "blur" },
    ],
  ],
  [
    "href",
    href,
    "/a",
    [
      { type: "javascript:alert(1)", end: "blur" },
      { type: "  /pricing  ", end: "enter" },
      { type: "", end: "blur" },
      { type: "//evil.com", end: "blur" },
    ],
  ],
  [
    "optional href",
    optHref,
    "/a",
    [
      { type: "   ", end: "blur" },
      { type: "https://example.com", end: "enter" },
    ],
  ],
];

describe("draft text fields (W-021)", () => {
  for (const [name, field, start, steps] of CASES) {
    test(`${name} commits and reports errors as before`, async () => {
      expect(await run(field, start, steps)).toMatchSnapshot();
    });
  }
});

describe("multi-line fields are named by their label (W-124)", () => {
  for (const field of [area, list]) {
    test(`${field.kind} is labelled "${field.label}"`, async () => {
      const node = { id: "node0001", type: "text", props: {} } as unknown as LayoutNode;
      const host = await mount(<DraftTextField field={field} node={node} onChange={() => {}} />);
      const control = host.querySelector("textarea");
      const label = host.querySelector("label");
      expect(control?.id ?? "").not.toBe("");
      expect(label?.htmlFor).toBe(control?.id ?? "missing");
      expect(control?.labels?.[0]?.textContent).toBe(field.label);
    });
  }
});
