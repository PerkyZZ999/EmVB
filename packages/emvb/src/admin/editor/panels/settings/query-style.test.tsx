import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { LayoutNode } from "../../../../core/index.ts";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { ContainerQueryFields, DirectionField } from "./AdvancedFields.tsx";
import { EDITOR_CSS } from "../../editor-css.ts";
import { formatStyleValue, parseStyleValue } from "./query-style.ts";
import { pickOption } from "../../../../../test/dom/select.ts";

afterEach(cleanup);

const box = (query?: LayoutNode["query"]) =>
  ({ id: "box00001", type: "container", props: {}, children: [], query }) as LayoutNode;

function type(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

async function panel(query: LayoutNode["query"]) {
  const sent: LayoutNode[] = [];
  const host = await mount(
    <ContainerQueryFields node={box(query)} onChange={(n) => sent.push(n)} />,
  );
  return { host, sent };
}

describe("container-query styles are edited field by field (W-398)", () => {
  test("values read and parse per property", () => {
    expect(formatStyleValue({ value: 16, unit: "px" })).toBe("16px");
    expect(formatStyleValue({ var: "space-4" })).toBe("var(--space-4)");
    expect(parseStyleValue("paddingTop", "24px")).toEqual({ value: { value: 24, unit: "px" } });
    expect(parseStyleValue("width", "auto")).toEqual({ value: "auto" });
    expect(parseStyleValue("gridColumnSpan", "3")).toEqual({ value: 3 });
    expect(parseStyleValue("flexDirection", "row")).toEqual({ value: "row" });
    expect("error" in parseStyleValue("flexDirection", "sideways")).toBe(true);
    expect("error" in parseStyleValue("notAKey", "1px")).toBe(true);
  });

  test("a row edits one property and keeps the others", async () => {
    const { host, sent } = await panel({
      min: 480,
      style: { flexDirection: "row", paddingTop: { value: 8, unit: "px" } },
    });
    const input = host.querySelector<HTMLInputElement>('[data-emvb-query-key="paddingTop"] input');
    expect(input?.value).toBe("8px");
    await act(async () => {
      type(input as HTMLInputElement, "24px");
      input?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(sent.at(-1)?.query).toEqual({
      min: 480,
      style: { flexDirection: "row", paddingTop: { value: 24, unit: "px" } },
    });
  });

  test("a bad value stays with a reason; Remove deletes one property", async () => {
    const { host, sent } = await panel({ min: 480, style: { flexDirection: "row" } });
    const input = host.querySelector<HTMLInputElement>(
      '[data-emvb-query-key="flexDirection"] input',
    );
    await act(async () => {
      type(input as HTMLInputElement, "sideways");
      input?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(sent).toEqual([]);
    expect(host.querySelector("[data-emvb-query-error]")?.textContent).toContain("sideways");
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="Remove flexDirection"]')?.click();
    });
    expect(sent.at(-1)?.query).toEqual({ min: 480, style: {} });
  });

  test("Add style stores a new property", async () => {
    const { host, sent } = await panel({ min: 600, style: {} });
    const add = host.querySelector("[data-emvb-query-add]") as HTMLElement;
    await pickOption(add, "gap");
    await act(async () => {
      type(add.querySelector("input[placeholder]") as HTMLInputElement, "2rem");
    });
    await act(async () => {
      [...add.querySelectorAll("button")].find((b) => b.textContent === "Add style")?.click();
    });
    expect(sent.at(-1)?.query).toEqual({ min: 600, style: { gap: { value: 2, unit: "rem" } } });
  });

  test("a text element gets the query styles but not the container switch", async () => {
    const text = {
      id: "text0001",
      type: "text",
      props: { text: "q" },
      query: { min: 600, style: { color: "#ff0000" } },
    } as LayoutNode;
    const host = await mount(<ContainerQueryFields node={text} onChange={() => {}} />);
    expect(host.querySelector('[data-emvb-query-key="color"] input')).not.toBeNull();
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
  });
});

describe("the container width is a draft (W-401)", () => {
  test("clearing it to retype keeps the styles until blur", async () => {
    const { host, sent } = await panel({ min: 480, style: { flexDirection: "row" } });
    const input = host.querySelector<HTMLInputElement>("[data-emvb-query-min]") as HTMLInputElement;
    await act(async () => {
      type(input, "");
    });
    await act(async () => {
      type(input, "720");
    });
    expect(sent).toEqual([]);
    await act(async () => {
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(sent.at(-1)?.query).toEqual({ min: 720, style: { flexDirection: "row" } });
  });

  test("an out-of-range width stays with a hint", async () => {
    const { host, sent } = await panel({ min: 480, style: {} });
    const input = host.querySelector<HTMLInputElement>("[data-emvb-query-min]") as HTMLInputElement;
    await act(async () => {
      type(input, "5000");
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(sent).toEqual([]);
    expect(host.textContent).toContain("1 to 3840");
  });
});

describe("copying the style asks before replacing query styles (W-402)", () => {
  const click = async (host: HTMLElement, text: string) =>
    act(async () => {
      [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)?.click();
    });

  test("edited query styles need a confirm; Keep them leaves them", async () => {
    const { host, sent } = await panel({ min: 480, style: { flexDirection: "row" } });
    await click(host, "Use current style at that width");
    expect(sent).toEqual([]);
    expect(host.querySelector("[data-emvb-query-confirm]")).not.toBeNull();
    await click(host, "Keep them");
    expect(sent).toEqual([]);
    expect(host.querySelector("[data-emvb-query-confirm]")).toBeNull();
    await click(host, "Use current style at that width");
    await click(host, "Replace styles");
    expect(sent.at(-1)?.query).toEqual({ min: 480, style: {} });
  });

  test("empty query styles are copied straight away", async () => {
    const { host, sent } = await panel({ min: 480, style: {} });
    await click(host, "Use current style at that width");
    expect(sent.length).toBe(1);
  });
});

describe("query style values are read like the Style tab (W-404)", () => {
  test("a bare number on a length means px, and keywords ignore case", () => {
    expect(parseStyleValue("paddingTop", "16")).toEqual({ value: { value: 16, unit: "px" } });
    expect(parseStyleValue("paddingTop", "0")).toEqual({ value: { value: 0, unit: "px" } });
    expect(parseStyleValue("zIndex", "10")).toEqual({ value: 10 });
    expect(parseStyleValue("width", "AUTO")).toEqual({ value: "auto" });
  });
});

test("an inherited object name is not a style property (W-542)", () => {
  for (const key of ["constructor", "toString", "__proto__"]) {
    expect(parseStyleValue(key, "1")).toEqual({ error: `${key} isn't a style property.` });
  }
});

describe("container-query values read numbers like the Style tab (W-695)", () => {
  test("a leading dot, a plus sign, a space before the unit and a trailing dot", () => {
    expect(parseStyleValue("paddingTop", ".5rem")).toEqual({ value: { value: 0.5, unit: "rem" } });
    expect(parseStyleValue("paddingTop", "+2px")).toEqual({ value: { value: 2, unit: "px" } });
    expect(parseStyleValue("paddingTop", "1.5 rem")).toEqual({
      value: { value: 1.5, unit: "rem" },
    });
    expect(parseStyleValue("paddingTop", ".5")).toEqual({ value: { value: 0.5, unit: "px" } });
  });

  test("a comma decimal says to use a dot", () => {
    expect(parseStyleValue("paddingTop", "1,5rem")).toEqual({
      error: "Use a dot for decimals, such as 1.5.",
    });
  });
});

describe("container-query variables keep their kind (W-696)", () => {
  test("a padding variable is a spacing variable, a font size a font size one", () => {
    expect(parseStyleValue("paddingTop", "var(--space-4)")).toEqual({
      value: { var: "space-4", from: "spacing" },
    });
    expect(parseStyleValue("fontSize", "var(--lg)")).toEqual({
      value: { var: "lg", from: "fontSize" },
    });
    expect(parseStyleValue("fontFamily", "var(--body)")).toEqual({
      value: { var: "body", from: "font" },
    });
    expect(parseStyleValue("color", "var(--brand)")).toEqual({ value: { var: "brand" } });
  });

  test("a stored length variable reads as var(--name), not JSON", () => {
    expect(formatStyleValue({ var: "space-4", from: "spacing" })).toBe("var(--space-4)");
  });
});

test("UX-079: container-query rows use the Style tab's names, not raw keys", async () => {
  const { host } = await panel({
    min: 480,
    style: { flexDirection: "row", paddingTop: { value: 8, unit: "px" } },
  });
  const labels = [...host.querySelectorAll("[data-emvb-query-key] > label")].map(
    (l) => l.textContent,
  );
  expect(labels).toEqual(["Direction", "Padding top"]);
});

test("UX-080: Text direction shows Site default, and the Query container box has room", async () => {
  const host = await mount(<DirectionField node={box()} onChange={() => undefined} />);
  expect(host.querySelector('[role="combobox"]')?.textContent?.trim() ?? "none").toBe(
    "Site default",
  );
  expect(EDITOR_CSS).toMatch(/\.emvb-check \{[^}]*gap: 8px;/);
});
