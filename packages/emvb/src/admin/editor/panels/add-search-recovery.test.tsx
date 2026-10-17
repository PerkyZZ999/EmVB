import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { cleanup, mount } from "../../../../test/dom/mount.ts";
import { AddPanel } from "./AddPanel.tsx";

afterEach(cleanup);

const search = () =>
  document.querySelector<HTMLInputElement>('input[aria-label="Search elements"]');
const tiles = () => document.querySelectorAll(".emvb-element-tile").length;

test("UX-013: an Add search with no results offers Clear search, which restores the tiles and focus", async () => {
  await mount(<AddPanel onAdd={() => undefined} defaultQuery="zzzz" />);
  expect(tiles()).toBe(0);
  const clear = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === "Clear search",
  );
  await act(async () => clear?.click());
  expect(search()?.value ?? null).toBe("");
  expect(tiles() > 0).toBe(true);
  expect(document.activeElement === search()).toBe(true);
});

test("UX-013: Escape clears a non-empty Add search and stops there", async () => {
  let reached = 0;
  const onWindowKey = () => (reached += 1);
  window.addEventListener("keydown", onWindowKey);
  try {
    await mount(<AddPanel onAdd={() => undefined} defaultQuery="head" />);
    const input = search();
    await act(async () => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(search()?.value ?? null).toBe("");
    expect(reached).toBe(0);
  } finally {
    window.removeEventListener("keydown", onWindowKey);
  }
});

test("UX-053: the Add search is a named search box without a heading that repeats its placeholder", async () => {
  await mount(<AddPanel onAdd={() => undefined} />);
  const box = search();
  expect(box ? `${box.type} / ${box.placeholder}` : "missing").toBe("search / Search elements…");
  const labels = [...document.querySelectorAll("label")].map((l) => l.textContent?.trim());
  expect(labels.includes("Search elements")).toBe(false);
});
