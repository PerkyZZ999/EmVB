import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, openLayers, overlay, saveDraft, unique } from "./support/helpers.ts";
import { uploadEmvbPixel } from "./support/media.ts";

// Each 1.2 widget is added from the Add panel, set up in its settings, saved,
// and published with no EmVB script unless it opts in.

setUpEmvbOnce();

type Stored = { root: { children: { type: string; props: Record<string, unknown> }[] } };

const startPage = (title: string) => ({
  schemaVersion: 18,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "head0001", type: "heading", props: { text: title, level: 1 } }],
  },
});

/** A new page open in the editor with the page root selected and the Add tab showing. */
async function addTab(page: Page, request: APIRequestContext, title: string) {
  const slug = `widgets-${unique()}`;
  const id = await createPage(request, title, startPage(title), slug);
  await openEditor(page, id, title);
  await openLayers(page);
  await overlay(page).locator('[data-emvb-layer="root0001"] .emvb-layer-select').click();
  await overlay(page).getByRole("tab", { name: "Add" }).click();
  return { id, slug };
}

test("a Star rating is added, set to 3.5 of 4, and published as an image with its rating as text (W-1023)", async ({
  page,
  request,
}) => {
  const { id, slug } = await addTab(page, request, "Ratings");
  await overlay(page).locator('[data-emvb-add-tile="rating"]').click();
  const stars = canvas(page).locator(".emvb-rating");
  await expect(stars).toHaveAttribute("aria-label", "Rated 4.5 out of 5");

  await expect(overlay(page).locator("h2.emvb-panel-title")).toHaveText("Star rating");
  const value = overlay(page).getByLabel("Rating", { exact: true });
  await value.fill("3.5");
  await value.blur();
  const count = overlay(page).getByLabel("Stars", { exact: true });
  await count.fill("4");
  await count.blur();
  // The Rating field reads its maximum from Stars.
  await value.fill("5");
  await value.blur();
  await expect(
    overlay(page).getByText("Enter a number from 0 up to the number of stars"),
  ).toBeVisible();
  await value.fill("3.5");
  await value.blur();
  await expect(stars).toHaveAttribute("aria-label", "Rated 3.5 out of 4");
  await expect(stars.locator(".emvb-rating-star")).toHaveCount(4);

  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children[1]).toMatchObject({ type: "rating", props: { value: 3.5, max: 4 } });

  await publishPage(request, id);
  await page.goto(`/${slug}`);
  const published = page.locator(".emvb-rating");
  await expect(published).toHaveAttribute("role", "img");
  await expect(page.getByRole("img", { name: "Rated 3.5 out of 4" })).toBeVisible();
  // The half star is half as wide as a whole one.
  const fills = await published
    .locator(".emvb-rating-fill")
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
  expect(fills).toEqual([20, 20, 20, 10]);
  // Each filled part sits on its star, not after it.
  const offsets = await published.locator(".emvb-rating-star").evaluateAll((els) =>
    els.map((el) => {
      const [empty, fill] = [...el.querySelectorAll("svg")].map((svg) =>
        svg.getBoundingClientRect(),
      );
      return [
        Math.round((fill?.left ?? -99) - (empty?.left ?? 0)),
        Math.round((fill?.top ?? -99) - (empty?.top ?? 0)),
      ];
    }),
  );
  expect(offsets).toEqual([
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ]);
  expect(await page.locator("script[src*='emvb'], script[data-emvb]").count()).toBe(0);
});

test("an Alert is added as a dismissible warning; on the page its close button hides it and keeps focus (W-1025)", async ({
  page,
  request,
}) => {
  const { id, slug } = await addTab(page, request, "Alerts");
  await overlay(page).locator('[data-emvb-add-tile="alert"]').click();
  const box = canvas(page).locator(".emvb-alert");
  await expect(box).toHaveClass(/emvb-alert-info/);
  await expect(overlay(page).locator("h2.emvb-panel-title")).toHaveText("Alert");

  await overlay(page).getByLabel("Kind").click();
  await page.getByRole("option", { name: "Warning", exact: true }).click();
  await expect(box).toHaveClass(/emvb-alert-warning/);
  await overlay(page).getByRole("switch", { name: "Visitors can dismiss it" }).click();
  // In the editor the close button stays hidden: the script runs on the public page only.
  await expect(box.locator(".emvb-alert-dismiss")).toBeHidden();

  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children[1]).toMatchObject({
    type: "alert",
    props: { variant: "warning", dismissible: true },
  });

  await publishPage(request, id);
  await page.goto(`/${slug}`);
  const note = page.getByRole("note");
  await expect(note).toContainText("Something your visitors should know.");
  const close = note.getByRole("button", { name: "Dismiss" });
  await expect(close).toBeVisible();
  await close.focus();
  await page.keyboard.press("Enter");
  await expect(note).toBeHidden();
  // Focus didn't fall back to the page: it is on an element, not the body.
  expect(await page.evaluate(() => document.activeElement?.tagName ?? "")).not.toBe("BODY");
});

