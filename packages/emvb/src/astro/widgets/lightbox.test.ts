import { afterEach, describe, expect, test } from "bun:test";
import { initLightbox, pictureName, resetLightboxForTest } from "./lightbox.ts";

afterEach(() => resetLightboxForTest());

function fixture(lightbox = true) {
  document.body.innerHTML = `
    <ul class="emvb-gallery" ${lightbox ? "data-emvb-lightbox" : ""}>
      <li class="emvb-gallery-image"><figure><img src="/a.jpg" alt="Harbour at dawn"></figure></li>
      <li class="emvb-gallery-image"><figure><img src="/b.jpg" alt=""><figcaption>Old pier</figcaption></figure></li>
      <li class="emvb-gallery-image"><figure><img src="/c.jpg" alt=""></figure></li>
    </ul>`;
  return [...document.querySelectorAll<HTMLImageElement>("img")];
}
const viewer = () => document.querySelector<HTMLDialogElement>("dialog.emvb-lightbox");
const openers = () => [...document.querySelectorAll<HTMLButtonElement>(".emvb-gallery-open")];

describe("Gallery lightbox runtime (W-1019)", () => {
  test("each picture becomes a named button; galleries without the opt-in are left alone", () => {
    fixture(false);
    initLightbox(document);
    expect(openers()).toHaveLength(0);
    fixture();
    initLightbox(document);
    expect(openers().map((b) => b.getAttribute("aria-label"))).toEqual([
      "View larger: Harbour at dawn",
      "View larger: Old pier",
      "View larger: Picture 3 of 3",
    ]);
    expect(openers()[0]?.querySelector("img")?.getAttribute("src")).toBe("/a.jpg");
  });

  test("a button opens the picture in a modal dialog with its place; Next and Previous wrap", () => {
    fixture();
    initLightbox(document);
    openers()[1]?.click();
    const dialog = viewer();
    expect(dialog?.open).toBe(true);
    expect(dialog?.querySelector("img")?.getAttribute("src")).toContain("/b.jpg");
    expect(dialog?.querySelector("[aria-live]")?.textContent).toBe("Old pier · 2 of 3");
    dialog?.querySelector<HTMLButtonElement>('[aria-label="Next picture"]')?.click();
    expect(dialog?.querySelector("[aria-live]")?.textContent).toBe("3 of 3");
    dialog?.querySelector<HTMLButtonElement>('[aria-label="Next picture"]')?.click();
    expect(dialog?.querySelector("img")?.getAttribute("alt")).toBe("Harbour at dawn");
    dialog?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(dialog?.querySelector("[aria-live]")?.textContent).toBe("3 of 3");
  });

  test("closing returns focus to the picture's button; one dialog serves every open", () => {
    fixture();
    initLightbox(document);
    openers()[2]?.click();
    viewer()?.querySelector<HTMLButtonElement>('[aria-label="Close"]')?.click();
    expect(viewer()?.open).toBe(false);
    expect(document.activeElement).toBe(openers()[2] ?? null);
    openers()[0]?.click();
    expect(document.querySelectorAll("dialog.emvb-lightbox")).toHaveLength(1);
  });

  test("running twice wraps each picture once", () => {
    fixture();
    initLightbox(document);
    initLightbox(document);
    expect(openers()).toHaveLength(3);
    expect(document.querySelectorAll(".emvb-gallery-open .emvb-gallery-open")).toHaveLength(0);
  });

  test("a picture's name falls back from alt to caption to its place", () => {
    const [a, b, c] = fixture(false);
    expect([a, b, c].map((img, i) => (img ? pictureName(img, i, 3) : ""))).toEqual([
      "Harbour at dawn",
      "Old pier",
      "Picture 3 of 3",
    ]);
  });
});
