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

async function picker(node: LayoutNode, respond: () => Response | Promise<Response>) {
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
  /** Focus the field, optionally type, then leave it (blur), as tabbing through does. */
  const leaveUrl = async (text?: string) => {
    const input = url();
    if (!input) throw new Error("no URL field");
    await act(async () => {
      input.focus();
      if (text !== undefined) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
          input,
          text,
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await act(async () => input.blur());
  };
  const openLibrary = async () => {
    await act(async () => host.querySelector<HTMLElement>("[data-emvb-media-library]")?.click());
    await settle();
  };
  const text = () => host.textContent ?? "";
  return { host, sent, paths, typeUrl, leaveUrl, openLibrary, text };
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

describe("media library recovery (W-713)", () => {
  const unavailable = () =>
    Response.json({ error: { message: "Library temporarily unavailable." } }, { status: 503 });
  const dialog = (host: HTMLElement) => host.querySelector('[role="dialog"]');
  const retry = async (host: HTMLElement) => {
    const button = [...(dialog(host)?.querySelectorAll("button") ?? [])].find(
      (item) => item.textContent === "Retry",
    );
    if (!button) throw new Error("No library Retry button");
    await act(async () => button.click());
    await settle();
  };

  test("W-713: failed requests show a library alert, not an empty library or URL error", async () => {
    const view = await picker(image({ src: "/old.png", alt: "Old" }), unavailable);
    await view.openLibrary();
    expect(dialog(view.host)?.querySelector('[role="alert"]')?.textContent).toContain(
      "Library temporarily unavailable.",
    );
    expect(dialog(view.host)?.textContent).not.toContain("No images yet.");
    expect(view.host.querySelector("[data-emvb-media-url]")?.getAttribute("aria-invalid")).not.toBe(
      "true",
    );
    expect(view.sent).toEqual([]);
  });

  test("W-713: retry shows loading then allows picking the recovered library image", async () => {
    const pending = Promise.withResolvers<Response>();
    let attempts = 0;
    const view = await picker(image({ src: "/old.png", alt: "Old" }), () =>
      ++attempts === 1 ? unavailable() : pending.promise,
    );
    await view.openLibrary();
    await retry(view.host);
    expect(attempts).toBe(2);
    expect(dialog(view.host)?.textContent).toContain("Loading…");
    expect(dialog(view.host)?.textContent).not.toContain("Library temporarily unavailable.");
    expect(dialog(view.host)?.textContent).not.toContain("No images yet.");
    expect(view.sent).toEqual([]);
    await act(async () =>
      pending.resolve(
        ok([
          { id: "m2", filename: "cat.png", url: "/media/cat.png", status: "ready", alt: "Cat" },
        ])(),
      ),
    );
    await settle();
    await act(async () =>
      view.host.querySelector<HTMLElement>('[data-emvb-media-id="m2"]')?.click(),
    );
    expect(view.sent.map((node) => node.props)).toEqual([
      { src: "/media/cat.png", alt: "Old", mediaId: "m2" },
    ]);
    expect(dialog(view.host)?.outerHTML ?? null).toBeNull();
  });

  test("W-740: retry keeps focus on Close while loading and after an empty result", async () => {
    const pending = Promise.withResolvers<Response>();
    let attempts = 0;
    const view = await picker(image({ src: "/old.png", alt: "Old" }), () =>
      ++attempts === 1 ? unavailable() : pending.promise,
    );
    await view.openLibrary();
    const close = [...(dialog(view.host)?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Close",
    );
    const action = [...(dialog(view.host)?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Retry",
    );
    if (!close || !action) throw new Error("Missing library recovery controls");
    await act(async () => {
      action.focus();
      action.click();
    });
    await settle();
    expect(attempts).toBe(2);
    expect(dialog(view.host)?.textContent).toContain("Loading…");
    expect(document.activeElement === close).toBe(true);
    await act(async () => pending.resolve(ok([])()));
    await settle();
    expect(dialog(view.host)?.textContent).toContain("No images yet.");
    expect(document.activeElement === close).toBe(true);
    expect(view.sent).toEqual([]);
  });

  test("W-713: another failed retry stays recoverable and a successful empty response says empty", async () => {
    let attempts = 0;
    const view = await picker(image({ src: "", alt: "Image" }), () =>
      ++attempts < 3 ? unavailable() : ok([])(),
    );
    await view.openLibrary();
    await retry(view.host);
    expect(dialog(view.host)?.querySelector('[role="alert"]')?.textContent).toContain(
      "Library temporarily unavailable.",
    );
    await retry(view.host);
    expect(attempts).toBe(3);
    expect(dialog(view.host)?.querySelector('[role="alert"]')?.outerHTML ?? null).toBeNull();
    expect(dialog(view.host)?.textContent).toContain("No images yet.");
    expect(view.sent).toEqual([]);
  });
});

describe("leaving the URL field (W-092)", () => {
  test("tabbing through an unchanged URL keeps the library image and changes nothing", async () => {
    const view = await picker(image({ src: "/media/cat.png", alt: "A", mediaId: "m1" }), ok([]));
    await view.leaveUrl();
    expect(view.sent).toEqual([]);
    expect(view.text()).not.toContain("Use a full URL");
  });

  test("tabbing through the empty field of an image without a source shows no error", async () => {
    const view = await picker(image({ src: "", alt: "A" }), ok([]));
    await view.leaveUrl();
    expect(view.sent).toEqual([]);
    expect(view.text()).not.toContain("Choose a library image, upload a file, or enter a URL.");
  });

  test("the same URL with spaces around it, or Enter on it, is not a change", async () => {
    const view = await picker(image({ src: "/media/cat.png", alt: "A", mediaId: "m1" }), ok([]));
    await view.leaveUrl("  /media/cat.png ");
    await view.typeUrl("/media/cat.png");
    expect(view.sent).toEqual([]);
  });

  test("leaving after a real change commits it once", async () => {
    const view = await picker(image({ src: "/media/cat.png", alt: "A", mediaId: "m1" }), ok([]));
    await view.leaveUrl("https://example.com/dog.jpg");
    expect(view.sent.map((n) => n.props)).toEqual([
      { src: "https://example.com/dog.jpg", alt: "A" },
    ]);
  });

  test("going back to the saved URL clears an earlier error", async () => {
    const view = await picker(image({ src: "/media/cat.png", alt: "A" }), ok([]));
    await view.typeUrl("javascript:alert(1)");
    expect(view.text()).toContain("Use a full URL");
    await view.leaveUrl("/media/cat.png");
    expect(view.text()).not.toContain("Use a full URL");
    expect(view.sent).toEqual([]);
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
    expect(view.host.querySelector("[data-emvb-media-dialog]")?.outerHTML ?? null).toBeNull();
  });
});

describe("a new picture drops the old extra sizes (W-422)", () => {
  test("a pasted URL for a different image removes sources", async () => {
    const view = await picker(
      image({ src: "/old.png", alt: "A", sources: [{ src: "/old-480.png", width: 480 }] }),
      ok([]),
    );
    await view.typeUrl("https://example.com/new.jpg");
    expect(view.sent.map((n) => n.props)).toEqual([
      { src: "https://example.com/new.jpg", alt: "A" },
    ]);
  });
});

describe("Reset to original when the original is gone (W-492)", () => {
  const edited = async () => {
    const { buildImageEdit } = await import("../../../image-editor/save.ts");
    const built = buildImageEdit({
      imageProps: { src: "/_emdash/api/media/file/orig.jpg", mediaId: "01ORIGINAL" },
      recipe: { version: 1, lights: { exposure: 0.2 } },
      output: { format: "webp", quality: 0.85, maxSide: 2560, stripGps: true },
    });
    if (!built.ok) throw new Error(built.message);
    return image({
      src: "/_emdash/api/media/file/copy.webp",
      mediaId: "01COPY",
      alt: "A",
      edit: built.edit,
    });
  };
  const mountEdited = async (respond: () => Response) => {
    const sent: LayoutNode[] = [];
    const fetcher: Fetcher = async () => respond();
    const host = await mount(
      <MediaPicker
        node={await edited()}
        fetcher={fetcher}
        editable
        onChange={(next) => sent.push(next)}
      />,
    );
    await act(async () =>
      host.querySelector<HTMLElement>("[data-emvb-image-reset-original]")?.click(),
    );
    await settle();
    return { sent, text: host.textContent ?? "" };
  };

  test("a deleted original keeps the edited copy and says why", async () => {
    const view = await mountEdited(() => new Response("{}", { status: 404 }));
    expect(view.sent).toEqual([]);
    expect(view.text).toContain("The original picture was deleted from the media library");
  });

  test("a failed lookup is an error, not a reset to a guessed URL", async () => {
    const view = await mountEdited(() =>
      Response.json({ error: { message: "Server down" } }, { status: 500 }),
    );
    expect(view.sent).toEqual([]);
    expect(view.text).toContain("Couldn't reach the media library to find the original.");
  });
});
