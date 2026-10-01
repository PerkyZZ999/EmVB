import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { LayoutNode } from "../../../../core/index.ts";
import { cleanup, mount, settle } from "../../../../../test/dom/mount.ts";
import type { Fetcher } from "../../../api.ts";
import { MediaPicker } from "./MediaPicker.tsx";

afterEach(cleanup);

// W-091: the image source control was only reached through two e2e tests (upload, pick); the
// URL checks, library errors and empty state weren't unit-tested.

const image = (props: Record<string, unknown>) =>
  ({ id: "img00001", type: "image", props }) as LayoutNode;

async function picker(node: LayoutNode, respond: () => Response) {
  const sent: LayoutNode[] = [];
  const paths: string[] = [];
  const fetcher: Fetcher = async (path) => {
    paths.push(path);
    return respond();
  };
  const host = await mount(
    <MediaPicker node={node} fetcher={fetcher} onChange={(next) => sent.push(next)} />,
  );
  const url = () => host.querySelector<HTMLInputElement>("[data-emvb-media-url]");
  const typeUrl = async (text: string) => {
    const input = url();
    if (!input) throw new Error("no URL field");
    await act(async () => {
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
  };
  const openLibrary = async () => {
    await act(async () => host.querySelector<HTMLElement>("[data-emvb-media-library]")?.click());
    await settle();
  };
  const text = () => host.textContent ?? "";
  return { host, sent, paths, typeUrl, openLibrary, text };
}

const ok = (items: unknown[]) => () => Response.json({ data: { items } });

describe("image source URL (W-091)", () => {
  test("an empty URL asks for a source and changes nothing", async () => {
    const view = await picker(image({ src: "", alt: "A" }), ok([]));
    await view.typeUrl("   ");
    expect(view.text()).toContain("Choose a library image, upload a file, or enter a URL.");
    expect(view.sent).toEqual([]);
  });

  test("an unsafe URL is refused with the URL hint", async () => {
    const view = await picker(image({ src: "", alt: "A" }), ok([]));
    await view.typeUrl("javascript:alert(1)");
    expect(view.text()).toContain("Use a full URL such as https://example.com/photo.jpg");
    expect(view.sent).toEqual([]);
  });

  test("a pasted URL is trimmed, replaces the source and drops the library id", async () => {
    const view = await picker(image({ src: "/old.png", alt: "A", mediaId: "m1" }), ok([]));
    await view.typeUrl("  https://example.com/new.jpg ");
    expect(view.sent.map((n) => n.props)).toEqual([
      { src: "https://example.com/new.jpg", alt: "A" },
    ]);
  });
});

describe("media library (W-091)", () => {
  test("opening it asks for up to 40 images and lists them", async () => {
    const view = await picker(
      image({ src: "", alt: "Image" }),
      ok([{ id: "m2", filename: "cat.png", url: "/media/cat.png", status: "ready" }]),
    );
    await view.openLibrary();
    expect(view.paths).toHaveLength(1);
    expect(view.paths[0]).toContain("limit=40");
    expect(view.host.querySelector('[data-emvb-media-id="m2"]')?.textContent).toBe("cat.png");
  });

  test("an empty library says so", async () => {
    const view = await picker(image({ src: "", alt: "Image" }), ok([]));
    await view.openLibrary();
    expect(view.text()).toContain("No images yet. Upload one to get started.");
  });

  test("a library that fails to load shows its error", async () => {
    const view = await picker(image({ src: "", alt: "Image" }), () =>
      Response.json(
        { error: { code: "FORBIDDEN", message: "Not allowed here." } },
        { status: 403 },
      ),
    );
    await view.openLibrary();
    expect(view.text()).toContain("Not allowed here.");
  });

  test("Close hides the library", async () => {
    const view = await picker(image({ src: "", alt: "Image" }), ok([]));
    await view.openLibrary();
    const close = [...view.host.querySelectorAll("button")].find((b) => b.textContent === "Close");
    await act(async () => close?.click());
    expect(view.host.querySelector("[data-emvb-media-dialog]")).toBeNull();
  });
});
