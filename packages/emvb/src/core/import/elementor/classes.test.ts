import { describe, expect, test } from "bun:test";
import { combineLayers, inlineOver, type Layers } from "./classes.ts";

const L = (over: Partial<Layers>): Layers => ({
  desktop: {},
  tablet: {},
  mobile: {},
  hover: {},
  focus: {},
  active: {},
  ...over,
});
const px = (value: number) => ({ value, unit: "px" });

describe("Elementor classes over inline styles (W-958)", () => {
  test("what the class gives is not repeated inline; what differs stays", () => {
    const want = L({ desktop: { color: "#111111", fontSize: px(20) } });
    const cls = L({ desktop: { color: "#111111", fontSize: px(16) } });
    expect(inlineOver(want, cls)).toEqual(L({ desktop: { fontSize: px(20) } }));
  });

  test("a class's tablet value beats the element's desktop one, so the element repeats it", () => {
    // The element shows 20px everywhere; the class drops to 14px on tablets.
    const want = L({ desktop: { fontSize: px(20) } });
    const cls = L({ desktop: { fontSize: px(16) }, tablet: { fontSize: px(14) } });
    expect(inlineOver(want, cls)).toEqual(
      L({ desktop: { fontSize: px(20) }, tablet: { fontSize: px(20) } }),
    );
  });

  test("device values the class already gives are left to it", () => {
    const want = L({ desktop: { gap: px(24) }, mobile: { gap: px(12) } });
    const cls = L({ desktop: { gap: px(24) }, mobile: { gap: px(12) } });
    expect(inlineOver(want, cls)).toEqual(L({}));
  });

  test("a class that sets something the element doesn't have can't be used", () => {
    const want = L({ desktop: { color: "#111111" } });
    expect(inlineOver(want, L({ desktop: { color: "#111111", opacity: 0.5 } }))).toBeUndefined();
    expect(inlineOver(want, L({ mobile: { opacity: 0.5 } }))).toBeUndefined();
  });

  test("states: the element's own state wins; a class state is undone with the shown value", () => {
    const want = L({ desktop: { color: "#111111" }, hover: { opacity: 0.8 } });
    const cls = L({ desktop: { color: "#111111" }, hover: { color: "#ff0000", opacity: 0.8 } });
    expect(inlineOver(want, cls)).toEqual(L({ hover: { color: "#111111" } }));
  });

  test("a class state can't be undone when the element's value differs per device", () => {
    const want = L({ desktop: { color: "#111111" }, mobile: { color: "#222222" } });
    const cls = L({ hover: { color: "#ff0000" } });
    expect(inlineOver(want, cls)).toBeUndefined();
  });

  test("values compare by content, whatever their key order", () => {
    const want = L({ desktop: { boxShadow: { x: 0, y: 2, blur: 4 } } });
    const cls = L({ desktop: { boxShadow: { blur: 4, y: 2, x: 0 } } });
    expect(inlineOver(want, cls)).toEqual(L({}));
  });

  test("several classes combine unless two set the same key differently", () => {
    const a = L({ desktop: { color: "#111111" } });
    const b = L({ desktop: { fontSize: px(16) }, hover: { color: "#222222" } });
    expect(combineLayers([a, b])).toEqual(
      L({ desktop: { color: "#111111", fontSize: px(16) }, hover: { color: "#222222" } }),
    );
    expect(combineLayers([a, L({ desktop: { color: "#333333" } })])).toBeUndefined();
    expect(combineLayers([a, L({ desktop: { color: "#111111" } })])).toEqual(a);
  });
});
