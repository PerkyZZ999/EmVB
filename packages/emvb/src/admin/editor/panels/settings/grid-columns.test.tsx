import { afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { emptyDesign, type LayoutNode } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { ElementPanel } from "../ElementPanel.tsx";

const stubFetcher: Fetcher = async () => new Response("{}", { status: 200 });

let nodes: LayoutNode[] = [];
afterEach(async () => {
  await cleanup();
  nodes = [];
});

const grid = (props: Record<string, number> = {}): LayoutNode =>
  ({ id: "grid0001", type: "grid", props: { columns: 3, ...props }, children: [] }) as LayoutNode;

function Harness({
  start,
  device,
}: {
  start: LayoutNode;
  device: "desktop" | "tablet" | "mobile";
}) {
  const [node, set] = React.useState(start);
  return (
    <ElementPanel
      node={node}
      layout={{
        schemaVersion: 13,
        root: { id: "root0001", type: "container", props: {}, children: [node] },
      }}
      design={emptyDesign()}
      rejection={null}
      fetcher={stubFetcher}
      device={device}
      onChange={(next) => {
        nodes.push(next);
        set(next);
      }}
      onDesignChange={async () => undefined}
      onSelect={() => undefined}
    />
  );
}

const trigger = (label: string) =>
  document.querySelector<HTMLElement>(`[role="combobox"][aria-label="${label}"]`);

async function choose(label: string, option: string) {
  const box = trigger(label);
  await act(async () => {
    box?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    box?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    box?.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
  await act(async () => {
    options.find((o) => o.textContent === option)?.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  return options.map((o) => o.textContent);
}

describe("grid columns per device (W-139)", () => {
  test("on Tablet, Columns edits the tablet count, and Same as desktop clears it", async () => {
    await mount(<Harness start={grid()} device="tablet" />);
    expect(trigger("Columns")).toBeNull();
    expect(trigger("Columns on tablet")?.textContent).toContain("Same as desktop (3)");
    const listed = await choose("Columns on tablet", "2");
    expect(listed[0]).toBe("Same as desktop (3)");
    expect(nodes.at(-1)?.props).toEqual({ columns: 3, columnsTablet: 2 });
    await choose("Columns on tablet", "Same as desktop (3)");
    expect(nodes.at(-1)?.props).toEqual({ columns: 3 });
  });

  test("on Mobile, unset follows the tablet count", async () => {
    await mount(<Harness start={grid({ columnsTablet: 2 })} device="mobile" />);
    expect(trigger("Columns on mobile")?.textContent).toContain("Same as tablet (2)");
    await choose("Columns on mobile", "1");
    expect(nodes.at(-1)?.props).toEqual({ columns: 3, columnsTablet: 2, columnsMobile: 1 });
  });

  test("on Desktop, Columns edits the desktop count and lists the device counts", async () => {
    await mount(<Harness start={grid({ columnsTablet: 2, columnsMobile: 1 })} device="desktop" />);
    expect(document.querySelector('[data-emvb-device-values="columns"]')?.textContent).toBe(
      "Tablet 2 · Mobile 1. Switch the canvas to Tablet or Mobile to change them.",
    );
    await choose("Columns", "4");
    expect(nodes.at(-1)?.props).toEqual({ columns: 4, columnsTablet: 2, columnsMobile: 1 });
  });
});