test("an Icon box is added, linked, set beside its text, and on the page the whole box opens its link (W-1020)", async ({
  page,
  request,
}) => {
  const { id, slug } = await addTab(page, request, "Icon boxes");
  await overlay(page).locator('[data-emvb-add-tile="icon-box"]').click();
  const box = canvas(page).locator(".emvb-icon-box");
  await expect(box.locator(".emvb-media-box-title")).toHaveText("A clear benefit");
  await expect(overlay(page).locator("h2.emvb-panel-title")).toHaveText("Icon box");

  const title = overlay(page).getByLabel("Title", { exact: true });
  await title.fill("Fast pages");
  await title.blur();
  await overlay(page).getByLabel("Position").click();
  await page.getByRole("option", { name: "Before the text", exact: true }).click();
  const link = overlay(page).getByLabel("Link", { exact: true });
  await link.fill("/");
  await link.blur();
  await expect(box).toHaveClass(/emvb-media-box-left/);
  await expect(box.locator(".emvb-media-box-title")).toHaveText("Fast pages");

  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children[1]).toMatchObject({
    type: "icon-box",
    props: { title: "Fast pages", position: "left", href: "/" },
  });

  await publishPage(request, id);
  await page.goto(`/${slug}`);
  const published = page.locator(".emvb-icon-box");
  // The icon sits before the words, and the box has one link named by its title.
  const [media, content] = await Promise.all([
    published.locator(".emvb-media-box-media").boundingBox(),
    published.locator(".emvb-media-box-content").boundingBox(),
  ]);
  expect((media?.x ?? 0) + (media?.width ?? 0)).toBeLessThanOrEqual(content?.x ?? 0);
  await expect(published.getByRole("link")).toHaveCount(1);
  await expect(published.getByRole("link", { name: "Fast pages" })).toBeVisible();
  // A click on the text, away from the title, still follows the link.
  const text = await published.locator(".emvb-media-box-text").boundingBox();
  await page.mouse.click((text?.x ?? 0) + 4, (text?.y ?? 0) + 4);
  await expect(page).toHaveURL(/\/$/);
});

test("an Image box gets an uploaded picture with alt text, sits after its text at 25%, and publishes lazily (W-1021)", async ({
  page,
  request,
}) => {
  const { id, slug } = await addTab(page, request, "Image boxes");
  await overlay(page).locator('[data-emvb-add-tile="image-box"]').click();
  await expect(overlay(page).locator("h2.emvb-panel-title")).toHaveText("Image box");
  await overlay(page)
    .locator("[data-emvb-media-upload]")
    .setInputFiles(path.join(process.cwd(), "e2e/fixtures/emvb-pixel.png"));
  const box = canvas(page).locator(".emvb-image-box");
  await expect(box.locator(".emvb-media-box-media img")).toHaveCount(1, { timeout: 20_000 });
  const alt = overlay(page).getByLabel("Alt text", { exact: true });
  await alt.fill("A single test pixel");
  await alt.blur();
  await overlay(page).getByLabel("Position").click();
  await page.getByRole("option", { name: "After the text", exact: true }).click();
  await overlay(page).getByLabel("Image width beside the text").click();
  await page.getByRole("option", { name: "Small (25%)", exact: true }).click();
  await expect(box).toHaveClass(/emvb-image-box-small/);

  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children[1]).toMatchObject({
    type: "image-box",
    props: { alt: "A single test pixel", position: "right", imageSize: "small" },
  });

  await publishPage(request, id);
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto(`/${slug}`);
  const published = page.locator(".emvb-image-box");
  const picture = published.getByRole("img", { name: "A single test pixel" });
  await expect(picture).toHaveAttribute("loading", "lazy");
  const [whole, media, content] = await Promise.all([
    published.boundingBox(),
    published.locator(".emvb-media-box-media").boundingBox(),
    published.locator(".emvb-media-box-content").boundingBox(),
  ]);
  // After the text, about a quarter of the box wide.
  expect(media?.x ?? 0).toBeGreaterThanOrEqual((content?.x ?? 0) + (content?.width ?? 0));
  expect(Math.round(((media?.width ?? 0) / (whole?.width ?? 1)) * 100)).toBe(25);
});

