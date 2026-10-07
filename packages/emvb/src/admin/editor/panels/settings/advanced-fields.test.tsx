import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { validateLayout, type Layout, type LayoutNode } from "../../../../core/index.ts";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { AttributesEditor, HtmlIdField } from "./AdvancedFields.tsx";
import { attributeErrors, htmlIdError, savableAttributes } from "./advanced-rules.ts";

afterEach(cleanup);

async function type(control: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(control, value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const button = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === text,
  ) as HTMLButtonElement;

const layout: Layout = {
  schemaVersion: 12,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "head0001", type: "heading", props: { text: "Hi", level: 2 }, htmlId: "hero" },
      { id: "butn0001", type: "button", props: { text: "Go" } },
    ],
  },
};

describe("Advanced CSS id and attributes never make the page unsavable (W-189)", () => {
  test("the rules match the layout schema", () => {
    expect(htmlIdError("", layout, "butn0001")).toBeNull();
    expect(htmlIdError("cta", layout, "butn0001")).toBeNull();
    expect(htmlIdError("my id", layout, "butn0001")).toMatch(/letter/);
    expect(htmlIdError("1abc", layout, "butn0001")).toMatch(/letter/);
    expect(htmlIdError("hero", layout, "butn0001")).toMatch(/Another element/);
    expect(htmlIdError("hero", layout, "head0001")).toBeNull();
    const rows = [
      { name: "data-", value: "" },
      { name: "data-ok", value: "1" },
      { name: "onclick", value: "x" },
      { name: "data-ok", value: "2" },
      { name: "data-emvb-id", value: "x" },
      { name: "aria-label", value: "x".repeat(201) },
      { name: "data-bell", value: "a\u0007b" },
      { name: "data-ec-form", value: "" },
    ];
    expect(attributeErrors(rows).map((e) => e !== null)).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
    const kept = savableAttributes(rows);
    expect(kept).toEqual([{ name: "data-ok", value: "1" }]);
    const node = { ...layout.root.children[1], attributes: kept } as LayoutNode;
    expect(validateLayout({ ...layout, root: { ...layout.root, children: [node] } }).ok).toBe(true);
  });

  test("Add attribute stores nothing until the name is valid; a refused name shows why", async () => {
    const sent: unknown[] = [];
    const host = await mount(
      <AttributesEditor attributes={undefined} onChange={(next) => sent.push(next)} />,
    );
    await act(async () => button(host, "Add attribute").click());
    expect(sent).toEqual([]);
    const name = host.querySelectorAll("input")[0] as HTMLInputElement;
    const value = host.querySelectorAll("input")[1] as HTMLInputElement;
    await type(name, "onclick");
    expect(sent).toEqual([]);
    expect(host.textContent).toContain("Use data-* or aria-*");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    await type(name, "data-Track");
    expect(name.value).toBe("data-track");
    await type(value, "hero");
    expect(sent.at(-1)).toEqual([{ name: "data-track", value: "hero" }]);
    expect(value.maxLength).toBe(200);
  });

  test("a bad or taken CSS id stays in the field with an error and is not stored", async () => {
    const sent: (string | undefined)[] = [];
    const node = layout.root.children[1] as LayoutNode;
    const host = await mount(
      <HtmlIdField node={node} layout={layout} onChange={(next) => sent.push(next.htmlId)} />,
    );
    const input = host.querySelector("input") as HTMLInputElement;
    await type(input, "hero");
    await type(input, "my id");
    expect(sent).toEqual([]);
    expect(input.value).toBe("my id");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    await type(input, "1st");
    expect(host.textContent).toContain("Start with a letter");
    await type(input, "cta");
    expect(sent).toEqual(["cta"]);
  });
});
