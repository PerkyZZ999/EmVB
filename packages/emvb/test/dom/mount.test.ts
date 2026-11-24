import { afterEach, expect, test } from "bun:test";
import { untilPopupClosed } from "./mount.ts";
import { pickOption } from "./select.ts";

// W-1096: untilPopupClosed() waits for an open list to go, and treats a list Kumo keeps on the
// page but hidden (its Select in a StyleRow) as closed, instead of waiting out its 2 s limit.

afterEach(() => {
  document.body.innerHTML = "";
});

test("W-1096: a list that stays on the page, hidden, counts as closed at once", async () => {
  document.body.innerHTML =
    '<div data-closed hidden><div role="listbox"><div role="option">Regular</div></div></div>';
  const started = performance.now();
  await untilPopupClosed();
  expect(performance.now() - started).toBeLessThan(1000);
});

test("W-1096: an open list is waited for until it goes", async () => {
  document.body.innerHTML = '<div><div role="listbox"><div role="option">Regular</div></div></div>';
  setTimeout(() => {
    document.body.innerHTML = "";
  }, 150);
  const started = performance.now();
  await untilPopupClosed();
  const waited = performance.now() - started;
  expect(waited).toBeGreaterThanOrEqual(140);
  expect(waited).toBeLessThan(1000);
});

test("W-1096: picking a Select option waits for its popup to close", async () => {
  document.body.innerHTML =
    '<button role="combobox">Open</button><div role="listbox"><button role="option"><span data-emvb-option="space">Space</span></button></div>';
  const list = document.querySelector('[role="listbox"]');
  list?.querySelector('[role="option"]')?.addEventListener("click", () => {
    setTimeout(() => list.remove(), 200);
  });
  await pickOption(document.querySelector('[role="combobox"]'), "space");
  expect(list?.isConnected).toBe(false);
});
