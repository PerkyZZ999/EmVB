/**
 * Optional public popup runtime (S7b). Hosts load this only when
 * `resolveThemeParts().needsPopupsRuntime` is true (R-031).
 *
 * Triggers: page_load, delay, scroll, click, exit_intent, inactivity (W-081).
 * Advanced (thin): showTimes (localStorage), devices (viewport width).
 * Gaps vs Elementor (deferred): URL/query, scheduling, A/B.
 */

import {
  clampScrollPercent,
  matchesPopupDevices,
  type PopupDevice,
  TRIGGER_LIMITS,
  withinShowTimes,
} from "../../core/theme/popup-rules.ts";

type OpenTrigger =
  | { type: "page_load" }
  | { type: "delay"; ms: number }
  | { type: "scroll"; percent: number }
  | { type: "click"; selector: string }
  | { type: "exit_intent" }
  | { type: "inactivity"; ms: number };

type Advanced = {
  showTimes?: number | null;
  devices?: PopupDevice[] | null;
};

type TriggersDoc = {
  schemaVersion: number;
  open: OpenTrigger[];
  advanced?: Advanced;
};

type PopupConfig = {
  id: string;
  triggers: TriggersDoc;
};

const STORAGE_PREFIX = "emvb-popup-shown:";

function readConfig(el: HTMLElement): PopupConfig | null {
  const raw = el.getAttribute("data-emvb-popup-config");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PopupConfig;
    if (!parsed || typeof parsed.id !== "string" || !parsed.triggers?.open) return null;
    return parsed;
  } catch {
    return null;
  }
}

function timesShown(id: string): number {
  try {
    const value = localStorage.getItem(STORAGE_PREFIX + id);
    const n = value ? Number(value) : 0;
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

function bumpTimesShown(id: string): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + id, String(timesShown(id) + 1));
  } catch {
    // private mode / quota — ignore
  }
}

/** The schema allows only safe characters, but they can still form an invalid selector. */
function isValidSelector(selector: string): boolean {
  try {
    document.createDocumentFragment().querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

function canOpen(config: PopupConfig): boolean {
  const advanced = config.triggers.advanced;
  if (!matchesPopupDevices(advanced, window.innerWidth)) return false;
  if (!withinShowTimes(advanced, timesShown(config.id))) return false;
  return true;
}

type Controller = {
  root: HTMLElement;
  dialog: HTMLElement;
  lastFocus: HTMLElement | null;
  open: () => void;
  close: () => void;
  opened: boolean;
};

function createController(root: HTMLElement): Controller | null {
  const dialog = root.querySelector<HTMLElement>(".emvb-popup__dialog");
  if (!dialog) return null;
  const ctrl: Controller = {
    root,
    dialog,
    lastFocus: null,
    opened: false,
    open() {
      ctrl.lastFocus = document.activeElement as HTMLElement | null;
      root.hidden = false;
      ctrl.opened = true;
      dialog.focus({ preventScroll: true });
    },
    close() {
      if (!ctrl.opened) return;
      root.hidden = true;
      ctrl.opened = false;
      const prev = ctrl.lastFocus;
      if (prev && typeof prev.focus === "function") prev.focus({ preventScroll: true });
    },
  };
  return ctrl;
}

function focusables(container: HTMLElement): HTMLElement[] {
  const nodes = container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
  );
  // W-279: a form's hidden inputs and controls hidden on this device can't take focus; counting
  // one as the last control let Tab leave the dialog from the real last one.
  return [...nodes].filter(
    (el) =>
      !el.hasAttribute("disabled") &&
      el.tabIndex >= 0 &&
      !(el instanceof HTMLInputElement && el.type === "hidden") &&
      !el.closest("[hidden], [inert]") &&
      (typeof el.checkVisibility !== "function" || el.checkVisibility()),
  );
}

function bindA11y(ctrl: Controller): void {
  ctrl.root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest?.("[data-emvb-popup-dismiss]")) {
      ctrl.close();
    }
  });
  ctrl.dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      ctrl.close();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusables(ctrl.dialog);
    if (items.length === 0) {
      event.preventDefault();
      ctrl.dialog.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

/** Opens a closed popup and counts the show; a trigger while it's open does neither (W-092). */
function openOnce(ctrl: Controller, config: PopupConfig): void {
  if (ctrl.opened || !canOpen(config)) return;
  ctrl.open();
  bumpTimesShown(config.id);
}

const IDLE_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;

type Arm<T extends OpenTrigger["type"]> = (
  open: () => void,
  trigger: Extract<OpenTrigger, { type: T }>,
) => void;

/** How each open trigger waits before calling `open`; unknown types never open. */
const ARM: { [T in OpenTrigger["type"]]: Arm<T> } = {
  page_load: (open) => open(),
  delay: (open, trigger) => {
    window.setTimeout(open, Math.max(0, Number(trigger.ms) || 0));
  },
  scroll: (open, trigger) => {
    const threshold = clampScrollPercent(trigger.percent) / 100;
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const progress = max <= 0 ? 1 : window.scrollY / max;
      if (progress >= threshold) {
        window.removeEventListener("scroll", onScroll);
        open();
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  },
  click: (open, trigger) => {
    const selector = String(trigger.selector ?? "").trim();
    if (!selector || !isValidSelector(selector)) return;
    document.addEventListener("click", (event) => {
      const target = event.target as Element | null;
      if (target?.closest?.(selector)) open();
    });
  },
  exit_intent: (open) => {
    // Desktop: pointer leaves the document toward the top chrome (common exit-intent heuristic).
    const onLeave = (event: MouseEvent) => {
      if (event.clientY > 0) return;
      document.documentElement.removeEventListener("mouseleave", onLeave);
      open();
    };
    document.documentElement.addEventListener("mouseleave", onLeave);
  },
  inactivity: (open, trigger) => {
    const ms = Math.max(TRIGGER_LIMITS.minIdleMs, Number(trigger.ms) || 30_000);
    // W-279: opens once per visit, like scroll and exit intent; closing it doesn't re-arm the wait.
    const fire = () => {
      for (const eventName of IDLE_EVENTS) window.removeEventListener(eventName, reset);
      open();
    };
    let timer = window.setTimeout(fire, ms);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(fire, ms);
    };
    for (const eventName of IDLE_EVENTS) {
      window.addEventListener(eventName, reset, { passive: true });
    }
  },
};

function registerTrigger(ctrl: Controller, config: PopupConfig, trigger: OpenTrigger): void {
  const arm = (ARM as Record<string, Arm<OpenTrigger["type"]> | undefined>)[trigger.type];
  arm?.(() => openOnce(ctrl, config), trigger as never);
}

export function initPopups(root: ParentNode = document): void {
  const nodes = root.querySelectorAll<HTMLElement>("[data-emvb-popup]");
  for (const node of nodes) {
    const config = readConfig(node);
    if (!config) continue;
    const ctrl = createController(node);
    if (!ctrl) continue;
    bindA11y(ctrl);
    for (const trigger of config.triggers.open) {
      registerTrigger(ctrl, config, trigger);
    }
  }
}
