import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { decodeSharedPage, emptyDesign, sharedFromHash, type Layout } from "../../core/index.ts";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";
import { ShareLinkDialog, siteOnlyMedia } from "./ShareLink.tsx";

afterEach(cleanup);

const layout = {
  schemaVersion: 13,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        id: "img00001",
        type: "image",
        props: { src: "/uploads/a.png", alt: "A", decorative: false },
      },
      {
        id: "img00002",
        type: "image",
        props: { src: "https://cdn.example/b.png", alt: "B", decorative: false },
      },
    ],
  },
} as Layout;

const linkField = () => document.querySelector<HTMLInputElement>("[data-emvb-share-link]");

async function waitForLink() {
  for (let i = 0; i < 50 && !linkField()?.value.startsWith("http"); i += 1) {
    // oxlint-disable-next-line no-await-in-loop
    await act(async () => new Promise((r) => setTimeout(r, 5)));
  }
  return linkField()?.value ?? "";
}

describe("W-321 Share as a playground link", () => {
  test("W-321 builds a link that opens this page, and copies it", async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => void written.push(text) },
    });
    await mount(
      <ShareLinkDialog
        open
        onOpenChange={() => {}}
        layout={layout}
        design={emptyDesign()}
        title="Home"
        base="https://example.test/playground/"
      />,
    );
    const link = await waitForLink();
    expect(link.startsWith("https://example.test/playground/#p=1.")).toBe(true);
    const read = await decodeSharedPage(sharedFromHash(new URL(link).hash) ?? "");
    expect(read.ok && read.page.title).toBe("Home");
    expect(read.ok && read.page.layout).toEqual(layout);
    expect(document.querySelector("[data-emvb-share-media]")?.textContent).toContain(
      "1 image or video",
    );
    const copy = document.querySelector<HTMLButtonElement>("[data-emvb-share-copy]");
    await act(async () => copy?.click());
    await settle();
    expect(written).toEqual([link]);
    expect(document.body.textContent).toContain("Copied.");
  });

  test("W-321 counts only site-only media", () => {
    expect(siteOnlyMedia(layout)).toBe(1);
  });
});
