import { expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { validateLayout } from "../validate.ts";
import { renderPage } from "./index.ts";

const page = (props: Record<string, unknown>): Layout =>
  ({
    schemaVersion: 14,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        { id: "imag0001", type: "image", props: { src: "/hero.jpg", alt: "Hero", ...props } },
      ],
    },
  }) as Layout;
const img = (props: Record<string, unknown>) => {
  const host = document.createElement("div");
  host.innerHTML = renderPage(page(props), emptyDesign()).html;
  return host.querySelector("img") as HTMLImageElement;
};

test("Load right away renders an eager, high-priority image; others stay lazy (W-226)", () => {
  expect(validateLayout(page({ priority: true })).ok).toBe(true);
  const hero = img({ priority: true });
  expect(hero.getAttribute("loading")).toBe("eager");
  expect(hero.getAttribute("fetchpriority")).toBe("high");
  expect(hero.hasAttribute("decoding")).toBe(false);
  const other = img({});
  expect(other.getAttribute("loading")).toBe("lazy");
  expect(other.getAttribute("decoding")).toBe("async");
  expect(other.hasAttribute("fetchpriority")).toBe(false);
});