test("a Testimonial gets a 5-star rating and a new quote, and publishes as a figure with a blockquote (W-1022)", async ({
  page,
  request,
}) => {
  const { id, slug } = await addTab(page, request, "Testimonials");
  await overlay(page).locator('[data-emvb-add-tile="testimonial"]').click();
  const figure = canvas(page).locator("figure.emvb-testimonial");
  await expect(figure.locator(".emvb-testimonial-name")).toHaveText("Sam Rivera");
  await expect(overlay(page).locator("h2.emvb-panel-title")).toHaveText("Testimonial");

  const quote = overlay(page).getByLabel("Quote", { exact: true });
  await quote.fill("Our launch page took one afternoon.");
  await quote.blur();
  const rating = overlay(page).getByLabel("Rating", { exact: true });
  await rating.fill("5");
  await rating.blur();
  await expect(figure.locator(".emvb-rating")).toHaveAttribute("aria-label", "Rated 5 out of 5");

  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children[1]).toMatchObject({
    type: "testimonial",
    props: { quote: "Our launch page took one afternoon.", rating: 5 },
  });

  await publishPage(request, id);
  await page.goto(`/${slug}`);
  const published = page.getByRole("figure");
  await expect(published.locator("blockquote")).toHaveText("Our launch page took one afternoon.");
  await expect(published.getByRole("img", { name: "Rated 5 out of 5" })).toBeVisible();
  await expect(published.locator("figcaption")).toContainText("Sam Rivera");
  await expect(published.locator("figcaption")).toContainText("Head of Marketing");
});

test("Social icons are added with three links, one is switched to GitHub, and they publish as named links in circles (W-1024)", async ({
  page,
  request,
}) => {
  const { id, slug } = await addTab(page, request, "Social");
  await overlay(page).locator('[data-emvb-add-tile="social-icons"]').click();
  const list = canvas(page).locator("ul.emvb-social-icons");
  await expect(list.locator(".emvb-social-link")).toHaveCount(3);
  await expect(overlay(page).locator("h2.emvb-panel-title")).toHaveText("Social icons");
  await overlay(page).getByLabel("Shape").click();
  await page.getByRole("option", { name: "Circle", exact: true }).click();
  await overlay(page).getByRole("switch", { name: "Brand colours" }).click();
  await expect(list).toHaveClass(/emvb-social-circle/);

  // The third link opens in its own panel; it becomes GitHub.
  await canvas(page).locator(".emvb-social-linkedin").click();
  await expect(overlay(page).locator("h2.emvb-panel-title")).toHaveText("Social link");
  await overlay(page).getByLabel("Network").click();
  await page.getByRole("option", { name: "GitHub", exact: true }).click();
  const address = overlay(page).getByLabel("Profile address", { exact: true });
  await address.fill("https://github.com/emvb");
  await address.blur();

  await saveDraft(page);
  const stored = await storedLayout<{
    root: { children: { type: string; props: unknown; children?: { props: unknown }[] }[] };
  }>(request, id);
  const social = stored.root.children[1];
  expect(social).toMatchObject({
    type: "social-icons",
    props: { shape: "circle", brandColors: true },
  });
  expect(social?.children?.[2]?.props).toMatchObject({
    network: "github",
    href: "https://github.com/emvb",
  });

  await publishPage(request, id);
  await page.goto(`/${slug}`);
  const published = page.getByRole("list", { name: "Social media" });
  await expect(published.getByRole("link")).toHaveCount(3);
  const github = published.getByRole("link", { name: "GitHub" });
  await expect(github).toHaveAttribute("href", "https://github.com/emvb");
  await expect(github).toHaveAttribute("target", "_blank");
  // A circle badge in GitHub's colour, the icon inside it in white.
  const look = await github.evaluate((a) => {
    const css = getComputedStyle(a);
    const svg = a.querySelector("svg");
    return {
      round: css.borderRadius,
      background: css.backgroundColor,
      icon: svg ? getComputedStyle(svg).color : "",
      square:
        Math.round(a.getBoundingClientRect().width) ===
        Math.round(a.getBoundingClientRect().height),
    };
  });
  expect(look).toEqual({
    round: "50%",
    background: "rgb(24, 23, 23)",
    icon: "rgb(255, 255, 255)",
    square: true,
  });
});

