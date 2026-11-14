/**
 * W-1047: the opt-in Share runtime. Where the browser has its own share sheet
 * (`navigator.share`), it shows each Share buttons element's Share button (hidden by CSS until
 * then) and opens the sheet for this page when it is pressed. Elsewhere nothing changes: the
 * plain share links stay.
 */

export function initShare(root: ParentNode = document): void {
  const nav = globalThis.navigator as Navigator | undefined;
  if (typeof nav?.share !== "function") return;
  for (const list of root.querySelectorAll<HTMLElement>("[data-emvb-share-list]")) {
    if (list.dataset["emvbReady"] !== undefined) continue;
    list.dataset["emvbReady"] = "";
    const button = list.querySelector<HTMLButtonElement>("[data-emvb-share]");
    button?.addEventListener("click", () => {
      const doc = list.ownerDocument;
      // A visitor closing the sheet rejects the promise; there is nothing to report.
      nav.share({ title: doc.title, url: doc.location.href.split("#")[0] }).catch(() => {});
    });
  }
}
