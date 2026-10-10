import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import {
  ELEMENT_DESCRIPTORS,
  validateLayout,
  type FieldDescriptor,
  type LayoutNode,
} from "../../../../core/index.ts";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { DraftTextField } from "./DraftTextField.tsx";

afterEach(cleanup);

const field = ELEMENT_DESCRIPTORS.find((d) => d.type === "loop")?.fields.find(
  (f) => f.key === "perPage",
) as FieldDescriptor;

test("Posts per page stores a whole number the schema accepts, 1 to 50 (W-223)", async () => {
  const node = { id: "loop0001", type: "loop", props: {}, children: [] } as unknown as LayoutNode;
  const sent: LayoutNode[] = [];
  const host = await mount(
    <DraftTextField field={field} node={node} onChange={(next) => sent.push(next)} />,
  );
  expect(host.querySelector("label")?.textContent).toBe("Posts per page");
  const input = host.querySelector("input") as HTMLInputElement;
  const type = async (value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
  await type("60");
  expect(sent).toHaveLength(0);
  expect(host.textContent).toContain("1 to 50");
  await type("5");
  expect(sent.at(-1)?.props).toEqual({ perPage: 5 });
  const root = { id: "root0001", type: "container", props: {}, children: [sent.at(-1)] };
  expect(validateLayout({ schemaVersion: 14, root }).ok).toBe(true);
});
