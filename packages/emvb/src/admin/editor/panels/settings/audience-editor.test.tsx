import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { LayoutNode } from "../../../../core/index.ts";
import { cleanup, mount, rerender } from "../../../../../test/dom/mount.ts";
import { AudienceEditor, parseCountries } from "./AudienceEditor.tsx";
import { VariantEditor } from "./VariantEditor.tsx";

afterEach(cleanup);

const heading = { id: "head0001", type: "heading", props: { text: "Hi", level: 2 } } as LayoutNode;

const q = (selector: string): Element => {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
};

function change(el: Element, value: string | boolean) {
  const input = el as HTMLInputElement | HTMLSelectElement;
  if (typeof value === "boolean") (input as HTMLInputElement).click();
  else {
    const proto = Object.getPrototypeOf(input) as object;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(input, value);
    input.dispatchEvent(
      new Event(input.tagName === "SELECT" ? "change" : "input", { bubbles: true }),
    );
  }
}

describe("Visitors editor (W-313)", () => {
  test("country text is cleaned to unique two-letter codes", () => {
    expect(parseCountries("ca, us;fr  CA x usa")).toEqual(["CA", "US", "FR"]);
  });

  test("choosing Only and a device stores a valid audience; Everyone removes it", async () => {
    let node = heading;
    const onChange = (next: LayoutNode) => {
      node = next;
    };
    await mount(<AudienceEditor node={node} isRoot={false} onChange={onChange} />);
    await act(async () => change(q("[data-emvb-audience-mode]"), "only"));
    expect(node.audience).toEqual({});
    await rerender(<AudienceEditor node={node} isRoot={false} onChange={onChange} />);
    await act(async () => change(q('[data-emvb-audience-device="mobile"]'), true));
    expect(node.audience).toEqual({ devices: ["mobile"] });
    await rerender(<AudienceEditor node={node} isRoot={false} onChange={onChange} />);
    await act(async () => change(q("[data-emvb-audience-mode]"), "everyone"));
    expect("audience" in node).toBe(false);
  });

  test("the root has no Visitors or A/B section", async () => {
    await mount(
      <>
        <AudienceEditor node={heading} isRoot onChange={() => undefined} />
        <VariantEditor
          node={heading}
          isRoot
          onChange={() => undefined}
          onArrange={() => undefined}
        />
      </>,
    );
    expect(document.querySelector("[data-emvb-audience-editor]")).toBeNull();
    expect(document.querySelector("[data-emvb-variant-editor]")).toBeNull();
  });
});

describe("Visitors segments (W-329)", () => {
  test("segment text is cleaned to unique lowercase names", async () => {
    const { parseSegments } = await import("./AudienceEditor.tsx");
    expect(parseSegments("Member, pro;vip  member no!pe")).toEqual(["member", "pro", "vip"]);
  });

  test("typing segments stores them on blur; clearing removes the rule", async () => {
    let node = { ...heading, audience: {} } as LayoutNode;
    const onChange = (next: LayoutNode) => {
      node = next;
    };
    await mount(<AudienceEditor node={node} isRoot={false} onChange={onChange} />);
    const input = q("[data-emvb-audience-segments]") as HTMLInputElement;
    await act(async () => change(input, "Member, pro"));
    await act(async () => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(node.audience).toEqual({ segments: ["member", "pro"] });
    await rerender(<AudienceEditor node={node} isRoot={false} onChange={onChange} />);
    await act(async () => change(input, ""));
    await act(async () => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(node.audience).toEqual({});
  });
});
