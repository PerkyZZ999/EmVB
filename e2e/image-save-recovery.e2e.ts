import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { createPage, setUpEmvbOnce } from "./support/api.ts";
import { openEditor, openLayers, overlay, unique } from "./support/helpers.ts";

setUpEmvbOnce();
test.use({ viewport: { width: 1440, height: 900 } });

async function openPhotoEditor(page: Page, request: APIRequestContext, title: string) {
  const upload = await request.post("/_emdash/api/media", {
    headers: { "X-EmDash-Request": "1" },
    multipart: {
      file: {
        name: "garden.jpg",
        mimeType: "image/jpeg",
        buffer: readFileSync("e2e/fixtures/photo-gps.jpg"),
      },
      width: "640",
      height: "480",
    },
  });
  expect(upload.status()).toBeLessThan(300);
  const media = ((await upload.json()) as { data: { item: { id: string; url: string } } }).data
    .item;
  const id = await createPage(
    request,
    title,
    {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "image001",
            type: "image",
            props: { src: media.url, mediaId: media.id, alt: "Image", width: 640, height: 480 },
          },
        ],
      },
    },
    `export-${unique()}`,
  );
  await openEditor(page, id);
  await openLayers(page);
  await overlay(page).locator(".emvb-layer-select", { hasText: "Image" }).click();
  await overlay(page).locator("[data-emvb-image-edit]").click();
  await expect(page.locator("[data-emvb-image-editor]")).toHaveAttribute(
    "data-emvb-image-editor",
    "ready",
    { timeout: 30_000 },
  );
}

// W-751: the first image-editor open after a dev-server start compiles its lazy chunks, which can
// take longer than the 30 s readiness limit the tests assert. Open it once before them, untimed
// by any test, so every test measures a warm editor.
// W-855: on a cold dev server that first open can also make Vite optimize a new dependency and
// reload the page, which closes the editor before it is ready (seen in the trace as a second
// "[vite] connected"). The warm-up opens it again, up to three tries of 150 s each. Only this
// untimed warm-up changed; the tests' own limits and assertions are the same.
const WARM_UP_TRIES = 3;
test.beforeAll(async ({ browser }, info) => {
  test.setTimeout(WARM_UP_TRIES * 160_000);
  const { baseURL, storageState } = info.project.use;
  const context = await browser.newContext({ baseURL, storageState });
  try {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    const id = await warmPage(context.request);
    for (let attempt = 1; ; attempt++) {
      try {
        await openEditor(page, id);
        await openLayers(page);
        await overlay(page).locator(".emvb-layer-select", { hasText: "Image" }).click();
        await overlay(page).locator("[data-emvb-image-edit]").click();
        await page
          .locator('[data-emvb-image-editor="ready"]')
          .waitFor({ state: "visible", timeout: 150_000 });
        return;
      } catch (error) {
        if (attempt >= WARM_UP_TRIES) throw error;
      }
    }
  } finally {
    await context.close();
  }
});

async function warmPage(request: APIRequestContext) {
  const upload = await request.post("/_emdash/api/media", {
    headers: { "X-EmDash-Request": "1" },
    multipart: {
      file: {
        name: "warm.jpg",
        mimeType: "image/jpeg",
        buffer: readFileSync("e2e/fixtures/photo-gps.jpg"),
      },
      width: "640",
      height: "480",
    },
  });
  expect(upload.status()).toBeLessThan(300);
  const media = ((await upload.json()) as { data: { item: { id: string; url: string } } }).data
    .item;
  return createPage(
    request,
    "Image editor warm-up",
    {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "image001",
            type: "image",
            props: { src: media.url, mediaId: media.id, alt: "Image", width: 640, height: 480 },
          },
        ],
      },
    },
    `warm-${unique()}`,
  );
}

async function dialogMotion(popup: Locator) {
  return popup.evaluate((element) => {
    let backdrop: Element | undefined;
    for (
      let portal = element.closest("[data-base-ui-portal]");
      portal;
      portal = portal.parentElement?.closest("[data-base-ui-portal]") ?? null
    ) {
      backdrop = [...portal.children].find((child) => child.classList.contains("bg-kumo-recessed"));
      if (backdrop) break;
    }
    return {
      popup: getComputedStyle(element).transitionDuration,
      backdrop: backdrop ? getComputedStyle(backdrop).transitionDuration : "missing backdrop",
    };
  });
}

