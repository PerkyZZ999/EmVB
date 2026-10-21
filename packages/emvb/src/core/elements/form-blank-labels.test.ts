import { expect, test } from "bun:test";
import type { CheckboxNode, RadioNode, SelectNode, TextInputNode } from "../schema/layout.ts";
import { checkbox, radio, selectEl, textInput } from "./form-elements.ts";

const text = (v: unknown): string => JSON.stringify(v);

// W-587: a blank or spaces-only label left a checkbox with no accessible name, and a text field
// or radio group with an empty <label>/<legend>. A blank label falls back like an unset one.
test("a blank checkbox label falls back to the field name (W-587)", () => {
  for (const label of ["", "   "]) {
    const node = {
      id: "cb000001",
      type: "checkbox",
      props: { field: "agree", label },
    } as CheckboxNode;
    expect(text(checkbox.build(node, {}, []))).toContain(" agree");
  }
});

test("a blank text or radio label renders no empty label (W-587)", () => {
  const input = {
    id: "ti000001",
    type: "text-input",
    props: { field: "name", label: "  " },
  } as TextInputNode;
  expect(text(textInput.build(input, {}, []))).not.toContain('"label"');
  const group = {
    id: "ra000001",
    type: "radio",
    props: { field: "opt", label: "  " },
  } as RadioNode;
  expect(text(radio.build(group, {}, []))).not.toContain('"legend"');
});

// W-753: with no label and no placeholder, nothing named the field for a screen reader.
test("a field with no label is named by its field name (W-753)", () => {
  const input = (props: Record<string, string>) =>
    text(textInput.build({ id: "ti000002", type: "text-input", props } as TextInputNode, {}, []));
  expect(input({ field: "email", label: " " })).toContain('"aria-label":"email"');
  expect(input({ field: "email", label: "Email" })).not.toContain("aria-label");
  expect(input({ field: "email", placeholder: "Your email" })).not.toContain("aria-label");
  const group = { id: "ra000002", type: "radio", props: { field: "size" } } as RadioNode;
  expect(text(radio.build(group, {}, []))).toContain('"aria-label":"size"');
  const sel = { id: "se000002", type: "select", props: { field: "topic" } } as SelectNode;
  expect(text(selectEl.build(sel, {}, []))).toContain('"aria-label":"topic"');
});
