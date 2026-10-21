import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { useEdgeHints } from "./ThemePartList.tsx";
import { cleanup, mount } from "../../../test/dom/mount.ts";

afterEach(cleanup);

function Row() {
  const ref = useEdgeHints<HTMLDivElement>();
  return <div ref={ref} data-row="" />;
}

test("W-863: a scrolling tab row marks the edges that hide more tabs", async () => {
  const host = await mount(<Row />);
  const row = host.querySelector<HTMLElement>("[data-row]") as HTMLElement;
  expect(row.hasAttribute("data-more-start")).toBe(false);
  expect(row.hasAttribute("data-more-end")).toBe(false);
  Object.defineProperty(row, "scrollWidth", { configurable: true, value: 600 });
  Object.defineProperty(row, "clientWidth", { configurable: true, value: 300 });
  const scrollTo = async (left: number) => {
    row.scrollLeft = left;
    await act(async () => {
      row.dispatchEvent(new Event("scroll"));
    });
  };
  await scrollTo(0);
  expect([row.hasAttribute("data-more-start"), row.hasAttribute("data-more-end")]).toEqual([
    false,
    true,
  ]);
  await scrollTo(150);
  expect([row.hasAttribute("data-more-start"), row.hasAttribute("data-more-end")]).toEqual([
    true,
    true,
  ]);
  await scrollTo(300);
  expect([row.hasAttribute("data-more-start"), row.hasAttribute("data-more-end")]).toEqual([
    true,
    false,
  ]);
});
