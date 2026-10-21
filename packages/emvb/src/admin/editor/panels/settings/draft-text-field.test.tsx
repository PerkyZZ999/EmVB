import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import {
  ELEMENT_DESCRIPTORS,
  type FieldDescriptor,
  type LayoutNode,
} from "../../../../core/index.ts";
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

describe("a box Link refuses a bad URL with an inline error (W-176)", () => {
  test("the container's Link field shows the message and saves nothing for a bad URL", async () => {
    const field = ELEMENT_DESCRIPTORS.find((d) => d.type === "container")?.fields.find(
      (f) => f.key === "href",
    );
    if (!field) throw new Error("no container Link field");
    const { sent, seen } = await run(field, undefined, [
      { type: "javascript:alert(1)", end: "blur" },
      { type: "//elsewhere.example", end: "enter" },
      { type: "https://example.com/plans", end: "blur" },
    ]);
    const message = "Use a full URL such as https://example.com or a path such as /pricing.";
    expect(seen.map((shown) => shown.includes(message))).toEqual([false, true, false]);
    // W-429: another scheme gets its own message.
    expect(seen[0]).toContain("Only web (https://)");
    expect(sent).toEqual(["https://example.com/plans"]);
  });
});

describe("a required text field emptied or overlong is not stored (W-192)", () => {
  test("Accordion item Title and Tab label keep the last savable value", async () => {
    const summary = ELEMENT_DESCRIPTORS.find((d) => d.type === "accordion-item")?.fields.find(
      (f) => f.key === "summary",
    ) as FieldDescriptor;
    const node = {
      id: "item0001",
      type: "accordion-item",
      props: { summary: "Q1" },
      children: [],
    } as unknown as LayoutNode;
    const sent: unknown[] = [];
    const host = await mount(
      <DraftTextField field={summary} node={node} onChange={(next) => sent.push(next.props)} />,
    );
    const input = host.querySelector("input") as HTMLInputElement;
    for (const value of ["", "x".repeat(2001), "Q2"]) {
      // oxlint-disable-next-line no-await-in-loop
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
          input,
          value,
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      if (value === "") expect(host.textContent).toContain("can't be empty");
    }
    expect(sent).toEqual([{ summary: "Q2" }]);
  });
});

test("UX-041: a list field says one per line and ties the note to its text area", async () => {
  const field: FieldDescriptor = { key: "items", kind: "list-items", label: "Items" };
  const node = { id: "list0001", type: "list", props: { items: ["One"] } } as LayoutNode;
  const host = await mount(<DraftTextField field={field} node={node} onChange={() => undefined} />);
  const listArea = host.querySelector("textarea");
  const hintId = listArea?.getAttribute("aria-describedby") ?? "";
  expect(hintId === "" ? "no description" : document.getElementById(hintId)?.textContent).toBe(
    "One per line.",
  );
});

test("UX-045: a text field shows its explanation up front and describes the input with it", async () => {
  const field: FieldDescriptor = {
    key: "label",
    kind: "text",
    label: "Name",
    optional: true,
    message: "Names the menu for assistive technology. Leave it blank to use Menu.",
  };
  const node = { id: "menu0001", type: "menu", props: {} } as unknown as LayoutNode;
  const host = await mount(<DraftTextField field={field} node={node} onChange={() => undefined} />);
  const id = host.querySelector("input")?.getAttribute("aria-describedby") ?? "";
  expect(id ? document.getElementById(id)?.textContent : "not described").toBe(
    "Names the menu for assistive technology. Leave it blank to use Menu.",
  );
});

test("UX-045: field explanations say such as, not e.g.", () => {
  const eg = ELEMENT_DESCRIPTORS.flatMap((d) =>
    d.fields.filter((f) => f.message?.includes("e.g.")).map((f) => `${d.type}.${f.key}`),
  );
  expect(eg).toEqual([]);
});

