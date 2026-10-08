import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { cleanup, mount, settle } from "../../../../test/dom/mount.ts";
import type { Fetcher } from "../../api.ts";
import type { UploadedIconItem } from "../../icon-uploads-api.ts";
import { IconLibraryDialog } from "./IconLibraryDialog.tsx";
import { locateIcon, uploadedIcons, type LibraryIcon } from "./library.ts";

afterEach(cleanup);

// W-239: My uploads in the icon library: list uploaded SVGs, Upload SVG adds one.

async function until<T>(read: () => T | null | undefined | false, what: string): Promise<T> {
  for (let i = 0; i < 300; i += 1) {
    const value = read();
    if (value) return value;
    // oxlint-disable-next-line no-await-in-loop -- polling: each check waits for the last render
    await settle();
  }
  throw new Error(`timed out waiting for ${what}`);
}

const dialog = () => document.querySelector<HTMLElement>('[data-emvb-dialog="icon-library"]');
const shown = () =>
  [...(dialog()?.querySelectorAll('[role="option"]') ?? [])].map((el) =>
    el.getAttribute("data-emvb-icon-id"),
  );
const note = () => dialog()?.querySelector("[data-emvb-icon-upload-note]");

const logo: UploadedIconItem = {
  id: "aaaa000011112222",
  name: "Brand logo",
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10" fill="#e11d48"></path></svg>',
  uploadedAt: "2026-10-08T10:00:00.000Z",
};

function stubFetcher(opts: { items?: UploadedIconItem[]; upload?: Response; list?: Response }) {
  const calls: { path: string; method: string; body?: unknown }[] = [];
  const fetcher: Fetcher = async (path, init) => {
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ path, method, body });
    if (path.endsWith("/icons/upload")) {
      return (
        opts.upload?.clone() ??
        Response.json({
          data: {
            item: {
              id: "bbbb000011112222",
              name: "rocket",
              svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1h2"></path></svg>',
              uploadedAt: "2026-10-08T11:00:00.000Z",
            },
            imagesLeftOut: 1,
          },
        })
      );
    }
    if (path.endsWith("/icons"))
      return opts.list?.clone() ?? Response.json({ data: { items: opts.items ?? [] } });
    return Response.json({}, { status: 404 });
  };
  return { fetcher, calls };
}

async function open(fetcher: Fetcher | undefined, currentId?: string) {
  const inserted: LibraryIcon[] = [];
  await mount(
    <IconLibraryDialog
      open
      onOpenChange={() => undefined}
      currentId={currentId}
      fetcher={fetcher}
      onInsert={(icon) => inserted.push(icon)}
    />,
  );
  return inserted;
}

const goUploads = async () => {
  const button = await until(
    () => dialog()?.querySelector<HTMLButtonElement>('[data-emvb-icon-category="uploads"]'),
    "My uploads",
  );
  await act(async () => button.click());
};

