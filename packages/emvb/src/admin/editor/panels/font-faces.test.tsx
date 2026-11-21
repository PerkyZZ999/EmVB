import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { cleanup, mount, settle } from "../../../../test/dom/mount.ts";
import { fakeWoff2 } from "../../../core/fonts/test-font.ts";
import type { FontVariable } from "../../../core/index.ts";
import { FontFaces, stackWithFamily } from "./FontFaces.tsx";

// W-1072: a font variable's own files, uploaded or downloaded from Google by the server.

let host: HTMLElement;
let saved: FontVariable[] = [];
let calls: { path: string; body: Record<string, unknown> }[] = [];
afterEach(async () => {
  await cleanup();
  saved = [];
  calls = [];
});

const URL_A = "/_emdash/api/plugins/emvb/font?id=aaaaaaaaaaaaaaaa";

const fetcher = async (path: string, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
  calls.push({ path, body });
  if (path.endsWith("/fonts/upload")) {
    return Response.json({ data: { file: { id: "a", url: URL_A, duplicate: false } } });
  }
  if (path.endsWith("/fonts/google")) {
    const face = {
      weight: body["weight"],
      style: body["style"],
      src: `/_emdash/api/plugins/emvb/font?id=${String(body["weight"]).padStart(16, "0")}`,
      unicodeRange: "U+0000-00FF",
    };
    return Response.json({ data: { family: body["family"], faces: [face] } });
  }
  return new Response("{}", { status: 404 });
};

const plain: FontVariable = { id: "body", name: "Body", value: "Inter, sans-serif" };

async function render(font: FontVariable = plain) {
  host = await mount(
    <FontFaces
      font={font}
      fetcher={fetcher}
      onSave={async (next) => {
        saved.push(next);
      }}
    />,
  );
}

const button = (text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text);

async function setInput(selector: string, value: string) {
  const field = host.querySelector<HTMLInputElement>(`${selector} input, input${selector}`);
  expect(field?.tagName ?? null).toBe("INPUT");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, value);
    field?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("custom font files in Site styles (W-1072)", () => {
  test("uploading a WOFF2 names the family first in the stack and adds the face", async () => {
    await render();
    await setInput("[data-emvb-font-family-input]", "Brand Sans");
    const input = host.querySelector<HTMLInputElement>("[data-emvb-font-upload]");
    const file = new File([new Uint8Array(fakeWoff2(256))], "Brand.woff2", { type: "font/woff2" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => input?.dispatchEvent(new Event("change", { bubbles: true })));
    await settle();
    expect(calls.map((c) => c.path)).toEqual(["/_emdash/api/plugins/emvb/fonts/upload"]);
    expect(typeof calls[0]?.body["data"]).toBe("string");
    expect(saved).toEqual([
      {
        id: "body",
        name: "Body",
        value: "'Brand Sans', Inter, sans-serif",
        family: "Brand Sans",
        faces: [{ weight: 400, style: "normal", src: URL_A }],
        source: "upload",
      },
    ]);
  });

  test("a file that isn't WOFF2 is refused in the browser with the reason", async () => {
    await render();
    const input = host.querySelector<HTMLInputElement>("[data-emvb-font-upload]");
    const file = new File(["not a font".padEnd(80)], "font.woff2");
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => input?.dispatchEvent(new Event("change", { bubbles: true })));
    await settle();
    expect(calls).toEqual([]);
    expect(saved).toEqual([]);
    expect(host.querySelector("[role=alert]")?.textContent).toContain("isn't a WOFF2");
  });

  test("a Google font is downloaded one weight and style at a time and saved as one family", async () => {
    await render();
    await setInput("[data-emvb-font-google]", "  Open   Sans ");
    await act(async () => button("Download from Google Fonts")?.click());
    await settle();
    expect(calls.map((c) => [c.body["weight"], c.body["style"], c.body["subsets"]])).toEqual([
      [400, "normal", ["latin", "latin-ext"]],
      [700, "normal", ["latin", "latin-ext"]],
    ]);
    const last = saved.at(-1);
    expect(last?.family).toBe("Open Sans");
    expect(last?.source).toBe("google");
    expect(last?.value).toBe("'Open Sans', Inter, sans-serif");
    expect(last?.faces?.map((f) => `${f.weight}/${f.style}`)).toEqual(["400/normal", "700/normal"]);
    expect(host.querySelector("[data-emvb-font-status]")?.textContent).toContain("from this site");
  });

  test("removing the last face leaves a plain font stack", async () => {
    await render({
      ...plain,
      family: "Brand Sans",
      faces: [{ weight: 400, style: "normal", src: URL_A }],
      source: "upload",
    });
    expect(host.querySelector("style")?.textContent).toContain('font-family:"Brand Sans"');
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Remove Regular 400"]')?.click(),
    );
    expect(saved).toEqual([plain]);
  });

  test("the family goes first in the stack once", () => {
    expect(stackWithFamily("'Brand', serif", "Brand")).toBe("'Brand', serif");
    expect(stackWithFamily("Georgia, serif", "Brand")).toBe("'Brand', Georgia, serif");
    expect(stackWithFamily("a".repeat(195), "Brand")).toBe("'Brand', sans-serif");
  });
});
