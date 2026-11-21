import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

let root: Root | undefined;
let host: HTMLElement | undefined;

/** Unmounts the current tree, if any, and removes its host from the page. */
export async function unmount(): Promise<void> {
  const current = root;
  if (current) await act(async () => current.unmount());
  root = undefined;
  host?.remove();
  host = undefined;
}

/** Renders `node` into a fresh host on the page, replacing any earlier tree. */
export async function mount(node: ReactNode): Promise<HTMLElement> {
  await unmount();
  const next = document.createElement("div");
  document.body.append(next);
  host = next;
  root = createRoot(next);
  await act(async () => root?.render(node));
  return next;
}

/** Renders `node` into the current tree, keeping its state, as a parent re-render would. */
export async function rerender(node: ReactNode): Promise<void> {
  const current = root;
  if (!current) throw new Error("Nothing is mounted");
  await act(async () => current.render(node));
}

/** Lets pending timers, and the renders they cause, run. */
export const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

/** Unmounts the tree and empties the page. */
export async function cleanup(): Promise<void> {
  await unmount();
  document.body.innerHTML = "";
  // The Style tab remembers open sections in localStorage (W-137); each test starts fresh.
  for (const key of Object.keys(localStorage))
    if (key.startsWith("emvb-style-sections:")) localStorage.removeItem(key);
}

/**
 * W-1094: waits, inside act(), until an open Base UI Select (or other floating list) has fully
 * closed. Base UI unmounts the popup, its positioner and focus manager on timers after a choice;
 * under load those outlast a fixed short pause and update outside act(), which W-1061 fails.
 */
export async function untilPopupClosed(): Promise<void> {
  await act(async () => {
    for (let waited = 0; waited < 2000; waited += 10) {
      // oxlint-disable-next-line no-await-in-loop -- polls until the popup has closed
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (!document.querySelector('[role="option"], [role="listbox"]')) break;
    }
    // The focus manager and portal settle one step after the list goes.
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}