async function pickFile(file: File) {
  const input = await until(
    () => dialog()?.querySelector<HTMLInputElement>("[data-emvb-icon-upload-input]"),
    "the file input",
  );
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

describe("My uploads (W-239)", () => {
  test("without a fetcher there is no My uploads; with one it's last in the sidebar", async () => {
    await open(undefined);
    expect(dialog()?.querySelector('[data-emvb-icon-category="uploads"]')).toBeNull();
    await cleanup();
    const { fetcher } = stubFetcher({ items: [logo] });
    await open(fetcher);
    const cats = [...(dialog()?.querySelectorAll("[data-emvb-icon-category]") ?? [])];
    expect(cats.at(-1)?.getAttribute("data-emvb-icon-category")).toBe("uploads");
    expect(cats.at(-1)?.textContent).toContain("My uploads");
  });

  test("lists earlier uploads; Insert hands back upload:<id> with the stored SVG", async () => {
    const { fetcher, calls } = stubFetcher({ items: [logo] });
    const inserted = await open(fetcher);
    expect(calls).toEqual([]); // nothing fetched until My uploads is opened
    await goUploads();
    await until(() => shown().length === 1, "the upload tile");
    expect(shown()).toEqual(["upload:aaaa000011112222"]);
    expect(calls[0]?.path).toBe("/_emdash/api/plugins/emvb/icons");
    const tile = dialog()?.querySelector<HTMLElement>('[role="option"]');
    expect(tile?.getAttribute("aria-label")).toBe("Brand logo, My uploads");
    await act(async () => tile?.click());
    await act(async () =>
      dialog()?.querySelector<HTMLButtonElement>("[data-emvb-icon-insert]")?.click(),
    );
    expect(inserted[0]?.id).toBe("upload:aaaa000011112222");
    expect(inserted[0]?.markup).toBe(logo.svg);
    expect(inserted[0]?.label).toBe("Brand logo");
  });

  test("Upload SVG posts the file, selects the new icon and says what was left out", async () => {
    const { fetcher, calls } = stubFetcher({ items: [logo] });
    await open(fetcher);
    await goUploads();
    await until(() => shown().length === 1, "the upload tile");
    await pickFile(
      new File(['<svg viewBox="0 0 24 24"><path d="M1 1h2"/></svg>'], "rocket.svg", {
        type: "image/svg+xml",
      }),
    );
    await until(() => shown().length === 2, "the new tile");
    const post = calls.find((call) => call.method === "POST");
    expect(post?.path).toBe("/_emdash/api/plugins/emvb/icons/upload");
    expect(post?.body).toEqual({
      name: "rocket.svg",
      svg: '<svg viewBox="0 0 24 24"><path d="M1 1h2"/></svg>',
    });
    expect(shown()).toEqual(["upload:bbbb000011112222", "upload:aaaa000011112222"]);
    expect(
      dialog()?.querySelector("[data-emvb-icon-picked]")?.getAttribute("data-emvb-icon-picked"),
    ).toBe("upload:bbbb000011112222");
    expect(note()?.getAttribute("data-emvb-icon-upload-note")).toBe("ok");
    expect(note()?.textContent).toBe(
      "Uploaded rocket. Insert adds it to the page. 1 outside image was left out.",
    );
  });

  test("a hostile file is refused in the browser with the reason, without a request", async () => {
    const { fetcher, calls } = stubFetcher({});
    await open(fetcher);
    await goUploads();
    await until(() => dialog()?.textContent?.includes("No uploads yet."), "the empty state");
    await pickFile(
      new File(['<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>'], "evil.svg", {
        type: "image/svg+xml",
      }),
    );
    await until(() => note()?.getAttribute("data-emvb-icon-upload-note") === "error", "an error");
    expect(note()?.textContent).toBe(
      "This SVG contains scripts, event handlers or embedded HTML, so EmVB won't use it.",
    );
    expect(note()?.getAttribute("role")).toBe("alert");
    expect(calls.some((call) => call.method === "POST")).toBe(false);
    await pickFile(new File(["x"], "photo.png", { type: "image/png" }));
    await until(() => note()?.textContent === "Choose an .svg file.", "the type error");
  });

  test("a server refusal is shown as the server worded it", async () => {
    const { fetcher } = stubFetcher({
      upload: Response.json(
        { error: { code: "INVALID_SVG", message: "Server says no." } },
        { status: 422 },
      ),
    });
    await open(fetcher);
    await goUploads();
    await pickFile(
      new File(['<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>'], "a.svg", {
        type: "image/svg+xml",
      }),
    );
    await until(() => note()?.textContent === "Server says no.", "the server message");
  });

  test("an Icon showing an upload reopens on My uploads with it picked", async () => {
    const { fetcher } = stubFetcher({ items: [logo] });
    await open(fetcher, "upload:aaaa000011112222");
    await until(() => shown().length === 1, "the upload tile");
    expect(
      dialog()?.querySelector('[data-emvb-icon-category="uploads"]')?.getAttribute("aria-current"),
    ).toBe("true");
    expect(
      dialog()?.querySelector("[data-emvb-icon-picked]")?.getAttribute("data-emvb-icon-picked"),
    ).toBe("upload:aaaa000011112222");
  });

  test("a list that fails to load says so and can be retried", async () => {
    let fail = true;
    const { fetcher: ok } = stubFetcher({ items: [logo] });
    const fetcher: Fetcher = async (path, init) =>
      fail
        ? Response.json({ error: { code: "X", message: "Offline" } }, { status: 503 })
        : ok(path, init);
    await open(fetcher);
    await goUploads();
    await until(
      () => dialog()?.textContent?.includes("Your uploads didn't load: Offline"),
      "error",
    );
    fail = false;
    const retry = [...(dialog()?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Try again",
    );
    await act(async () => retry?.click());
    await until(() => shown().length === 1, "the upload tile after retry");
  });
});

describe("upload ids and tiles (W-239)", () => {
  test("upload:<id> locates in My uploads", () => {
    expect(locateIcon("upload:abc")).toEqual({
      set: "uploads",
      style: "uploads",
      id: "upload:abc",
    });
  });

  test("tiles are sanitized again; one that fails is left out", () => {
    const icons = uploadedIcons([
      logo,
      { ...logo, id: "bad", svg: '<svg viewBox="0 0 1 1" onload="x()"><path d="M0"/></svg>' },
    ]);
    expect(icons.map((icon) => icon.id)).toEqual(["upload:aaaa000011112222"]);
  });
});