async function closeWithoutMotion(page: Page, popup: Locator) {
  const revived = popup.evaluate(
    (element) =>
      new Promise<string[]>((resolve) => {
        const failures: string[] = [];
        let backdrop: Element | undefined;
        for (
          let portal = element.closest("[data-base-ui-portal]");
          portal;
          portal = portal.parentElement?.closest("[data-base-ui-portal]") ?? null
        ) {
          backdrop = [...portal.children].find((child) =>
            child.classList.contains("bg-kumo-recessed"),
          );
          if (backdrop) break;
        }
        const observer = new MutationObserver(() => {
          if (!element.isConnected) {
            observer.disconnect();
            resolve(failures);
          } else if (element.hasAttribute("data-ending-style")) {
            for (const node of [element, backdrop]) {
              if (!node) continue;
              const duration = getComputedStyle(node).transitionDuration;
              if (duration !== "0s") failures.push(duration);
            }
          }
        });
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["data-ending-style"],
        });
        element.setAttribute("data-motion-observing", "true");
      }),
  );
  await expect(popup).toHaveAttribute("data-motion-observing", "true");
  await page.keyboard.press("Escape");
  expect(await revived).toEqual([]);
}

for (const preference of ["no-preference", "reduce"] as const) {
  test(`W-731: image export honors ${preference} motion through repeated opening and closing`, async ({
    page,
    request,
  }) => {
    await page.emulateMedia({ reducedMotion: preference });
    await openPhotoEditor(page, request, "Export motion");
    const editor = page.getByRole("dialog", { name: "Edit image", exact: true });
    expect(await dialogMotion(editor)).toEqual({
      popup: preference === "reduce" ? "0s" : "0.15s",
      backdrop: preference === "reduce" ? "0s" : "0.15s",
    });
    const save = page.locator("[data-emvb-image-save]");
    const canvas = page.locator("iframe[data-emvb-canvas]");
    const geometry = await canvas.evaluate((element) => element.getBoundingClientRect().toJSON());
    for (let round = 0; round < 2; round++) {
      await save.click();
      const popup = page.getByRole("dialog", { name: "Export image", exact: true });
      await expect(popup).toBeVisible();
      expect(await dialogMotion(popup)).toEqual({
        popup: preference === "reduce" ? "0s" : "0.15s",
        backdrop: preference === "reduce" ? "0s" : "0.15s",
      });
      const width = popup.getByRole("spinbutton", { name: "Width in pixels" });
      await expect(width).toHaveValue("640");
      await width.fill("320");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect.poll(() => dialogMotion(popup)).toEqual({ popup: "0s", backdrop: "0s" });
      await expect(width).toHaveValue("320");
      await page.screenshot({
        animations: "disabled",
        path: `/tmp/emvb-image-export-motion-${test.info().project.name}-${preference}-${round}.png`,
      });
      await closeWithoutMotion(page, popup);
      await expect(save).toBeFocused();
      await expect(page.locator("[data-emvb-image-editor]")).toHaveAttribute(
        "data-emvb-image-editor",
        "ready",
      );
      await page.emulateMedia({ reducedMotion: preference });
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await closeWithoutMotion(page, editor);
    await expect(overlay(page).locator("[data-emvb-image-edit]")).toBeFocused();
    expect(await canvas.evaluate((element) => element.getBoundingClientRect().toJSON())).toEqual(
      geometry,
    );
  });
}

test("W-716: Escape keeps an image save open so a failed upload can be retried", async ({
  page,
  request,
}) => {
  await openPhotoEditor(page, request, "Export recovery");
  await page.locator("[data-emvb-image-save]").click();
  const form = page.locator("[data-emvb-image-export]");
  const release = Promise.withResolvers<void>();
  let attempts = 0;
  await page.route("**/_emdash/api/media", async (route) => {
    if (route.request().method() === "POST" && ++attempts === 1) {
      await release.promise;
      await route.fulfill({
        status: 503,
        json: { error: { message: "Temporary upload failure" } },
      });
    } else await route.continue();
  });
  try {
    await form.locator("[data-emvb-image-export-save]").click();
    await expect.poll(() => attempts).toBe(1);
    await expect(form.getByRole("button", { name: "Close", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(form).toBeVisible();
    release.resolve();
    await expect(form.getByRole("alert")).toContainText("Temporary upload failure");
    await expect(form.getByRole("button", { name: "Close", exact: true })).toBeEnabled();
    await form.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.locator("[data-emvb-image-editor]")).toHaveCount(0);
    expect(attempts).toBe(2);
    await expect(overlay(page).locator("[data-emvb-image-edited]")).toBeVisible();
  } finally {
    release.resolve();
  }
});

test("W-717: portrait export dimensions honor both side limits without rendering a large image", async ({
  page,
  request,
}) => {
  await openPhotoEditor(page, request, "Export dimensions");
  await page.locator('[data-emvb-image-tool="compose"]').click();
  await page.locator('[data-emvb-image-rotate="right"]').click();
  await expect(page.locator("[data-emvb-image-editor-file]")).toContainText("480 × 640 px");
  await page.locator("[data-emvb-image-save]").click();
  const form = page.locator("[data-emvb-image-export]");
  const width = form.getByRole("spinbutton", { name: "Width in pixels" });
  const height = form.getByRole("spinbutton", { name: "Height in pixels" });
  await expect(width).toHaveAttribute("max", "12288");
  await expect(height).toHaveAttribute("max", "16384");
  await width.fill("16384");
  await expect(width).toHaveValue("12288");
  await expect(height).toHaveValue("16384");
  await form.locator("[data-emvb-image-export-full]").click();
  await expect(width).toHaveValue("480");
  await expect(height).toHaveValue("640");
  await height.fill("16384");
  await expect(width).toHaveValue("12288");
  await expect(height).toHaveValue("16384");
  await form.getByRole("button", { name: "Close", exact: true }).click();
  await expect(form).toHaveCount(0);
});

test("W-718: an unsupported copy size gives a correction hint before upload and recovers at Full size", async ({
  page,
  request,
}) => {
  await openPhotoEditor(page, request, "Export validation");
  await page.locator("[data-emvb-image-save]").click();
  const form = page.locator("[data-emvb-image-export]");
  let uploads = 0;
  page.on("request", (sent) => {
    if (sent.method() === "POST" && new URL(sent.url()).pathname === "/_emdash/api/media")
      uploads++;
  });
  await form.getByRole("spinbutton", { name: "Width in pixels" }).fill("10001");
  await form.locator("[data-emvb-image-export-save]").click();
  await expect(form.getByRole("alert")).toContainText("between 16 and 10000 px");
  await expect(form.getByRole("alert")).toContainText("Full size");
  await expect(form.getByRole("button", { name: "Close", exact: true })).toBeEnabled();
  expect(uploads).toBe(0);
  await form.locator("[data-emvb-image-export-full]").click();
  await form.locator("[data-emvb-image-export-save]").click();
  await expect(page.locator("[data-emvb-image-editor]")).toHaveCount(0);
  await expect(overlay(page).locator("[data-emvb-image-edited]")).toBeVisible();
  expect(uploads).toBe(1);
});

test("W-742: compact image sheet animates only its entrance and keeps layout and drag immediate", async ({
  page,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openPhotoEditor(page, request, "Compact sheet motion");
  const popup = page.getByRole("dialog", { name: "Edit image", exact: true });
  const frame = overlay(page).locator("iframe[data-emvb-canvas]");
  const frameGeometry = await frame.evaluate((element) => element.getBoundingClientRect().toJSON());
  // The image editor chooses compact layout from its own container, independently of its host.
  await popup.evaluate((element) => {
    element.style.width = "390px";
    element.style.height = "844px";
  });
  const editor = page.locator("[data-emvb-image-editor]");
  await expect(editor).toHaveAttribute("data-layout", "compact");
  const sheet = editor.locator("[data-emvb-image-sheet]");
  const photo = editor.locator(".emvb-ie-compact-canvas");
  const tool = editor.locator('.emvb-ie-compact > nav [data-emvb-image-tool="compose"]');
  const motion = () =>
    editor.evaluate((element) => {
      const sheetStyle = getComputedStyle(element.querySelector(".emvb-ie-sheet") as Element);
      const photoStyle = getComputedStyle(
        element.querySelector(".emvb-ie-compact-canvas") as Element,
      );
      return {
        sheetProperty: sheetStyle.transitionProperty,
        sheetDuration: sheetStyle.transitionDuration,
        photoDuration: photoStyle.transitionDuration,
      };
    });
  await expect(sheet).toHaveAttribute("data-emvb-image-sheet", "closed");
  expect(await motion()).toEqual({
    sheetProperty: "transform",
    sheetDuration: "0.2s",
    photoDuration: "0s",
  });
  await tool.click();
  await expect(sheet).toHaveAttribute("data-emvb-image-sheet", "open");
  await sheet.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  const padding = await photo.evaluate((element) => ({
    current: parseFloat(getComputedStyle(element).paddingBottom),
    target: parseFloat((element as HTMLElement).style.paddingBottom),
  }));
  expect(padding.current).toBeCloseTo(padding.target, 1);
  const grip = sheet.getByRole("separator", { name: "Resize panel", exact: true });
  const box = await grip.boundingBox();
  if (!box) throw new Error("Compact sheet grip has no geometry");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 250, { steps: 4 });
    await expect(sheet).toHaveAttribute("data-dragging", "");
    await expect(sheet).toHaveCSS("transition-duration", "0s");
    const dragSize = await sheet.evaluate((element) => ({
      current: element.getBoundingClientRect().height,
      target:
        (parseFloat((element as HTMLElement).style.height) / 100) *
        (element.parentElement?.clientHeight ?? 0),
    }));
    expect(dragSize.current).toBeCloseTo(dragSize.target, 1);
  } finally {
    await page.mouse.up();
  }
  await expect(sheet).not.toHaveAttribute("data-dragging", "");
  const snapped = await sheet.evaluate((element) => ({
    percent: (element as HTMLElement).style.height,
    current: element.getBoundingClientRect().height,
    target: (element.parentElement?.clientHeight ?? 0) * 0.9,
    animations: element.getAnimations().length,
  }));
  expect(snapped.percent).toBe("90%");
  expect(snapped.current).toBeCloseTo(snapped.target, 1);
  expect(snapped.animations).toBe(0);
  await popup.screenshot({
    path: `/tmp/emvb-compact-sheet-${test.info().project.name}-normal.png`,
  });
  await sheet.getByRole("button", { name: "Close panel", exact: true }).click();
  await expect(sheet).toHaveAttribute("data-emvb-image-sheet", "closed");
  expect(await sheet.evaluate((element) => (element as HTMLElement).inert)).toBe(true);
  await expect(tool).toBeFocused();
  for (const state of ["open", "closed", "open"]) {
    await page.keyboard.press("Enter");
    await expect(sheet).toHaveAttribute("data-emvb-image-sheet", state);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(motion)
    .toEqual({ sheetProperty: "none", sheetDuration: "0s", photoDuration: "0s" });
  await expect(sheet).toHaveCSS("transform", "none");
  await page.keyboard.press("Enter");
  await expect(sheet).toHaveAttribute("aria-hidden", "true");
  await page.keyboard.press("Enter");
  await expect(sheet).toHaveAttribute("aria-hidden", "false");
  await expect(tool).toBeFocused();
  await expect(editor).toHaveAttribute("data-emvb-image-tool-active", "compose");
  await popup.screenshot({
    path: `/tmp/emvb-compact-sheet-${test.info().project.name}-reduce.png`,
  });
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(overlay(page).locator("[data-emvb-image-edit]")).toBeFocused();
  expect(await frame.evaluate((element) => element.getBoundingClientRect().toJSON())).toEqual(
    frameGeometry,
  );
});

test("W-743: compact sheet Close returns keyboard focus to the current outer tool", async ({
  page,
  request,
}) => {
  await openPhotoEditor(page, request, "Compact sheet focus");
  const popup = page.getByRole("dialog", { name: "Edit image", exact: true });
  const frame = overlay(page).locator("iframe[data-emvb-canvas]");
  const frameGeometry = await frame.evaluate((element) => element.getBoundingClientRect().toJSON());
  await popup.evaluate((element) => {
    element.style.width = "390px";
    element.style.height = "844px";
  });
  const editor = page.locator("[data-emvb-image-editor]");
  await expect(editor).toHaveAttribute("data-layout", "compact");
  const sheet = editor.locator("[data-emvb-image-sheet]");
  const outerTool = (tool: string) =>
    editor.locator(`.emvb-ie-compact > nav [data-emvb-image-tool="${tool}"]`);
  for (const preference of ["no-preference", "reduce"] as const) {
    await page.emulateMedia({ reducedMotion: preference });
    for (const current of ["compose", "metadata"]) {
      await outerTool("compose").click();
      await expect(sheet).toHaveAttribute("data-emvb-image-sheet", "open");
      if (current !== "compose") {
        await sheet.locator(`[data-emvb-image-tool="${current}"]`).click();
      }
      await expect(editor).toHaveAttribute("data-emvb-image-tool-active", current);
      const close = sheet.getByRole("button", { name: "Close panel", exact: true });
      await close.focus();
      await page.keyboard.press("Enter");
      await expect(sheet).toHaveAttribute("data-emvb-image-sheet", "closed");
      expect(await sheet.evaluate((element) => (element as HTMLElement).inert)).toBe(true);
      await expect(outerTool(current)).toBeFocused();
      await expect(outerTool(current)).toHaveAttribute("aria-pressed", "true");
      await page.keyboard.press("Enter");
      await expect(sheet).toHaveAttribute("data-emvb-image-sheet", "open");
      await expect(editor).toHaveAttribute("data-emvb-image-tool-active", current);
      await page.keyboard.press("Enter");
      await expect(sheet).toHaveAttribute("data-emvb-image-sheet", "closed");
      await expect(outerTool(current)).toBeFocused();
    }
  }
  await popup.screenshot({
    path: `/tmp/emvb-compact-focus-${test.info().project.name}.png`,
  });
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(overlay(page).locator("[data-emvb-image-edit]")).toBeFocused();
  expect(await frame.evaluate((element) => element.getBoundingClientRect().toJSON())).toEqual(
    frameGeometry,
  );
});

test("W-744: compact sheet grip resizes by keyboard and a drag dismiss returns focus", async ({
  page,
  request,
}) => {
  await openPhotoEditor(page, request, "Compact sheet grip");
  const popup = page.getByRole("dialog", { name: "Edit image", exact: true });
  await popup.evaluate((element) => {
    element.style.width = "390px";
    element.style.height = "844px";
  });
  const editor = page.locator("[data-emvb-image-editor]");
  await expect(editor).toHaveAttribute("data-layout", "compact");
  const sheet = editor.locator("[data-emvb-image-sheet]");
  const tool = editor.locator('.emvb-ie-compact > nav [data-emvb-image-tool="compose"]');
  const grip = sheet.getByRole("separator", { name: "Resize panel", exact: true });
  await tool.click();
  await expect(sheet).toHaveAttribute("data-emvb-image-sheet", "open");
  await grip.focus();
  await expect(grip).toHaveAttribute("aria-valuetext", "Peek");
  await page.keyboard.press("ArrowUp");
  await expect(sheet).toHaveAttribute("style", /height: 90%/);
  await expect(grip).toHaveAttribute("aria-valuetext", "Expanded");
  await expect(grip).toBeFocused();
  await popup.screenshot({ path: `/tmp/emvb-grip-${test.info().project.name}-expanded.png` });
  await page.keyboard.press("ArrowDown");
  await expect(sheet).toHaveAttribute("style", /height: 42%/);
  await page.keyboard.press("ArrowDown");
  await expect(sheet).toHaveAttribute("data-emvb-image-sheet", "closed");
  await expect(tool).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sheet).toHaveAttribute("data-emvb-image-sheet", "open");
  const box = await grip.boundingBox();
  if (!box) throw new Error("Compact sheet grip has no geometry");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 320, { steps: 4 });
  await page.mouse.up();
  await expect(sheet).toHaveAttribute("data-emvb-image-sheet", "closed");
  await expect(tool).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
});
