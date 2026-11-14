import { afterEach, describe, expect, test } from "bun:test";
import { initShare } from "./share.ts";

const realShare = Object.getOwnPropertyDescriptor(navigator, "share");

function fixture() {
  document.body.innerHTML = `<ul class="emvb-share-buttons" data-emvb-share-list><li class="emvb-share-native-item"><button type="button" class="emvb-share-native" data-emvb-share>Share…</button></li></ul>`;
  return document.querySelector<HTMLElement>("[data-emvb-share-list]") as HTMLElement;
}

afterEach(() => {
  if (realShare) Object.defineProperty(navigator, "share", realShare);
  else delete (navigator as { share?: unknown }).share;
  document.body.innerHTML = "";
});

describe("share runtime (W-1047)", () => {
  test("where the browser can share, the button shows and opens its sheet for this page", async () => {
    const shared: unknown[] = [];
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: (data: unknown) => {
        shared.push(data);
        return Promise.resolve();
      },
    });
    const list = fixture();
    initShare(document);
    expect(list.dataset["emvbReady"]).toBe("");
    document.querySelector<HTMLButtonElement>("[data-emvb-share]")?.click();
    expect(shared).toHaveLength(1);
    expect(JSON.stringify(shared[0])).toContain('"url":"');
  });

  test("without a share sheet the button stays hidden", () => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    const list = fixture();
    initShare(document);
    expect(list.dataset["emvbReady"]).toBeUndefined();
  });
});