test("a Gallery is set to two masonry columns with a lightbox, and on the page a picture opens large, steps and closes back to it (W-1019)", async ({
  page,
  request,
}) => {
  const media = await uploadEmvbPixel(request);
  const slug = `widgets-${unique()}`;
  const picture = (id: string, alt: string) => ({
    id,
    type: "gallery-image",
    props: { src: media.url, alt, width: 1, height: 1 },
  });
  const layout = startPage("Gallery");
  (layout.root.children as unknown[]).push({
    id: "gall0001",
    type: "gallery",
    props: { label: "Harbour photos" },
    children: [picture("pict0001", "Boats at dawn"), picture("pict0002", "The old pier")],
  });
  const id = await createPage(request, "Gallery", layout, slug);
  await openEditor(page, id, "Gallery");
  await openLayers(page);
  await overlay(page).locator('[data-emvb-layer="gall0001"] .emvb-layer-select').click();
  await expect(overlay(page).locator("h2.emvb-panel-title")).toHaveText("Gallery");
  await overlay(page).getByLabel("Layout").click();
  await page.getByRole("option", { name: "Masonry", exact: true }).click();
  const columns = overlay(page).getByLabel("Columns", { exact: true });
  await columns.fill("2");
  await columns.blur();
  await overlay(page).getByRole("switch", { name: "Open pictures large (lightbox)" }).click();
  await expect(canvas(page).locator("ul.emvb-gallery")).toHaveClass(
    /emvb-gallery-masonry emvb-gallery-cols-2/,
  );
  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children[1]?.props).toEqual({
    label: "Harbour photos",
    layout: "masonry",
    columns: 2,
    lightbox: true,
  });

  await publishPage(request, id);
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto(`/${slug}`);
  const gallery = page.getByRole("list", { name: "Harbour photos" });
  const first = gallery.getByRole("button", { name: "View larger: Boats at dawn" });
  await first.click();
  const viewer = page.getByRole("dialog", { name: "Picture viewer" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole("img", { name: "Boats at dawn" })).toBeVisible();
  await expect(viewer).toContainText("1 of 2");
  await page.keyboard.press("ArrowRight");
  await expect(viewer).toContainText("2 of 2");
  await expect(viewer.getByRole("img", { name: "The old pier" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  await expect(first).toBeFocused();
});

test("a Carousel gets arrows, dots and autoplay; on the page Next moves a slide, Pause stops it, and reduced motion starts paused (W-1018)", async ({
  page,
  request,
}) => {
  const { id, slug } = await addTab(page, request, "Carousel");
  await overlay(page).locator('[data-emvb-add-tile="carousel"]').click();
  const carousel = canvas(page).locator("section.emvb-carousel");
  await expect(carousel.locator(".emvb-carousel-slide")).toHaveCount(3);
  await expect(overlay(page).locator("h2.emvb-panel-title")).toHaveText("Carousel");
  for (const name of ["Previous and Next buttons", "Slide buttons (dots)", "Play automatically"])
    await overlay(page).getByRole("switch", { name }).click();
  // The editor shows the slides; the controls are the public page's script.
  await expect(carousel.locator(".emvb-carousel-controls")).toHaveCount(0);
  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children[1]).toMatchObject({
    type: "carousel",
    props: { arrows: true, dots: true, autoplay: true },
  });

  await publishPage(request, id);
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto(`/${slug}`);
  const region = page.getByRole("region", { name: "Carousel" });
  const pause = region.getByRole("button", { name: "Pause slides" });
  await expect(pause).toBeVisible();
  // The rotation control comes before the slides in keyboard order.
  const order = await region.evaluate((el) =>
    [...el.querySelectorAll("button, [tabindex='0']")].map(
      (n) => n.getAttribute("aria-label") ?? n.className,
    ),
  );
  expect(order[0]).toBe("Pause slides");
  await pause.click();
  await expect(region.getByRole("button", { name: "Play slides" })).toBeVisible();
  const track = region.locator(".emvb-carousel-track");
  await region.getByRole("button", { name: "Next slide" }).click();
  await expect.poll(() => track.evaluate((el) => Math.round(el.scrollLeft))).toBeGreaterThan(0);
  await expect(region.getByRole("button", { name: "Go to slide 2" })).toHaveAttribute(
    "aria-current",
    "true",
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Carousel" }).getByRole("button", { name: "Play slides" }),
  ).toBeVisible();
});
