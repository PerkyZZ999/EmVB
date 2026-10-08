import { initMenus } from "../../../packages/emvb/src/astro/menu/runtime.ts";
import { initTabs } from "../../../packages/emvb/src/astro/tabs/runtime.ts";
import { readState, seedState } from "./mock/backend.ts";
import { serveUploads } from "./uploads.ts";
import { renderView } from "./view.ts";

/**
 * /playground/view/: the playground's public page. It renders the saved page with EmVB's public
 * renderer, then starts the same small runtimes a real site loads (Tabs, Menu dropdowns).
 */

/** Sent to the playground when Escape is pressed inside its View panel. */
const CLOSE_MESSAGE = "emvb-playground:close-view";

const DEMO_FORM_MESSAGE =
  "Demo only: nothing was sent. On a real site, the EmDash Forms plugin stores this submission.";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function showMessage(title: string, body: string) {
  document.title = `${title} · EmVB playground`;
  const main = document.createElement("main");
  main.className = "pg-view-message";
  const h1 = document.createElement("h1");
  h1.textContent = title;
  const p = document.createElement("p");
  p.textContent = body;
  const back = document.createElement("a");
  back.href = "/playground/";
  back.textContent = "Open the playground";
  main.append(h1, p, back);
  document.body.replaceChildren(main);
}

/** Forms submit nowhere in the playground; the visitor sees what would have happened. */
function interceptForms() {
  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      event.preventDefault();
      if (!form.reportValidity()) return;
      let status = form.querySelector<HTMLElement>("[data-pg-demo-status]");
      if (!status) {
        status = document.createElement("p");
        status.setAttribute("role", "status");
        status.dataset["pgDemoStatus"] = "";
        status.className = "pg-demo-status";
        form.append(status);
      }
      status.textContent = DEMO_FORM_MESSAGE;
    },
    true,
  );
}

/** Inside the playground's View panel, links leave in a new tab instead of replacing the view. */
function keepEmbedLinksOut() {
  // Escape in here still closes the panel (keys in a frame don't reach the page around it).
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape")
      window.parent.postMessage({ type: CLOSE_MESSAGE }, window.location.origin);
  });
  document.addEventListener("click", (event) => {
    const link = (event.target as Element | null)?.closest?.("a[href]");
    if (!(link instanceof HTMLAnchorElement)) return;
    const href = link.getAttribute("href") ?? "";
    if (href.startsWith("#")) return;
    event.preventDefault();
    window.open(link.href, "_blank", "noopener");
  });
}

/** Renders the page named in the URL into `#pg-view`. */
export function startView(): void {
  serveUploads();
  const params = new URLSearchParams(window.location.search);
  const state = readState(storage()) ?? seedState();
  const result = renderView(state, {
    entry: params.get("entry"),
    slug: params.get("slug"),
    draft: params.get("draft") === "1",
  });

  if (!result.ok) {
    if (result.reason === "unpublished") {
      showMessage(
        "This page isn't published yet",
        "Publish it in the playground editor, or open its saved draft from the editor's Preview.",
      );
    } else if (result.reason === "unreadable") {
      showMessage(
        "This page can't be shown",
        "Its saved layout can't be read. Reset the playground.",
      );
    } else {
      showMessage("Page not found", "It may have been deleted, or the playground was reset.");
    }
  } else {
    document.title = result.draft ? `${result.title} (draft)` : result.title;
    if (result.description) {
      document
        .querySelector('meta[name="description"]')
        ?.setAttribute("content", result.description);
    }
    if (result.dir) document.documentElement.dir = result.dir;
    const style = document.createElement("style");
    style.textContent = result.css;
    document.head.append(style);
    const root = document.getElementById("pg-view");
    if (root) root.innerHTML = result.html;
    if (result.needsTabsRuntime) initTabs();
    if (result.needsMenuRuntime) initMenus();
    interceptForms();
    if (params.get("embed") === "1") keepEmbedLinksOut();
    if (result.draft && params.get("embed") !== "1") {
      // A landmark of its own, so the badge isn't stray content outside the page's main (W-293).
      const badge = document.createElement("aside");
      badge.setAttribute("aria-label", "Draft preview");
      badge.className = "pg-draft-badge";
      badge.textContent = "Preview of a saved draft · EmVB playground";
      document.body.append(badge);
    }
  }
}
