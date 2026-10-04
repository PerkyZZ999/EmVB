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
