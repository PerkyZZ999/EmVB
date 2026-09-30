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
  schemaVersion: 2,
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

  test("section open state is remembered per element type for the session", async () => {
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
    await act(async () => spacing.click());
    expect(sessionStorage.getItem("emvb-style-sections:container")).toContain("spacing");
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
          schemaVersion: 2,
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
    expect(document.querySelector('[data-emvb-tab="content"]')).toBeNull();
  });
});
