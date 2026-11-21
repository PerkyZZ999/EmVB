import { expect, test } from "@playwright/test";
import { api, createPage, createThemePart, publishPage, setUpEmvbOnce } from "./support/api.ts";
import { loadDraft, publishStyles, saveDesign, type DesignDoc } from "./support/design.ts";
import { openEditor, openLayers, overlay, unique } from "./support/helpers.ts";
import { uploadEmvbPixel } from "./support/media.ts";

// 1.4.1 site and dynamic fixes from public issues #30, #31, #32 and #40 (W-1090).

setUpEmvbOnce();

type WithDefaults = DesignDoc & { defaults?: Record<string, Record<string, unknown>> };

test("a site-wide Button default styles a Button with a URL, a Link stays a link (W-1090, #30)", async ({
  page,
  request,
}) => {
  const draft = await loadDraft(request);
  const before = draft.design as WithDefaults;
  const defaults = {
    ...before.defaults,
    button: { color: "#ffffff", backgroundColor: "#c81e1e" },
    a: { color: "#1f4fd1" },
  };
  await saveDesign(request, { ...before, defaults } as DesignDoc, draft.revision);
  await publishStyles(request, draft.publishedRevision);
  try {
    const slug = `w1090-button-${unique()}`;
    const layout = {
      schemaVersion: 18,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "butn0001", type: "button", props: { text: "Book now", href: "/book" } },
          { id: "butn0002", type: "button", props: { text: "Plain button" } },
          { id: "link0001", type: "link", props: { text: "Read more", href: "/read" } },
        ],
      },
    };
    await publishPage(request, await createPage(request, "Button default", layout, slug));
    await page.goto(`/${slug}`);
    const look = (name: string) =>
      page
        .getByText(name, { exact: true })
        .evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
    expect(await look("Book now")).toEqual(["rgb(255, 255, 255)", "rgb(200, 30, 30)"]);
    expect(await look("Plain button")).toEqual(["rgb(255, 255, 255)", "rgb(200, 30, 30)"]);
    expect((await look("Read more"))[0]).toBe("rgb(31, 79, 209)");
    expect((await look("Read more"))[1]).not.toBe("rgb(200, 30, 30)");
  } finally {
    const now = await loadDraft(request);
    await saveDesign(
      request,
      { ...(now.design as WithDefaults), defaults: before.defaults } as DesignDoc,
      now.revision,
    );
    await publishStyles(request, now.publishedRevision);
  }
});

test("a Loop with a collection in an Archive template says it ignores the archive's pages (W-1090, #31)", async ({
  page,
  request,
}) => {
  const title = `Archive ${unique()}`;
  const id = await createThemePart(request, {
    title,
    partType: "archive",
    slug: `w1090-archive-${unique()}`,
    layout: {
      schemaVersion: 18,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "loop0001",
            type: "loop",
            props: { collection: "posts" },
            children: [{ id: "ptit0001", type: "post-title", props: {} }],
          },
          { id: "pagi0001", type: "pagination", props: {} },
        ],
      },
    },
  });
  await openEditor(page, id, undefined, "emvb_theme_parts");
  await openLayers(page);
  const note = overlay(page).locator("[data-emvb-loop-note]");
  await overlay(page).locator(".emvb-layer-select", { hasText: /^Loop/ }).first().click();
  await expect(note).toContainText("same entries on every page of the archive");
  await overlay(page)
    .locator(".emvb-layer-select", { hasText: /^Pagination/ })
    .first()
    .click();
  await expect(note).toContainText("To page through the archive, leave its Collection empty.");
});

test("a Loop shows a post image picked in the admin, and its Image field lists the image fields (W-1090, #32)", async ({
  page,
  request,
}) => {
  const media = await uploadEmvbPixel(request);
  const storageKey = media.url.replace(/^.*\/_emdash\/api\/media\/file\//, "");
  const title = `w1090-${unique()}`;
  // What EmDash's admin stores when an editor picks an uploaded image: no src, a storage key.
  const created = await api(request, "POST", "/_emdash/api/content/posts", {
    data: {
      title,
      featured_image: {
        id: media.id,
        provider: "local",
        filename: "emvb-pixel.png",
        mimeType: "image/png",
        meta: { storageKey },
      },
    },
    slug: title,
  });
  expect(created.status).toBe(201);
  const postId = (created.json?.["data"] as { item?: { id?: string } } | undefined)?.item?.id;
  const current = await api(request, "GET", `/_emdash/api/content/posts/${postId}`);
  const body = current.json?.["data"] as Record<string, unknown> | undefined;
  const published = await api(request, "POST", `/_emdash/api/content/posts/${postId}/publish`, {
    _rev: body?.["_rev"],
  });
  expect(published.status).toBe(200);

  const slug = `w1090-image-${unique()}`;
  const layout = {
    schemaVersion: 18,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        {
          id: "loop0001",
          type: "loop",
          props: { collection: "posts", filter: `title=${title}` },
          children: [{ id: "pimg0001", type: "post-image", props: {} }],
        },
      ],
    },
  };
  const pageId = await createPage(request, "Post image", layout, slug);
  await publishPage(request, pageId);
  await page.goto(`/${slug}`);
  const image = page.locator("img.emvb-post-image");
  await expect(image).toHaveAttribute("src", `/_emdash/api/media/file/${storageKey}`);
  await expect.poll(() => image.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(1);

  await openEditor(page, pageId);
  await openLayers(page);
  await overlay(page).locator(".emvb-layer-select", { hasText: /^Loop/ }).first().click();
  const picker = overlay(page).locator('[data-emvb-image-field="list"]');
  await expect(picker.getByRole("combobox")).toContainText("Automatic (Featured Image)");
});

test("an Entire site condition says it covers pages that render EmVB theme parts (W-1090, #40)", async ({
  page,
  request,
}) => {
  const title = `Popup ${unique()}`;
  const id = await createThemePart(request, {
    title,
    partType: "popup",
    slug: `w1090-popup-${unique()}`,
  });
  await openEditor(page, id, undefined, "emvb_theme_parts");
  await page.keyboard.press("Escape");
  const hint = overlay(page).locator("[data-emvb-entire-site-hint]");
  await expect(hint).toContainText("every page that renders EmVB theme parts");
  await expect(hint.getByRole("link", { name: "Add theme parts to other routes" })).toHaveAttribute(
    "href",
    /install-in-a-host-site\.md#theme-parts-on-your-sites-other-routes$/,
  );
});
