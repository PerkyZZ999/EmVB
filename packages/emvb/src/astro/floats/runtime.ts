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

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

/**
 * W-782: hiding the float that holds focus dropped focus to <body>, so the next Tab
 * restarted at the top of the page. Move it to the nearest control after the float,
 * else the one before it.
 */
function keepFocusNear(el: HTMLElement): void {
  if (!el.contains(document.activeElement)) return;
  const candidates = [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (c) => !el.contains(c) && !c.closest("[hidden],[inert]"),
  );
  const after = candidates.find(
    (c) => (el.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
  );
  const target = after ?? candidates.at(-1);
  target?.focus();
}

function hide(el: HTMLElement): void {
  const id = el.getAttribute("data-emvb-float");
  keepFocusNear(el);
  el.hidden = true;
  if (id) rememberClosed(id);
  placeFloats();
}

/** Hide floats already closed this visit, then keep bars stacked. */
export function initFloats(): void {
  // W-407: a second call (a host loading the script twice) added a second click handler.
  const marked = document.documentElement;
  if (marked.dataset["emvbFloatsReady"] === "1") return;
  marked.dataset["emvbFloatsReady"] = "1";
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
  // W-407: a bar's height also changes without a window resize (web fonts arriving, text
  // wrapping once styles load), which left the reserved padding short and the bar over content.
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => placeFloats());
    for (const el of bars()) observer.observe(el);
  }
}
