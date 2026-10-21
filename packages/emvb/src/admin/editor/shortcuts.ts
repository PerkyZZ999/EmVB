/** The editor's keyboard shortcuts (DESIGN_BRIEF), shown in the Shortcuts dialog. */
export const SHORTCUTS: readonly { action: string; keys: string }[] = [
  { action: "Command palette: insert, jump, apply a class, run an action", keys: "Ctrl/Cmd+K" },
  { action: "Move focus between regions", keys: "Tab / Shift+Tab" },
  { action: "Next or previous element", keys: "↑ / ↓" },
  { action: "Select first child / parent", keys: "Enter / Shift+Enter" },
  { action: "Clear selection", keys: "Esc" },
  { action: "Expand or collapse (Layers)", keys: "← / →" },
  // UX-085: F2 renames the focused layer or class chip; the list never said so.
  { action: "Rename (layer or class chip)", keys: "F2" },
  { action: "Move up / down", keys: "Alt+↑ / Alt+↓" },
  { action: "Move out / in", keys: "Alt+← / Alt+→" },
  { action: "Duplicate", keys: "Ctrl/Cmd+D" },
  { action: "Copy / paste element", keys: "Ctrl/Cmd+C / Ctrl/Cmd+V" },
  { action: "Paste style", keys: "Ctrl/Cmd+Shift+V" },
  { action: "Delete", keys: "Delete or Backspace" },
  // W-775: Ctrl/Cmd+Y redoes too (useEditorShortcuts); the list never said so.
  { action: "Undo / redo", keys: "Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y" },
  { action: "Save draft", keys: "Ctrl/Cmd+S" },
];

/** One alternative in a shortcut ("Ctrl/Cmd+Shift+Z"), with the separator before it. */
export type KeyCombo = { before: string; keys: string[] };

/** W-864: "Ctrl/Cmd+Z / Ctrl/Cmd+Y" as combos of single keys, for key boxes. */
export function keyCombos(keys: string): KeyCombo[] {
  const parts = keys.split(/( \/ | or )/);
  const combos: KeyCombo[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const combo = parts[i] ?? "";
    combos.push({ before: i === 0 ? "" : (parts[i - 1] ?? ""), keys: combo.split(/\+(?=.)/) });
  }
  return combos;
}

/**
 * W-565: the letter of a Ctrl/Cmd shortcut on any keyboard layout. A Russian, Greek, Hebrew or
 * Arabic layout reports its own letter (Ctrl+Z is "я"), so the key's position stands in when the
 * key isn't a Latin letter. Latin layouts (AZERTY, Dvorak) keep the letter they type.
 */
export function shortcutKey(event: KeyboardEvent): string {
  const key = event.key.toLowerCase();
  if (/^[a-z]$/.test(key)) return key;
  const position = /^Key([A-Z])$/.exec(event.code ?? "");
  return position?.[1] ? position[1].toLowerCase() : key;
}

/** Ctrl/Cmd+K opens the host command palette, which would stack over the editor (S0-6). */
export const isPaletteShortcut = (event: KeyboardEvent) =>
  (event.ctrlKey || event.metaKey) && !event.altKey && shortcutKey(event) === "k";

/** Focus is inside an open dialog, where only Save fires. */
export const inDialog = (target: EventTarget | null) =>
  !!(target as HTMLElement | null)?.closest?.('[role="dialog"], [role="alertdialog"]');
