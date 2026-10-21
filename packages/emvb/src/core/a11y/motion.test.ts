import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { auditPage } from "./audit.ts";

const page = (...children: LayoutNode[]): Layout => ({
  schemaVersion: 17,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "head0001", type: "heading", props: { text: "T", level: 1 } }, ...children],
  },
});
const icon = (id: string, extra: Partial<LayoutNode>): LayoutNode =>
  ({ id, type: "icon", props: { iconId: "star", title: "Star" }, ...extra }) as LayoutNode;
const motion = (layout: Layout) =>
  auditPage(layout, emptyDesign())
    .issues.filter((i) => i.rule === "motion")
    .map((i) => i.nodeId);

describe("W-791 an icon that animates past 5 seconds is flagged", () => {
  test("W-848 a spin or pulse that stops within 5 s isn't flagged; a longer single run is", () => {
    const layout = page(
      icon("icon0001", { style: { iconAnimation: { type: "spin", duration: 6000 } } }),
      icon("icon0002", {
        devices: { mobile: { iconAnimation: { type: "pulse", duration: 3000 } } },
      }),
      icon("icon0003", { style: { iconAnimation: { type: "none" } } }),
      icon("icon0004", {}),
      icon("icon0005", { style: { iconAnimation: { type: "spin", duration: 1000 } } }),
      icon("icon0006", { style: { iconAnimation: { type: "pulse", duration: 2500 } } }),
    );
    expect(motion(layout)).toEqual(["icon0001", "icon0002"]);
    const issue = auditPage(layout, emptyDesign()).issues.find((i) => i.rule === "motion");
    expect(issue?.severity).toBe("warning");
    expect(issue?.message).toContain("can't pause it");
  });
});

test("W-853 an icon set to Loop forever is flagged, however short its run", () => {
  const layout = page(
    icon("icon0007", { style: { iconAnimation: { type: "spin", duration: 1000, loop: true } } }),
    icon("icon0008", { style: { iconAnimation: { type: "spin", duration: 1000 } } }),
  );
  expect(motion(layout)).toEqual(["icon0007"]);
});

test("W-882 a Loop forever from a class is flagged; the element's own None wins", () => {
  const design = {
    ...emptyDesign(),
    classes: [
      {
        id: "spinner",
        name: "Spinner",
        style: { iconAnimation: { type: "spin", duration: 800, loop: true } },
      },
      {
        id: "phonespin",
        name: "Phone spin",
        style: {},
        devices: { mobile: { iconAnimation: { type: "pulse", duration: 900, loop: true } } },
      },
    ],
  } as unknown as ReturnType<typeof emptyDesign>;
  const layout = page(
    icon("icon0009", { classes: ["spinner"] }),
    icon("icon0010", { classes: ["spinner"], style: { iconAnimation: { type: "none" } } }),
    icon("icon0011", { classes: ["phonespin"] }),
    icon("icon0012", {
      classes: ["phonespin"],
      devices: { mobile: { iconAnimation: { type: "none" } } },
    }),
  );
  const flagged = auditPage(layout, design)
    .issues.filter((i) => i.rule === "motion")
    .map((i) => i.nodeId);
  expect(flagged).toEqual(["icon0009", "icon0011"]);
});
