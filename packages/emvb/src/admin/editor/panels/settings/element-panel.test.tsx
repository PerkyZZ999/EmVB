import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { emptyDesign, type Layout, type LayoutNode } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { ElementPanel } from "../ElementPanel.tsx";
import { cleanup, mount, unmount } from "../../../../../test/dom/mount.ts";

const stubFetcher: Fetcher = async () => new Response("{}", { status: 200 });

afterEach(async () => {
  await cleanup();
  sessionStorage.clear();
});

const layout: Layout = {
  schemaVersion: 10,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "head0001", type: "heading", props: { text: "Hi", level: 2 } }],
  },
};

const heading = (): LayoutNode => {
  const child = layout.root.children[0];
  if (!child) throw new Error("fixture missing heading");
  return child;
};

describe("ElementPanel (W-021)", () => {
  test("heading opens on Content; container opens on Style › Layout", async () => {
    let current = heading();
    await mount(
      <ElementPanel
        node={current}
        layout={layout}
        design={emptyDesign()}
        rejection={null}
        fetcher={stubFetcher}
        onChange={(n) => {
          current = n;
        }}
        onDesignChange={async () => undefined}
        onSelect={() => undefined}
      />,
    );
    expect(document.querySelector('[data-emvb-tab="content"]')).toBeTruthy();
    expect(document.querySelector('[data-emvb-field="text"]')).toBeTruthy();

    await unmount();
    await mount(
      <ElementPanel
        node={layout.root}
        layout={layout}
        design={emptyDesign()}
        rejection={null}
        fetcher={stubFetcher}
        onChange={() => undefined}
        onDesignChange={async () => undefined}
        onSelect={() => undefined}
      />,
    );
    expect(document.querySelector('[data-emvb-tab="style"]')).toBeTruthy();
    expect(document.querySelector('[data-emvb-section="layout"]')).toBeTruthy();
  });

  test("breadcrumb lists Page › Container › Heading", async () => {
    await mount(
      <ElementPanel
        node={heading()}
        layout={layout}
        design={emptyDesign()}
        rejection={null}
        fetcher={stubFetcher}
        onChange={() => undefined}
        onDesignChange={async () => undefined}
        onSelect={() => undefined}
      />,
    );
    const nav = document.querySelector(".emvb-breadcrumb")?.textContent ?? "";
    expect(nav).toContain("Page");
    expect(nav).toContain("Container");
    expect(nav).toContain("Heading");
  });

  test("invalid gap keeps the previous value and shows the message", async () => {
    const { parseLengthDraft } = await import("./length-units.ts");
    const bad = parseLengthDraft("-4", "gap", "px");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toContain("Gap can't be negative");
    const good = parseLengthDraft("16", "gap", "px");
    expect(good).toEqual({ ok: true, value: { value: 16, unit: "px" } });
  });

  test("reset clears a set style property", async () => {
    let current: LayoutNode = {
      ...layout.root,
      style: { flexDirection: "row", gap: { value: 8, unit: "px" } },
    };
    await mount(
      <ElementPanel
        node={current}
        layout={layout}
        design={emptyDesign()}
        rejection={null}
        fetcher={stubFetcher}
        onChange={(n) => {
          current = n;
        }}
        onDesignChange={async () => undefined}
        onSelect={() => undefined}
      />,
    );
    const reset = document.querySelector(
      '[data-emvb-style="gap"] [aria-label="Reset Gap to default"]',
    ) as HTMLButtonElement | null;
    expect(reset).toBeTruthy();
    await act(async () => reset?.click());
    expect(current.style?.gap).toBeUndefined();
    expect(current.style?.flexDirection).toBe("row");
  });

  test("section open state is remembered per element type across visits (W-137)", async () => {
    await mount(
      <ElementPanel
        node={layout.root}
        layout={layout}
        design={emptyDesign()}
        rejection={null}
        fetcher={stubFetcher}
        onChange={() => undefined}
        onDesignChange={async () => undefined}
        onSelect={() => undefined}
      />,
    );
    const spacing = document.querySelector('[data-emvb-section="spacing"]') as HTMLElement;
    expect(spacing.getAttribute("aria-expanded")).toBe("true");
    await act(async () => spacing.click());
    expect(spacing.getAttribute("aria-expanded")).toBe("false");
    const saved = JSON.parse(localStorage.getItem("emvb-style-sections:container") ?? "[]");
    expect(saved).not.toContain("spacing");
    expect(saved).toContain("background");
  });

  test("Typography, Spacing, Background and Border open the first time, the rest stay closed (W-137)", async () => {
    await mount(
      <ElementPanel
        node={heading()}
        layout={layout}
        design={emptyDesign()}
        rejection={null}
        fetcher={stubFetcher}
        onChange={() => undefined}
        onDesignChange={async () => undefined}
        onSelect={() => undefined}
      />,
    );
    const style = [...document.querySelectorAll('[role="tab"]')].find(
      (t) => t.textContent === "Style",
    ) as HTMLElement;
    await act(async () => style.click());
    const states = Object.fromEntries(
      [...document.querySelectorAll("[data-emvb-section]")].map((el) => [
        el.getAttribute("data-emvb-section"),
        el.getAttribute("aria-expanded"),
      ]),
    );
    expect(states).toMatchObject({
      typography: "true",
      spacing: "true",
      background: "true",
      border: "true",
    });
    for (const [id, open] of Object.entries(states))
      if (!["typography", "spacing", "background", "border"].includes(id ?? ""))
        expect(`${id}: ${open}`).toBe(`${id}: false`);
  });

  test("a closed section stays closed on the next element of that type and after a reload (W-137)", async () => {
    const panel = (node: LayoutNode) => (
      <ElementPanel
        node={node}
        layout={layout}
        design={emptyDesign()}
        rejection={null}
        fetcher={stubFetcher}
        onChange={() => undefined}
        onDesignChange={async () => undefined}
        onSelect={() => undefined}
      />
    );
    const showStyle = async () => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find(
        (t) => t.textContent === "Style",
      ) as HTMLElement;
      await act(async () => tab.click());
    };
    const expanded = (id: string) =>
      document.querySelector(`[data-emvb-section="${id}"]`)?.getAttribute("aria-expanded");
    await mount(panel(heading()));
    await showStyle();
    const border = document.querySelector('[data-emvb-section="border"]') as HTMLElement;
    await act(async () => border.click());
    expect(expanded("border")).toBe("false");
    await unmount();
    document.body.innerHTML = "";
    await mount(panel({ ...heading(), id: "head0002" }));
    await showStyle();
    expect(expanded("border")).toBe("false");
    expect(expanded("typography")).toBe("true");
  });

  test("unknown element panel explains it can be moved or deleted but not edited", async () => {
    const unknown = {
      id: "car00001",
      type: "carousel",
      props: { slides: 3 },
    } as LayoutNode;
    await mount(
      <ElementPanel
        node={unknown}
        layout={{
          schemaVersion: 10,
          root: { id: "root0001", type: "container", props: {}, children: [unknown] },
        }}
        design={emptyDesign()}
        rejection={null}
        fetcher={stubFetcher}
        onChange={() => undefined}
        onDesignChange={async () => undefined}
        onSelect={() => undefined}
      />,
    );
    expect(document.querySelector('[data-emvb-element="carousel"]')?.textContent).toContain(
      "can be moved or deleted, but not edited",
    );
    expect(document.querySelector('[data-emvb-tab="content"]')?.outerHTML ?? null).toBeNull();
  });
});
