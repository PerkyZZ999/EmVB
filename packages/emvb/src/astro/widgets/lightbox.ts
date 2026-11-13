/**
 * W-1019: the opt-in Gallery lightbox. In each gallery marked `data-emvb-lightbox` every picture
 * becomes a button that opens it large in one native modal <dialog>: Previous and Next (also the
 * arrow keys), a counter that screen readers hear, Close and Escape. Focus goes back to the
 * picture's button when the dialog closes. Without this script the gallery is plain pictures.
 */

type Viewer = {
  dialog: HTMLDialogElement;
  image: HTMLImageElement;
  caption: HTMLElement;
  count: HTMLElement;
  prev: HTMLButtonElement;
  next: HTMLButtonElement;
};

type Show = { images: HTMLImageElement[]; index: number; opener: HTMLElement };

let viewer: Viewer | undefined;
let showing: Show | undefined;

const captionOf = (image: HTMLImageElement) =>
  image.closest("figure")?.querySelector("figcaption")?.textContent?.trim() ?? "";

/** What a picture's button is called: its alt text, else its caption, else its place. */
export function pictureName(image: HTMLImageElement, index: number, total: number): string {
  return image.alt.trim() || captionOf(image) || `Picture ${index + 1} of ${total}`;
}

function button(label: string, text: string): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", label);
  el.textContent = text;
  return el;
}

function build(doc: Document): Viewer {
  const dialog = doc.createElement("dialog");
  dialog.className = "emvb-lightbox";
  dialog.setAttribute("aria-label", "Picture viewer");
  const figure = doc.createElement("figure");
  figure.className = "emvb-lightbox-figure";
  const image = doc.createElement("img");
  const bar = doc.createElement("div");
  bar.className = "emvb-lightbox-bar";
  const prev = button("Previous picture", "‹");
  const next = button("Next picture", "›");
  const close = button("Close", "×");
  const caption = doc.createElement("figcaption");
  caption.className = "emvb-lightbox-caption";
  const count = doc.createElement("span");
  count.setAttribute("aria-live", "polite");
  caption.append(count);
  bar.append(prev, caption, next, close);
  figure.append(image, bar);
  dialog.append(figure);
  doc.body.append(dialog);
  prev.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") step(document.dir === "rtl" ? 1 : -1);
    else if (event.key === "ArrowRight") step(document.dir === "rtl" ? -1 : 1);
  });
  dialog.addEventListener("close", () => {
    showing?.opener.focus();
    showing = undefined;
  });
  return { dialog, image, caption, count, prev, next };
}

function render(): void {
  if (!viewer || !showing) return;
  const { images, index } = showing;
  const source = images[index];
  if (!source) return;
  viewer.image.src = source.currentSrc || source.src;
  viewer.image.alt = source.alt;
  const words = captionOf(source);
  viewer.count.textContent = `${words ? `${words} · ` : ""}${index + 1} of ${images.length}`;
  const single = images.length < 2;
  viewer.prev.hidden = single;
  viewer.next.hidden = single;
}

function step(by: number): void {
  if (!showing) return;
  const total = showing.images.length;
  showing.index = (showing.index + by + total) % total;
  render();
}

function open(images: HTMLImageElement[], index: number, opener: HTMLElement): void {
  viewer ??= build(opener.ownerDocument);
  showing = { images, index, opener };
  render();
  if (!viewer.dialog.open) viewer.dialog.showModal();
}

export function initLightbox(root: ParentNode = document): void {
  for (const list of root.querySelectorAll<HTMLElement>("[data-emvb-lightbox]")) {
    if (list.dataset["emvbLightboxReady"] !== undefined) continue;
    list.dataset["emvbLightboxReady"] = "";
    const images = [
      ...list.querySelectorAll<HTMLImageElement>(":scope > .emvb-gallery-image > figure > img"),
    ];
    images.forEach((image, index) => {
      const opener = button(`View larger: ${pictureName(image, index, images.length)}`, "");
      opener.className = "emvb-gallery-open";
      image.replaceWith(opener);
      opener.append(image);
      opener.addEventListener("click", () => open(images, index, opener));
    });
  }
}

/** Test seam: forget the shared viewer between tests. */
export function resetLightboxForTest(): void {
  viewer?.dialog.remove();
  viewer = undefined;
  showing = undefined;
}
