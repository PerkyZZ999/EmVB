/**
 * Optional public float runtime. Hosts load this only when
 * `resolveThemeParts().needsFloatsRuntime` is true, so pages without a float
 * stay free of EmVB JavaScript.
 *
 * Bars on the same edge stack. Their combined height is reserved as page
 * padding so the bar does not cover the first or last content. A close button
 * hides that float until the next visit, in sessionStorage, not a cookie.
 */

const STORAGE_PREFIX = "emvb-float-closed:";

function closed(id: string): boolean {
  try {
    return sessionStorage.getItem(STORAGE_PREFIX + id) === "1";
  } catch {
    return false;
  }
}

function rememberClosed(id: string): void {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + id, "1");
  } catch {
    // private mode — the float still hides for this page
  }
}

function bars(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("[data-emvb-float]")];
}

/** Stack visible bars and reserve their height. Corners are left to CSS. */
function placeFloats(): void {
  let top = 0;
  let bottom = 0;
  for (const el of bars()) {
    if (el.hidden) continue;
    const edge = el.getAttribute("data-emvb-float-edge");
    if (edge === "top") {
      el.style.top = `${top}px`;
      top += el.getBoundingClientRect().height;
    } else if (edge === "bottom") {
      el.style.bottom = `${bottom}px`;
      bottom += el.getBoundingClientRect().height;
    }
  }
  const root = document.documentElement;
  root.style.setProperty("--emvb-float-top", `${top}px`);
  root.style.setProperty("--emvb-float-bottom", `${bottom}px`);
}

function hide(el: HTMLElement): void {
  const id = el.getAttribute("data-emvb-float");
  el.hidden = true;
  if (id) rememberClosed(id);
  placeFloats();
}

/** Hide floats already closed this visit, then keep bars stacked. */
export function initFloats(): void {
  for (const el of bars()) {
    const id = el.getAttribute("data-emvb-float");
    if (id && closed(id)) el.hidden = true;
  }
  placeFloats();
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("[data-emvb-float-dismiss]");
    if (!button) return;
    const float = button.closest<HTMLElement>("[data-emvb-float]");
    if (!float) return;
    event.preventDefault();
    hide(float);
  });
  window.addEventListener("resize", placeFloats);
}
