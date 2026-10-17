import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "CanvasFrame.tsx"), "utf8");

test("UX-019: an empty page's root fills the canvas and says how to start", () => {
  expect(source.includes(":where(.emvb-root:empty){min-height:100vh}")).toBe(true);
  expect(
    source.includes(
      '.emvb-root:empty::after{content:"Drag an element here from Add to start this page";font-size:18px}',
    ),
  ).toBe(true);
});
