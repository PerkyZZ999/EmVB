import { afterEach, expect, test } from "bun:test";
import { cleanup, mount } from "../../../../test/dom/mount.ts";
import { AddPanel } from "./AddPanel.tsx";

afterEach(cleanup);

test("UX-029: a tile that adds a script says so to screen readers, not only with the JS badge", async () => {
  await mount(<AddPanel onAdd={() => undefined} />);
  const tabs = document.querySelector('[data-emvb-add-tile="tabs"]');
  expect(tabs?.getAttribute("aria-description") ?? null).toBe("Adds a small script to the page");
  const heading = document.querySelector('[data-emvb-add-tile="heading"]');
  expect(heading?.hasAttribute("aria-description") ?? true).toBe(false);
});
