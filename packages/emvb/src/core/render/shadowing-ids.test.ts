import { expect, test } from "bun:test";
import { emptyDesign, validateLayout } from "../index.ts";
import { renderPage } from "./index.ts";

// S-12 (W-1001): a stored id that would shadow a browser global is kept (pages saved by 1.1.0
// still validate) but never written to the page.
const pageWith = (htmlId: string) =>
  validateLayout({
    schemaVersion: 18,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [{ id: "head0001", type: "heading", props: { text: "Hi", level: 2 }, htmlId }],
    },
  });

test("an id that shadows a browser global is left out of the page, others stay", () => {
  const shadowing = pageWith("location");
  expect(shadowing.ok).toBe(true);
  if (!shadowing.ok) return;
  expect(renderPage(shadowing.layout, emptyDesign()).html).not.toContain('id="location"');
  const top = pageWith("top");
  if (!top.ok) throw new Error("top refused");
  expect(renderPage(top.layout, emptyDesign()).html).toContain('id="top"');
});
