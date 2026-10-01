import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { FieldDescriptor, LayoutNode } from "../../../../core/index.ts";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
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
