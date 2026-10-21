import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { LayoutNode } from "../../../../core/index.ts";
import { cleanup, mount, rerender } from "../../../../../test/dom/mount.ts";
import { pickOption } from "../../../../../test/dom/select.ts";
import { AudienceEditor, parseCountries, readTimeZone } from "./AudienceEditor.tsx";
import { VariantEditor } from "./VariantEditor.tsx";

afterEach(cleanup);

const heading = { id: "head0001", type: "heading", props: { text: "Hi", level: 2 } } as LayoutNode;

const q = (selector: string): Element => {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
};

function change(el: Element, value: string | boolean) {
  const input = el as HTMLInputElement;
  if (typeof value === "boolean") input.click();
  else {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
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
    await pickOption(q("[data-emvb-audience-mode]"), "only");
    expect(node.audience).toEqual({});
    await rerender(<AudienceEditor node={node} isRoot={false} onChange={onChange} />);
    await act(async () => change(q('[data-emvb-audience-device="mobile"]'), true));
    expect(node.audience).toEqual({ devices: ["mobile"] });
    await rerender(<AudienceEditor node={node} isRoot={false} onChange={onChange} />);
    await pickOption(q("[data-emvb-audience-mode]"), "everyone");
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
    expect(parseSegments("Member, pro;vip  member no!pe plan:pro")).toEqual([
      "member",
      "pro",
      "vip",
      "plan:pro",
    ]);
  });

  test("a rejected segment name stays in the field and keeps the stored rule", async () => {
    let node = { ...heading, audience: { segments: ["member"] } } as LayoutNode;
    const onChange = (next: LayoutNode) => {
      node = next;
    };
    await mount(<AudienceEditor node={node} isRoot={false} onChange={onChange} />);
    const input = q("[data-emvb-audience-segments]") as HTMLInputElement;
    await act(async () => change(input, "no!pe"));
    await act(async () => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(node.audience?.segments).toEqual(["member"]);
    expect(input.value).toBe("no!pe");
    expect(q("[data-emvb-audience-segment-error]")?.textContent ?? "").toContain("no!pe");
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

describe("time zone field (W-438)", () => {
  test("zones are read whole, case fixed, and unknown ones refused", () => {
    expect(readTimeZone(" america/toronto ")).toBe("America/Toronto");
    expect(readTimeZone("")).toBe("");
    expect(readTimeZone("America/Torronto")).toBeNull();
    expect(readTimeZone("America/")).toBeNull();
  });

  test("a zone can be typed with its slash and is saved on blur", async () => {
    let node = { ...heading, audience: { hours: { from: 9, to: 17 } } } as LayoutNode;
    const onChange = (next: LayoutNode) => {
      node = next;
    };
    await mount(<AudienceEditor node={node} isRoot={false} onChange={onChange} />);
    const input = q("[data-emvb-audience-zone]") as HTMLInputElement;
    await act(async () => change(input, "America/"));
    expect(input.value).toBe("America/");
    await act(async () => change(input, "America/Toronto"));
    await act(async () => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(node.audience?.timeZone).toBe("America/Toronto");
  });
});

test("UK is read as GB, the code visitors' countries use (W-544)", () => {
  expect(parseCountries("uk, gb fr")).toEqual(["GB", "FR"]);
});

test("selecting another element clears the last one's segment error (W-608)", async () => {
  const a = { ...heading, audience: { segments: ["member"] } } as LayoutNode;
  const b = { ...heading, id: "head0002", audience: { segments: ["pro"] } } as LayoutNode;
  await mount(<AudienceEditor node={a} isRoot={false} onChange={() => undefined} />);
  const input = q("[data-emvb-audience-segments]") as HTMLInputElement;
  await act(async () => change(input, "no!pe"));
  await act(async () => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
  expect(document.querySelector("[data-emvb-audience-segment-error]")).not.toBeNull();
  await rerender(<AudienceEditor node={b} isRoot={false} onChange={() => undefined} />);
  expect(document.querySelector("[data-emvb-audience-segment-error]")).toBeNull();
  expect((q("[data-emvb-audience-segments]") as HTMLInputElement).value).toBe("pro");
});

test("Everyone except, with no rule yet, warns that every visitor is hidden (W-608)", async () => {
  const node = { ...heading, audience: { hide: true } } as LayoutNode;
  await mount(<AudienceEditor node={node} isRoot={false} onChange={() => undefined} />);
  expect(q("[data-emvb-audience-empty]").textContent).toContain("hidden from every visitor");
});

test("clearing one hour field keeps the other one (W-615)", async () => {
  let node = { ...heading, audience: { hours: { from: 9, to: 17 } } } as LayoutNode;
  const onChange = (next: LayoutNode) => {
    node = next;
  };
  await mount(<AudienceEditor node={node} isRoot={false} onChange={onChange} />);
  await act(async () => change(q("[data-emvb-audience-to]"), ""));
  expect(node.audience?.hours).toEqual({ from: 9, to: 24 });
  await rerender(<AudienceEditor node={node} isRoot={false} onChange={onChange} />);
  await act(async () => change(q("[data-emvb-audience-from]"), ""));
  expect(node.audience?.hours).toBeUndefined();
});

test("an arm whose partner is gone says every visitor sees it (W-627)", async () => {
  const arm = {
    id: "head0001",
    type: "heading",
    props: { text: "Hi", level: 2 },
    variant: { test: "hero", arm: "a" },
  } as LayoutNode;
  await mount(
    <VariantEditor
      node={arm}
      isRoot={false}
      lone
      onChange={() => undefined}
      onArrange={() => undefined}
    />,
  );
  expect(document.querySelector("[data-emvb-variant-lone]")?.textContent).toContain(
    "Variant B was removed",
  );
  await rerender(
    <VariantEditor
      node={arm}
      isRoot={false}
      onChange={() => undefined}
      onArrange={() => undefined}
    />,
  );
  expect(document.querySelector("[data-emvb-variant-lone]")).toBeNull();
});

test("W-865: the Visitors and Scales editors use Kumo fields and checkboxes, not raw inputs", async () => {
  const { TokenScales } = await import("../TokenScales.tsx");
  const { emptyDesign } = await import("../../../../core/index.ts");
  const node = {
    ...heading,
    audience: { devices: ["mobile"], hours: { from: 9, to: 17 } },
  } as LayoutNode;
  await mount(
    <>
      <AudienceEditor node={node} isRoot={false} onChange={() => undefined} />
      <TokenScales design={emptyDesign()} onSave={async () => undefined} />
    </>,
  );
  expect(
    document.querySelectorAll(".emvb-native-input, input[type=checkbox]:not([aria-hidden])").length,
  ).toBe(0);
  for (const sel of [
    "[data-emvb-audience-countries]",
    "[data-emvb-audience-from]",
    "[data-emvb-audience-zone]",
    "[data-emvb-tokens-base]",
  ]) {
    expect(q(sel).classList.contains("emvb-field") ? sel : `${sel} not a Kumo field`).toBe(sel);
  }
  const mobile = q('[data-emvb-audience-device="mobile"]');
  expect([mobile.getAttribute("role"), mobile.getAttribute("aria-checked")]).toEqual([
    "checkbox",
    "true",
  ]);
  expect(q("[data-emvb-tokens-fluid]").getAttribute("role")).toBe("checkbox");
});
