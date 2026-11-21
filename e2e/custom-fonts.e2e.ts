import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
} from "@playwright/test";
import { api, createPage, publishPage, setUpEmvbOnce } from "./support/api.ts";
import { loadDraft, publishStyles, saveDesign } from "./support/design.ts";
import { canvas, openEditor, overlay, publishSiteStyles, unique } from "./support/helpers.ts";

// W-1072: custom fonts. A WOFF2 uploaded in Site styles is stored by EmVB, served from the site
// itself, used by the editor canvas and by public pages, which ask no other host for anything.

setUpEmvbOnce();
test.use({ viewport: { width: 1440, height: 900 } });

/** An Apache-2.0 WOFF2 from a dev dependency (Remix Icon 4.8.0, D-052), 185 KB. */
const FONT_FILE = "node_modules/remixicon/fonts/remixicon.woff2";

/** Removes this test's font variable from the draft and publishes, so it leaves no trace. */
async function removeFont(request: APIRequestContext, id: string) {
  const draft = await loadDraft(request);
  const fonts = (draft.design.variables.fonts ?? []).filter((font) => font.id !== id);
  await saveDesign(
    request,
    { ...draft.design, variables: { ...draft.design.variables, fonts } },
    draft.revision,
  );
  await publishStyles(request, draft.publishedRevision);
}

/** Whether a face of `family` has loaded in the document `el` is in (runs in the page). */
const loaded = (el: Element, family: string) =>
  [...el.ownerDocument.fonts].some(
    (face) => face.family.replace(/["']/g, "") === family && face.status === "loaded",
  );

test("an uploaded WOFF2 font shows on the canvas and on the public page, served by the site only (W-1072)", async ({
  page,
  request,
  baseURL,
}) => {
  const tag = unique()
    .replace(/[^a-z0-9]/g, "")
    .slice(-8);
  const id = `font-${tag}`;
  const family = `EmVB Test ${tag}`;
  const draft = await loadDraft(request);
  await saveDesign(
    request,
    {
      ...draft.design,
      variables: {
        ...draft.design.variables,
        fonts: [
          ...(draft.design.variables.fonts ?? []),
          { id, name: `Font ${tag}`, value: "Georgia, serif" },
        ],
      },
    },
    draft.revision,
  );
  try {
    const slug = `fonts-${unique()}`;
    const layout = {
      schemaVersion: 18,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "head0001",
            type: "heading",
            props: { text: "Custom font", level: 1 },
            style: { fontFamily: { var: id, from: "font" } },
          },
        ],
      },
    };
    const pageId = await createPage(request, "Custom font", layout, slug);
    await openEditor(page, pageId, "Custom font");
    await overlay(page).getByRole("button", { name: "Site styles", exact: true }).click();
    const row = overlay(page).locator(`[data-emvb-var-id="${id}"]`);
    await row.locator(".emvb-site-item-main").click();
    await row
      .locator("[data-emvb-font-family-input] input, input[data-emvb-font-family-input]")
      .fill(family);
    await row.locator("[data-emvb-font-upload]").setInputFiles(FONT_FILE);
    await expect(row.locator("[data-emvb-font-face-list]")).toContainText("Regular 400");
    const heading = canvas(page).getByRole("heading", { name: "Custom font" });
    await expect
      .poll(() => heading.evaluate((el) => getComputedStyle(el).fontFamily))
      .toContain(family);
    await expect.poll(() => heading.evaluate(loaded, family), { timeout: 15_000 }).toBe(true);

    await publishSiteStyles(page);
    await publishPage(request, pageId);

    const requests: string[] = [];
    page.on("request", (sent) => requests.push(sent.url()));
    const fontResponse = page.waitForResponse((response) =>
      response.url().includes("/_emdash/api/plugins/emvb/font?id="),
    );
    await page.goto(`/${slug}`);
    const served = await fontResponse;
    expect(served.status()).toBe(200);
    expect(served.headers()["content-type"]).toBe("font/woff2");
    expect(served.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
    const publicHeading = page.getByRole("heading", { name: "Custom font" });
    await expect.poll(() => publicHeading.evaluate(loaded, family), { timeout: 15_000 }).toBe(true);
    const css = await page.locator("style").allTextContents();
    expect(css.join("")).toContain("font-display:swap");
    // Zero third-party requests: everything the page loaded came from the site itself.
    const origin = new URL(baseURL ?? "http://127.0.0.1").origin;
    expect(
      requests.filter((url) => !url.startsWith(`${origin}/`) && !url.startsWith("data:")),
    ).toEqual([]);
  } finally {
    await removeFont(request, id);
  }
});

test("a font file up to the 1 MB cap round-trips through storage; anyone can load it (W-1072)", async ({
  request,
  baseURL,
}) => {
  const size = 1024 * 1024;
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = (i * 31 + size) % 251;
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x774f4632);
  view.setUint32(4, 0x00010000);
  view.setUint32(8, size);
  bytes[12] = Date.now() % 251;
  const up = await api(request, "POST", "/_emdash/api/plugins/emvb/fonts/upload", {
    name: "big.woff2",
    data: Buffer.from(bytes).toString("base64"),
  });
  expect(up.status).toBe(200);
  const url = (up.json?.["data"] as { file?: { url: string } } | undefined)?.file?.url ?? "";
  // No cookies at all: a visitor, not the signed-in admin of the project's storage state.
  const anonymous = await playwrightRequest.newContext({
    baseURL: baseURL ?? "",
    storageState: { cookies: [], origins: [] },
  });
  try {
    const response = await anonymous.get(url);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("font/woff2");
    const body = await response.body();
    expect(body.byteLength).toBe(size);
    expect(Buffer.compare(body, Buffer.from(bytes))).toBe(0);
    const refused = await anonymous.post("/_emdash/api/plugins/emvb/fonts/upload", {
      headers: { "X-EmDash-Request": "1", "content-type": "application/json" },
      data: JSON.stringify({ name: "x.woff2", data: Buffer.from(bytes).toString("base64") }),
    });
    expect(refused.status()).toBe(401);
  } finally {
    await anonymous.dispose();
  }
});
