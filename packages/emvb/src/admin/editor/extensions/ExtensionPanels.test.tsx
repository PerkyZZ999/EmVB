import { afterEach, describe, expect, test } from "bun:test";
import type { ExtensionManifest } from "../../../core/index.ts";
import { cleanup, mount } from "../../../../test/dom/mount.ts";
import { fetchExtensionSourceValues, type ExtensionSourceValues } from "../../extension-outputs.ts";
import { ExtensionsProvider } from "../extensions-context.tsx";
import { ExtensionPanels } from "./ExtensionPanels.tsx";

// W-1088 (#36): a panel that names a source lists the source's values read-only.

afterEach(cleanup);

const manifest = {
  extensionApi: 1,
  id: "emvb-ext-office",
  label: "Office",
  elements: [],
  panels: [
    { id: "ext:emvb-ext-office/about", name: "about", label: "About", source: "office" },
    { id: "ext:emvb-ext-office/plain", name: "plain", label: "Plain" },
  ],
  sources: [
    { id: "ext:emvb-ext-office/office", name: "office", label: "Office", capabilities: ["text"] },
  ],
} as ExtensionManifest;

const show = (sourceValues: ExtensionSourceValues | undefined) =>
  mount(
    <ExtensionsProvider extensions={[manifest]} sourceValues={sourceValues}>
      <ExtensionPanels />
    </ExtensionsProvider>,
  );

describe("extension panels list their source's values (W-1088, #36)", () => {
  test("labels and values, as plain text", async () => {
    await show(
      new Map([
        ["ext:emvb-ext-office/office", { city: "Montréal", html: "<img src=x onerror=alert(1)>" }],
      ]),
    );
    const list = document.querySelector('[data-emvb-ext-panel="ext:emvb-ext-office/about"] dl');
    expect(list?.getAttribute("aria-label")).toBe("Office values");
    expect([...(list?.querySelectorAll("dt") ?? [])].map((el) => el.textContent)).toEqual([
      "city",
      "html",
    ]);
    expect([...(list?.querySelectorAll("dd") ?? [])].map((el) => el.textContent)).toEqual([
      "Montréal",
      "<img src=x onerror=alert(1)>",
    ]);
    expect(document.querySelector("img")).toBeNull();
    // A panel without a source lists nothing.
    expect(
      document.querySelector('[data-emvb-ext-panel="ext:emvb-ext-office/plain"] dl'),
    ).toBeNull();
  });

  test("loading, unreadable and empty sources say so", async () => {
    await show(undefined);
    expect(document.body.textContent).toContain("Loading values…");
    await show(new Map([["ext:emvb-ext-office/office", null]]));
    expect(document.body.textContent).toContain("couldn't be read on this server");
    await show(new Map());
    expect(document.body.textContent).toContain("couldn't be read on this server");
    await show(new Map([["ext:emvb-ext-office/office", {}]]));
    expect(document.body.textContent).toContain("This source has no values.");
  });

  test("the admin keeps only string values from the server's answer", async () => {
    const paths: string[] = [];
    const fetcher = (async (path: string) => {
      paths.push(path);
      return new Response(
        JSON.stringify({
          data: {
            sources: [
              { id: "ext:a/s", values: { ok: "yes", n: 3, o: { x: 1 } } },
              { id: "ext:a/t", values: null },
              { id: 7, values: {} },
            ],
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    }) as never;
    const got = await fetchExtensionSourceValues(fetcher);
    expect(paths).toEqual(["/_emdash/api/plugins/emvb/editor/extensions/sources"]);
    expect([...got]).toEqual([
      ["ext:a/s", { ok: "yes" }],
      ["ext:a/t", null],
    ]);
    const failing = (async () => new Response("nope", { status: 500 })) as never;
    expect((await fetchExtensionSourceValues(failing)).size).toBe(0);
  });
});
