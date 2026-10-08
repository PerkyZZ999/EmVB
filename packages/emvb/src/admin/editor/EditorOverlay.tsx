import * as React from "react";
import { createPortal } from "react-dom";
import { EDITOR_CSS } from "./editor-css.ts";
import { isPaletteShortcut } from "./shortcuts.ts";

/**
 * The full-screen editor layer (D-011, S0-6). It is portaled to `document.body` with
 * `z-index: auto`: it still covers the admin shell, and Kumo and host layers portaled later
 * (dialogs, the palette, toasts) stack above it. A positive z-index would hide them while they
 * keep focus.
 */
export function EditorOverlay({
  label,
  dirty = false,
  children,
}: {
  label: string;
  dirty?: boolean;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    const block = (event: KeyboardEvent) => {
      if (!isPaletteShortcut(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener("keydown", block, true);
    return () => window.removeEventListener("keydown", block, true);
  }, []);

  // W-300: the overlay covers the EmDash admin shell, but Tab still walked its sidebar first.
  // Mark the shell inert while the editor is open; hosts without #admin-root (the playground) are
  // unchanged. Toast portals stay after the overlay so they stay focusable.
  React.useEffect(() => {
    const shell = document.getElementById("admin-root");
    if (!shell) return;
    shell.inert = true;
    return () => {
      shell.inert = false;
    };
  }, []);

  React.useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers need returnValue set to show the prompt.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  return createPortal(
    <div
      data-emvb-editor=""
      role="region"
      aria-label={label}
      style={{ position: "fixed", inset: 0, zIndex: "auto" }}
    >
      <style>{EDITOR_CSS}</style>
      {children}
    </div>,
    document.body,
  );
}