const describedBy = (host: HTMLElement) => {
  const id = host.querySelector("input")?.getAttribute("aria-describedby") ?? "";
  return id ? (document.getElementById(id)?.textContent ?? "missing") : "none";
};
const loopNode = { id: "loop0001", type: "loop", props: {} } as unknown as LayoutNode;

test("UX-047: a number field says what empty means", async () => {
  const field: FieldDescriptor = {
    key: "limit",
    kind: "int",
    label: "Entries to show",
    optional: true,
    min: 1,
    max: 50,
    message: "1 to 50 entries from the collection. Leave it empty for 6.",
  };
  const host = await mount(
    <DraftTextField field={field} node={loopNode} onChange={() => undefined} />,
  );
  expect(describedBy(host)).toBe("1 to 50 entries from the collection. Leave it empty for 6.");
});

test("UX-047: a number field's error-only message stays out of sight until it applies", async () => {
  const field: FieldDescriptor = {
    key: "width",
    kind: "int",
    label: "Width (px)",
    optional: true,
    message: "Width must be a positive whole number.",
  };
  const host = await mount(
    <DraftTextField field={field} node={loopNode} onChange={() => undefined} />,
  );
  expect(host.querySelector("input") ? describedBy(host) : "no input").toBe("none");
});

test("UX-060: layout validation messages say such as, not e.g.", async () => {
  const source = await Bun.file(`${import.meta.dir}/../../../../core/schema/layout.ts`).text();
  const messages = [...source.matchAll(/"[^"\n]*\be\.g\.[^"\n]*"/g)].map((m) => m[0]);
  expect(source.includes("such as plan:pro") ? messages : ["layout.ts not read"]).toEqual([]);
});

test("UX-073: the Video URL says which links it takes before any error", async () => {
  const field: FieldDescriptor = {
    key: "url",
    kind: "href",
    label: "Video URL",
    message: "Use a YouTube or Vimeo link, or a media file path such as /_emdash/api/media/file/….",
  };
  const video = {
    id: "vide0001",
    type: "video",
    props: { url: "", title: "T" },
  } as unknown as LayoutNode;
  const host = await mount(
    <DraftTextField field={field} node={video} onChange={() => undefined} />,
  );
  expect(describedBy(host)).toBe(
    "Use a YouTube or Vimeo link, or a media file path such as /_emdash/api/media/file/….",
  );
});

test("UX-074: the SVG markup box says what it accepts before anything is pasted", async () => {
  const field: FieldDescriptor = {
    key: "markup",
    kind: "textarea",
    label: "SVG markup",
    message: "Paste safe SVG only (no scripts or external links).",
  };
  const svg = { id: "svgx0001", type: "svg", props: { markup: "" } } as unknown as LayoutNode;
  const host = await mount(<DraftTextField field={field} node={svg} onChange={() => undefined} />);
  const id = host.querySelector("textarea")?.getAttribute("aria-describedby") ?? "";
  expect(id ? document.getElementById(id)?.textContent : "not described").toBe(
    "Paste safe SVG only (no scripts or external links).",
  );
});

test("W-788: refused SVG markup marks the field invalid and points to the reason", async () => {
  const field: FieldDescriptor = {
    key: "markup",
    kind: "textarea",
    label: "SVG markup",
    message: "Paste safe SVG only (no scripts or external links).",
  };
  const svg = (markup: string) =>
    ({ id: "svgx0002", type: "svg", props: { markup } }) as unknown as LayoutNode;
  const bad = await mount(
    <DraftTextField
      field={field}
      node={svg('<svg viewBox="0 0 1 1" onload="x()"><rect/></svg>')}
      onChange={() => undefined}
    />,
  );
  const badArea = bad.querySelector("textarea");
  expect(badArea?.getAttribute("aria-invalid")).toBe("true");
  const said = (badArea?.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "");
  expect(said.some((t) => t.includes("This SVG can't be shown"))).toBe(true);
  const good = await mount(
    <DraftTextField
      field={field}
      node={svg('<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>')}
      onChange={() => undefined}
    />,
  );
  expect(good.querySelector("textarea")?.getAttribute("aria-invalid")).toBeNull();
});
