/**
 * W-1067: the opt-in Theme toggle runtime. A choice made with a Theme toggle is kept in this
 * browser and marks `<html data-emvb-theme="light|dark">`, which the page CSS reads before the
 * visitor's system setting. Each toggle shows once this runs, and says whether dark is on.
 */

const KEY = "emvb-theme";

function stored(): "light" | "dark" | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

const systemDark = () => globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches === true;

/** Dark is on: chosen, or by the system with no choice made. */
const isDark = () => {
  const chosen = document.documentElement.dataset["emvbTheme"];
  return chosen === "dark" || (chosen !== "light" && systemDark());
};

function sync(): void {
  const dark = String(isDark());
  for (const toggle of document.querySelectorAll<HTMLElement>("[data-emvb-theme-toggle]"))
    toggle.setAttribute("aria-pressed", dark);
}

export function initTheme(root: ParentNode = document): void {
  const choice = stored();
  if (choice) document.documentElement.dataset["emvbTheme"] = choice;
  for (const toggle of root.querySelectorAll<HTMLElement>("[data-emvb-theme-toggle]")) {
    if (toggle.dataset["emvbReady"] !== undefined) continue;
    toggle.dataset["emvbReady"] = "";
    toggle.addEventListener("click", () => {
      const next = isDark() ? "light" : "dark";
      document.documentElement.dataset["emvbTheme"] = next;
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // Private mode: the choice lasts for this page only.
      }
      sync();
    });
  }
  globalThis.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", sync);
  sync();
}
