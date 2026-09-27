/**
 * Optional public popup runtime (S7b). Hosts load this only when
 * `resolveThemeParts().needsPopupsRuntime` is true (R-031).
 *
 * Triggers: page_load, delay, scroll, click, exit_intent, inactivity (W-081).
 * Advanced (thin): showTimes (localStorage), devices (viewport width).
 * Gaps vs Elementor (deferred): URL/query, scheduling, A/B.
 */

type OpenTrigger =
  | { type: "page_load" }
  | { type: "delay"; ms: number }
  | { type: "scroll"; percent: number }
  | { type: "click"; selector: string }
  | { type: "exit_intent" }
  | { type: "inactivity"; ms: number };

type Advanced = {
  showTimes?: number | null;
  devices?: Array<"desktop" | "tablet" | "mobile"> | null;
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

function deviceForWidth(width: number): "desktop" | "tablet" | "mobile" {
  if (width < 768) return "mobile";
  if (width < 1025) return "tablet";
  return "desktop";
}

function matchesDevices(advanced: Advanced | undefined, width: number): boolean {
  const devices = advanced?.devices;
  if (!devices || devices.length === 0) return true;
  return devices.includes(deviceForWidth(width));
}

function withinShowTimes(advanced: Advanced | undefined, shown: number): boolean {
  const limit = advanced?.showTimes;
  if (limit === null || limit === undefined) return true;
  return shown < limit;
}

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

function canOpen(config: PopupConfig): boolean {
  const advanced = config.triggers.advanced;
  if (!matchesDevices(advanced, window.innerWidth)) return false;
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
      if (ctrl.opened) return;
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
      if (prev && typeof prev.focus === "function") {
        try {
          prev.focus({ preventScroll: true });
        } catch {
          // element may be gone
        }
      }
    },
  };
  return ctrl;
}

function focusables(container: HTMLElement): HTMLElement[] {
  const nodes = container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
  );
  return [...nodes].filter((el) => !el.hasAttribute("disabled") && el.tabIndex >= 0);
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

function openOnce(ctrl: Controller, config: PopupConfig): void {
  if (!canOpen(config)) return;
  ctrl.open();
  bumpTimesShown(config.id);
}

function registerTrigger(ctrl: Controller, config: PopupConfig, trigger: OpenTrigger): void {
  switch (trigger.type) {
    case "page_load":
      openOnce(ctrl, config);
      break;
    case "delay":
      window.setTimeout(() => openOnce(ctrl, config), Math.max(0, Number(trigger.ms) || 0));
      break;
    case "scroll": {
      const threshold = Math.min(100, Math.max(0, Number(trigger.percent) || 0)) / 100;
      const onScroll = () => {
        const doc = document.documentElement;
        const max = doc.scrollHeight - window.innerHeight;
        const progress = max <= 0 ? 1 : window.scrollY / max;
        if (progress >= threshold) {
          window.removeEventListener("scroll", onScroll);
          openOnce(ctrl, config);
        }
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
      break;
    }
    case "click": {
      const selector = String(trigger.selector ?? "").trim();
      if (!selector) break;
      document.addEventListener("click", (event) => {
        const target = event.target as Element | null;
        if (!target?.closest) return;
        try {
          if (target.closest(selector)) openOnce(ctrl, config);
        } catch {
          // invalid selector at runtime — ignore
        }
      });
      break;
    }
    case "exit_intent": {
      // Desktop: pointer leaves the document toward the top chrome (common exit-intent heuristic).
      const onLeave = (event: MouseEvent) => {
        if (event.clientY > 0) return;
        document.documentElement.removeEventListener("mouseleave", onLeave);
        openOnce(ctrl, config);
      };
      document.documentElement.addEventListener("mouseleave", onLeave);
      break;
    }
    case "inactivity": {
      const ms = Math.max(1000, Number(trigger.ms) || 30_000);
      let timer = window.setTimeout(() => openOnce(ctrl, config), ms);
      const reset = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => openOnce(ctrl, config), ms);
      };
      for (const eventName of ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const) {
        window.addEventListener(eventName, reset, { passive: true });
      }
      break;
    }
  }
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
