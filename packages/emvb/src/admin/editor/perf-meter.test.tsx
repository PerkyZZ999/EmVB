import { afterEach, describe, expect, test } from "bun:test";
import { emptyDesign, type Layout } from "../../core/index.ts";
import { cleanup, mount } from "../../../test/dom/mount.ts";
import { AddPanel } from "./panels/AddPanel.tsx";
import { PerfMeterDialog } from "./PerfMeter.tsx";

afterEach(cleanup);

const layout: Layout = {
  schemaVersion: 17,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "head0001", type: "heading", props: { text: "One", level: 1 }, label: "Hero" },
      { id: "form0001", type: "form", props: { formId: "contact" }, children: [] },
    ],
  },
};

describe("page weight dialog (W-310, W-311)", () => {
  test("shows a bar per kind, the scripts the page loads and its heaviest sections", async () => {
    const picked: string[] = [];
    await mount(
      <PerfMeterDialog
        open
        onOpenChange={() => undefined}
        layout={layout}
        design={emptyDesign()}
        onSelect={(id) => picked.push(id)}
      />,
    );
    const kinds = [...document.querySelectorAll("[data-emvb-perf-kind]")].map((el) =>
      el.getAttribute("data-emvb-perf-kind"),
    );
    expect(kinds).toEqual(["html", "css", "js", "images"]);
    expect(document.querySelector("[data-emvb-perf-js]")?.textContent).toContain(
      "Form submission script",
    );
    const hero = document.querySelector('[data-emvb-perf-section="head0001"]') as HTMLButtonElement;
    expect(hero.textContent).toBe("Hero");
    hero.click();
    expect(picked).toEqual(["head0001"]);
  });

  test("a page with no scripts says it is zero JavaScript", async () => {
    const plain = {
      ...layout,
      root: { ...layout.root, children: layout.root.children.slice(0, 1) },
    };
    await mount(
      <PerfMeterDialog
        open
        onOpenChange={() => undefined}
        layout={plain as Layout}
        design={emptyDesign()}
        onSelect={() => undefined}
      />,
    );
    expect(document.querySelector("[data-emvb-perf-js]")?.textContent).toContain("Zero JavaScript");
  });

  test("Add panel tiles for script elements carry a JS badge; plain ones don't", async () => {
    await mount(<AddPanel onAdd={() => undefined} />);
    const badge = (type: string) =>
      document.querySelector(`[data-emvb-add-tile="${type}"] .emvb-js-badge`) !== null;
    expect([badge("tabs"), badge("heading"), badge("image")]).toEqual([true, false, false]);
  });
});

test("UX-083: sizes and budgets drop needless decimals and use MB past 1000 KB", async () => {
  const { kb } = await import("./PerfMeter.tsx");
  expect([161, 1100, 1400, 100_000, 1_500_000, 2_000_000].map(kb)).toEqual([
    "161 B",
    "1.1 KB",
    "1.4 KB",
    "100 KB",
    "1.5 MB",
    "2 MB",
  ]);
});

test("W-771: sizes that round up never show a trailing .0 or 1000 KB", async () => {
  const { kb } = await import("./PerfMeter.tsx");
  expect([1999, 99_960, 999_600, 1_999_999, 1050].map(kb)).toEqual([
    "2 KB",
    "100 KB",
    "1 MB",
    "2 MB",
    "1.1 KB",
  ]);
});
