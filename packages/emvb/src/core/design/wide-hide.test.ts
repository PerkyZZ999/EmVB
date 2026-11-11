import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { LayoutNode } from "../schema/layout.ts";
import { hasLocalStyles, localStylesToClass } from "./classes.ts";
import { hiddenOnDevice, hiddenOnEveryDevice, toggleHiddenOn } from "./devices.ts";

describe("Wide screen hide (W-959)", () => {
  test("Wide screen follows Desktop unless wide.hidden says otherwise", () => {
    expect(hiddenOnDevice({ hiddenOn: ["desktop"] }, "wide")).toBe(true);
    expect(hiddenOnDevice({}, "wide")).toBe(false);
    expect(
      hiddenOnDevice({ hiddenOn: ["desktop"], style: { wide: { hidden: false } } }, "wide"),
    ).toBe(false);
    expect(hiddenOnDevice({ style: { wide: { hidden: true } } }, "wide")).toBe(true);
  });

  test("toggling Wide screen stores wide.hidden only when it differs from Desktop", () => {
    expect(toggleHiddenOn({}, "wide")).toEqual({
      hiddenOn: undefined,
      style: { wide: { hidden: true } },
    });
    expect(toggleHiddenOn({ style: { wide: { hidden: true } } }, "wide")).toEqual({
      hiddenOn: undefined,
      style: undefined,
    });
    expect(toggleHiddenOn({ hiddenOn: ["desktop"] }, "wide")).toEqual({
      hiddenOn: ["desktop"],
      style: { wide: { hidden: false } },
    });
  });

  test("toggling Desktop leaves Wide screen following it, or its own choice untouched", () => {
    expect(toggleHiddenOn({ style: { color: "#111111" } }, "desktop")).toEqual({
      hiddenOn: ["desktop"],
      style: { color: "#111111" },
    });
    expect(toggleHiddenOn({ style: { wide: { hidden: false } } }, "desktop")).toEqual({
      hiddenOn: ["desktop"],
      style: { wide: { hidden: false } },
    });
  });

  test("hidden on all four devices still shows on wide screens when Wide screen shows it", () => {
    const all = ["desktop", "laptop", "tablet", "mobile"] as const;
    expect(hiddenOnEveryDevice({ hiddenOn: [...all] })).toBe(true);
    expect(hiddenOnEveryDevice({ hiddenOn: [...all], style: { wide: { hidden: false } } })).toBe(
      false,
    );
    expect(hiddenOnEveryDevice({ hiddenOn: [...all], wideHidden: false })).toBe(false);
  });
});

describe("Save as class keeps the Wide screen hide on the element (W-983)", () => {
  test("wide values move to the class; wide.hidden stays with hiddenOn", () => {
    const node = {
      id: "head0001",
      type: "heading",
      props: { text: "Hi", level: 2 },
      hiddenOn: ["desktop"],
      style: { color: "#111111", wide: { color: "#222222", hidden: false } },
    } as LayoutNode;
    const moved = localStylesToClass(emptyDesign(), node, "Hero");
    expect(moved?.design.classes?.[0]?.style).toEqual({
      color: "#111111",
      wide: { color: "#222222" },
    });
    expect(moved?.node.hiddenOn).toEqual(["desktop"]);
    expect(moved?.node.style).toEqual({ wide: { hidden: false } });
  });

  test("an element whose only own style is the Wide screen hide has nothing to save", () => {
    const node = {
      id: "head0001",
      type: "heading",
      props: { text: "Hi", level: 2 },
      style: { wide: { hidden: true } },
    } as LayoutNode;
    expect(hasLocalStyles(node)).toBe(false);
  });
});
