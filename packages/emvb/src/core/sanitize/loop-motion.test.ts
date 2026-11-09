import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import { validateLayout } from "../validate.ts";
import { renderPage } from "../render/index.ts";
import { stateDeclarations, styleDeclarations } from "./css.ts";
import { loopDeclarations } from "./motion.ts";

const float = { effects: [{ type: "move-y", from: 0, to: -8 }], duration: 1600 };
const value = (decls: { property: string; value: string }[] | undefined, property: string) =>
  decls?.find((d) => d.property === property)?.value;

describe("loop motion CSS (W-938)", () => {
  test("a loop plays its effects back and forth for about 5 seconds, on a time timeline", () => {
    const d = loopDeclarations(float);
    expect(value(d, "animation")).toBe("emvb-lt 1600ms ease-in-out 3 alternate");
    expect(value(d, "animation-timeline")).toBe("auto");
    expect(value(d, "--emvb-lt0")).toBe("0px 0px");
    expect(value(d, "--emvb-lt1")).toBe("0px -8px");
  });

  test("Loop forever, one direction, an easing, several effects", () => {
    const d = loopDeclarations({
      effects: [
        { type: "rotate", from: 0, to: 360 },
        { type: "fade", from: 100, to: 50 },
      ],
      duration: 2000,
      easing: "linear",
      alternate: false,
      loop: true,
    });
    expect(value(d, "animation")).toBe(
      "emvb-lo 2000ms linear infinite normal, emvb-lr 2000ms linear infinite normal",
    );
    expect(value(d, "animation-timeline")).toBe("auto, auto");
  });

  test("a run longer than 5 seconds still plays once; none stops an inherited loop", () => {
    expect(value(loopDeclarations({ ...float, duration: 8000 }), "animation")).toContain(" 1 ");
    expect(loopDeclarations({ type: "none" })).toEqual([{ property: "animation", value: "none" }]);
  });

  test("bounded: durations, effect limits, duplicates, unknown keys and odd easings are refused", () => {
    for (const bad of [
      { ...float, duration: 199 },
      { ...float, duration: 20_001 },
      { ...float, duration: 1.5 },
      { ...float, effects: [{ type: "scale", from: 0, to: 900 }] },
      { ...float, effects: [float.effects[0], float.effects[0]] },
      { ...float, effects: [] },
      { ...float, easing: "linear;}body{display:none" },
      { ...float, easing: "cubic-bezier(0,0,1,1)" },
      { ...float, loop: false },
      { ...float, iterations: 99 },
      { ...float, effects: [{ type: "url", from: 0, to: 1 }] },
    ]) {
      expect(loopDeclarations(bad)).toBeUndefined();
      expect(styleDeclarations({ loopMotion: bad }).rejected).toEqual(["loopMotion"]);
    }
  });

  test("joins an entrance and scroll motion in one animation list, with timelines per animation", () => {
    const { declarations } = styleDeclarations({
      entrance: { type: "fade", duration: 300 },
      scrollMotion: { range: "enter", effects: [{ type: "fade", from: 0, to: 100 }] },
      loopMotion: float,
    });
    expect(value(declarations, "animation")).toBe(
      "emvb-fade 300ms ease-out both, emvb-mo linear both, emvb-lt 1600ms ease-in-out 3 alternate",
    );
    expect(value(declarations, "animation-timeline")).toBe("auto, view(), auto");
    expect(value(declarations, "animation-range")).toBe("normal, entry 0% entry 100%, normal");
  });

  test("a hover state can't loop: the key is dropped and reported", () => {
    const { states, rejected } = stateDeclarations({ hover: { loopMotion: float } });
    expect((states.hover ?? []).some((d) => d.property === "animation")).toBe(false);
    expect(rejected).toEqual(["hover.loopMotion"]);
  });

  test("the page sends the loop keyframes, only for visitors who don't ask for reduced motion", () => {
    const layout = (motion?: object) => {
      const checked = validateLayout({
        schemaVersion: 18,
        root: {
          id: "root0001",
          type: "container",
          props: {},
          children: [
            {
              id: "head0001",
              type: "heading",
              props: { text: "Hi", level: 1 },
              ...(motion ? { style: { motion } } : {}),
            },
          ],
        },
      });
      if (!checked.ok) throw new Error(JSON.stringify(checked.issues));
      return checked.layout;
    };
    const { css } = renderPage(layout({ loop: float }), emptyDesign(), { mode: "public" });
    expect(css).toContain("@media (prefers-reduced-motion: no-preference){@keyframes emvb-lo{");
    expect(css).toContain(
      "@media (prefers-reduced-motion: reduce){.emvb-e-head0001{animation:none}}",
    );
    expect(renderPage(layout(), emptyDesign(), { mode: "public" }).css).not.toContain("emvb-lo");
  });
});
