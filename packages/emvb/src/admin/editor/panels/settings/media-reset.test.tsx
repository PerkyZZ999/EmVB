import { afterEach, expect, test } from "bun:test";
import { act, useState } from "react";
import type { LayoutNode } from "../../../../core/index.ts";
import { cleanup, mount, settle, unmount } from "../../../../../test/dom/mount.ts";
import type { Fetcher } from "../../../api.ts";
import { buildImageEdit } from "../../../image-editor/save.ts";
import { MediaPicker } from "./MediaPicker.tsx";

afterEach(cleanup);

async function pendingReset() {
  const record = buildImageEdit({
    imageProps: { src: "/original.jpg", mediaId: "original" },
    recipe: { version: 1, lights: { exposure: 0.2 } },
    output: { format: "webp", quality: 0.85, maxSide: 2560, stripGps: true },
  });
  if (!record.ok) throw new Error(record.message);
  let current: LayoutNode = {
    id: "image001",
    type: "image",
    props: { src: "/copy.webp", mediaId: "copy", alt: "First alt", edit: record.edit },
  };
  let update: (node: LayoutNode) => void = () => {};
  const sent: LayoutNode[] = [];
  const pending = Promise.withResolvers<Response>();
  const fetcher: Fetcher = async () => pending.promise;
  function View() {
    const [node, setNode] = useState(current);
    current = node;
    update = setNode;
    return (
      <MediaPicker
        node={node}
        fetcher={fetcher}
        editable
        onChange={(next) => {
          sent.push(next);
          setNode(next);
        }}
      />
    );
  }
  const host = await mount(<View />);
  await act(async () =>
    host.querySelector<HTMLElement>("[data-emvb-image-reset-original]")?.click(),
  );
  const finish = async (response: Response) => {
    await act(async () => pending.resolve(response));
    await settle();
  };
  return {
    host,
    sent,
    finish,
    current: () => {
      if (current.type !== "image") throw new Error("Expected an image node");
      return current;
    },
    update: (node: LayoutNode) => act(async () => update(node)),
  };
}

const original = () =>
  Response.json({
    data: {
      item: {
        id: "original",
        url: "/original.jpg",
        width: 100,
        height: 80,
      },
    },
  });

for (const [name, response] of [
  ["success", original],
  ["deleted original", () => new Response("{}", { status: 404 })],
  ["failed lookup", () => Response.json({ error: { message: "Offline" } }, { status: 503 })],
] as const) {
  test(`W-714: a delayed reset ${name} leaves a newer URL untouched`, async () => {
    const view = await pendingReset();
    const input = view.host.querySelector<HTMLInputElement>("[data-emvb-media-url]");
    if (!input) throw new Error("No image URL field");
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
    expect(view.current().props.src).toBe("/new.jpg");
    await view.finish(response());
    expect(view.current().props.src).toBe("/new.jpg");
    expect(view.sent).toHaveLength(1);
    expect(input.getAttribute("aria-invalid")).not.toBe("true");
    expect(view.host.textContent).not.toContain("can't be reset");
    expect(view.host.textContent).not.toContain("Couldn't reach the media library");
  });
}

test("W-714: resetting the same image preserves newer alt text and styling", async () => {
  const view = await pendingReset();
  await view.update({
    ...view.current(),
    props: { ...view.current().props, alt: "New alt" },
    style: { opacity: 0.5 },
  });
  await view.finish(original());
  expect(view.current().props.src).toBe("/original.jpg");
  expect(view.current().props.alt).toBe("New alt");
  expect(view.current().style).toEqual({ opacity: 0.5 });
  expect(view.current().props.edit).toBeUndefined();
});

test("W-714: leaving the image settings invalidates the pending reset", async () => {
  const view = await pendingReset();
  await unmount();
  await view.finish(original());
  expect(view.sent).toHaveLength(0);
});
