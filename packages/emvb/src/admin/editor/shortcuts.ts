/** The editor's keyboard shortcuts (DESIGN_BRIEF), shown in the Shortcuts dialog. */
export const SHORTCUTS: readonly { action: string; keys: string }[] = [
  { action: "Command palette: insert, jump, apply a class, run an action", keys: "Ctrl/Cmd+K" },
  { action: "Move focus between regions", keys: "Tab / Shift+Tab" },
  { action: "Next or previous element", keys: "↑ / ↓" },
  { action: "Select first child / parent", keys: "Enter / Shift+Enter" },
  { action: "Clear selection", keys: "Esc" },
  { action: "Expand or collapse (Layers)", keys: "← / →" },
  { action: "Move up / down", keys: "Alt+↑ / Alt+↓" },
  { action: "Move out / in", keys: "Alt+← / Alt+→" },
  { action: "Duplicate", keys: "Ctrl/Cmd+D" },
  { action: "Copy / paste element", keys: "Ctrl/Cmd+C / Ctrl/Cmd+V" },
  { action: "Paste style", keys: "Ctrl/Cmd+Shift+V" },
  { action: "Delete", keys: "Delete or Backspace" },
  { action: "Undo / redo", keys: "Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z" },
  { action: "Save draft", keys: "Ctrl/Cmd+S" },
];

/** Ctrl/Cmd+K opens the host command palette, which would stack over the editor (S0-6). */
export const isPaletteShortcut = (event: KeyboardEvent) =>
  (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k";
