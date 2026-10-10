import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { auditPage, emptyDesign, type Layout } from "../../core/index.ts";
import { cleanup, mount } from "../../../test/dom/mount.ts";
import { A11yDialog, A11yScoreButton } from "./A11yCopilot.tsx";

afterEach(cleanup);

const layout = {
  schemaVersion: 14,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "head0001", type: "heading", props: { text: "A", level: 1 } },
      { id: "head0002", type: "heading", props: { text: "B", level: 1 }, label: "Second title" },
      { id: "head0003", type: "heading", props: { text: "C", level: 5 } },
    ],
  },
} as Layout;

describe("accessibility co-pilot UI (W-317)", () => {
  test("the top bar shows the live score and its band", async () => {
    const report = auditPage(layout, emptyDesign());
    await mount(<A11yScoreButton report={report} onOpen={() => undefined} />);
    const button = document.querySelector("[data-emvb-a11y-open]");
    expect(button?.textContent).toBe(`A11y ${report.score}`);
    expect(button?.getAttribute("data-band")).toBe("good");
    expect(button?.getAttribute("aria-label")).toBe(
      `Accessibility score ${report.score} of 100, 2 issues`,
    );
  });

  test("one fix, or every fix at once, is applied as an edit", async () => {
    const applied: [Layout, string][] = [];
    const report = auditPage(layout, emptyDesign());
    await mount(
      <A11yDialog
        open
        onOpenChange={() => undefined}
        report={report}
        layout={layout}
        onSelect={() => undefined}
        onApply={(next, note) => applied.push([next, note])}
      />,
    );
    expect(
      document.querySelector('[data-emvb-a11y-issue="multiple-h1:head0002"]')?.textContent,
    ).toContain("Second title");
    await act(async () =>
      (
        document.querySelector('[data-emvb-a11y-fix="multiple-h1:head0002"]') as HTMLButtonElement
      ).click(),
    );
    expect(applied[0]?.[1]).toBe("Fixed: Make it H2");
    await act(async () =>
      (document.querySelector("[data-emvb-a11y-fix-all]") as HTMLButtonElement).click(),
    );
    expect(applied[1]?.[1]).toBe("Fixed 2 accessibility issues");
    expect(auditPage(applied[1]?.[0] as Layout, emptyDesign()).issues).toEqual([]);
  });
});
