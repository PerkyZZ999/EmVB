/**
 * W-1041: the opt-in Map runtime. It shows each Map's "Show the map" button (hidden by CSS until
 * this script marks the Map ready) and, only when it is pressed, replaces it with the map in an
 * iframe, so nothing is fetched from the map service before the visitor asks.
 */

const ALLOWED = /^https:\/\/www\.(?:openstreetmap\.org\/export\/embed\.html|google\.com\/maps)\?/;

function load(frame: HTMLElement): void {
  const src = frame.dataset["src"] ?? "";
  if (!ALLOWED.test(src)) return;
  // oxlint-disable-next-line react/iframe-missing-sandbox -- set just below, before it loads
  const iframe = frame.ownerDocument.createElement("iframe");
  // Map pages need their own scripts; they stay in their own origin and may open links.
  iframe.setAttribute(
    "sandbox",
    "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox",
  );
  iframe.src = src;
  iframe.title = frame.dataset["title"] || "Map";
  iframe.height = frame.dataset["height"] || "360";
  iframe.loading = "lazy";
  iframe.referrerPolicy = "no-referrer-when-downgrade";
  frame.replaceChildren(iframe);
  iframe.focus();
}

export function initMaps(root: ParentNode = document): void {
  for (const map of root.querySelectorAll<HTMLElement>("[data-emvb-map]")) {
    if (map.dataset["emvbReady"] !== undefined) continue;
    const frame = map.querySelector<HTMLElement>(".emvb-map-frame");
    const button = frame?.querySelector<HTMLButtonElement>(".emvb-map-load");
    if (!frame || !button) continue;
    map.dataset["emvbReady"] = "";
    button.addEventListener("click", () => load(frame));
  }
}
