import * as React from "react";

/**
 * Where copied elements and styles live (W-093, D-033): localStorage on the admin's origin, so a
 * copy reaches every page and theme part open in this browser, in this tab or another, without a
 * clipboard permission prompt. The system clipboard is left alone.
 */
export const CLIPBOARD_KEY = "emvb-clipboard";
const CHANGE_EVENT = "emvb-clipboard-change";

export function readClipboardText(): string | null {
  try {
    return localStorage.getItem(CLIPBOARD_KEY);
  } catch {
    return null;
  }
}

/** Stores the clip; false when storage is unavailable or full. */
export function writeClipboardText(text: string): boolean {
  try {
    localStorage.setItem(CLIPBOARD_KEY, text);
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return true;
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === CLIPBOARD_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** The clipboard text, updated when this tab or another one copies. */
export const useClipboardText = (): string | null =>
  React.useSyncExternalStore(subscribe, readClipboardText, () => null);
