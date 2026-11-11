import { describe, expect, test } from "bun:test";
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
