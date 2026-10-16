import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import type { LayoutNode } from "../../../../core/index.ts";
import { cleanup, mount, rerender, settle, unmount } from "../../../../../test/dom/mount.ts";
import type { Fetcher } from "../../../api.ts";
import { MediaPicker } from "./MediaPicker.tsx";

let restoreImage = () => {};
afterEach(async () => {
  await cleanup();
  restoreImage();
});

async function pendingUpload() {
  const OriginalImage = globalThis.Image;
  class LoadedImage extends OriginalImage {
    constructor() {
      super();
      Object.defineProperties(this, { naturalWidth: { value: 64 }, naturalHeight: { value: 32 } });
      queueMicrotask(() => this.dispatchEvent(new Event("load")));
    }
  }
  globalThis.Image = LoadedImage;
  restoreImage = () => {
    globalThis.Image = OriginalImage;
  };
  let node: LayoutNode = {
    id: "image001",
    type: "image",
    props: { src: "/old.jpg", alt: "Old alt" },
  };
  const sent: LayoutNode[] = [];
  const pending = Promise.withResolvers<Response>();
  let uploads = 0;
  const fetcher: Fetcher = async (_path, init) => {
    if (init?.method === "POST") uploads++;
    return pending.promise;
  };
  const view = () => (
    <MediaPicker
      node={node}
      fetcher={fetcher}
      onChange={(next) => {
        node = next;
        sent.push(next);
      }}
    />
  );
  const host = await mount(view());
  const input = host.querySelector<HTMLInputElement>("[data-emvb-media-upload]");
  if (!input) throw new Error("No upload input");
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [new File(["image"], "cat.png", { type: "image/png" })],
  });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  await settle();
  expect(uploads).toBe(1);
  const update = async (next: LayoutNode) => {
    node = next;
    await rerender(view());
  };
  const finish = async (response: Response) => {
    await act(async () => pending.resolve(response));
    await settle();
  };
  return { host, sent, update, finish, current: () => node };
}

const uploaded = () =>
  Response.json(
    {
      data: {
        item: {
          id: "new-media",
          url: "/cat.png",
          filename: "cat.png",
          alt: "Cat",
          width: 64,
          height: 32,
        },
      },
    },
    { status: 201 },
  );

for (const [name, response] of [
  ["success", uploaded],
  ["failure", () => Response.json({ error: { message: "Upload offline" } }, { status: 503 })],
] as const) {
  test(`W-715: upload ${name} leaves a newer image URL untouched`, async () => {
    const view = await pendingUpload();
    const input = view.host.querySelector<HTMLInputElement>("[data-emvb-media-url]");
    if (!input) throw new Error("No URL input");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        input,
        "/new.jpg",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
    );
    await view.update(view.current());
    await view.finish(response());
    expect(view.sent.map((node) => (node.props as Record<string, unknown>).src)).toEqual([
      "/new.jpg",
    ]);
    expect(view.host.textContent).not.toContain("Upload offline");
  });
}

test("W-715: uploading to the same image preserves newer alt text and styling", async () => {
  const view = await pendingUpload();
  await view.update({
    ...view.current(),
    props: { ...view.current().props, alt: "New alt" },
    style: { opacity: 0.5 },
  });
  await view.finish(uploaded());
  expect(view.sent.map((node) => node.props)).toEqual([
    { src: "/cat.png", alt: "New alt", mediaId: "new-media", width: 64, height: 32 },
  ]);
  expect(view.sent[0]?.style).toEqual({ opacity: 0.5 });
});

test("W-715: an upload completing after leaving image settings cannot apply its result", async () => {
  const view = await pendingUpload();
  await unmount();
  await view.finish(uploaded());
  expect(view.sent).toHaveLength(0);
});
