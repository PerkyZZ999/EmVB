import { expect, test, type APIRequestContext } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce } from "./support/api.ts";
import { canvas, openEditor, unique } from "./support/helpers.ts";

// W-1086: the sample extension emvb-ext-hello (registered in both demos) puts allowlisted
// classes on its output and ships a stylesheet and a runtime. Both load only on pages that
// render one of its elements, on Node and on Cloudflare Workers.

setUpEmvbOnce();

const GREETING = "ext:emvb-ext-hello/greeting";

const layoutWith = (children: unknown[]) => ({
  schemaVersion: 18,
  root: { id: "root0001", type: "container", props: {}, children },
});

async function publish(request: APIRequestContext, title: string, children: unknown[]) {
  const slug = `ext-${unique()}`;
  const id = await createPage(request, title, layoutWith(children), slug);
  await publishPage(request, id);
  return { id, slug };
}

test("an extension's classes, stylesheet and runtime reach only the pages that show its element (W-1086)", async ({
  page,
  request,
}) => {
  const withIt = await publish(request, "Extension page", [
    { id: "head0001", type: "heading", props: { text: "Extension page", level: 1 } },
    { id: "greet001", type: GREETING, props: { text: "Hi from the extension" } },
  ]);
  const without = await publish(request, "Plain page", [
    { id: "head0001", type: "heading", props: { text: "Plain page", level: 1 } },
  ]);

  await page.goto(`/${withIt.slug}`);
  const card = page.locator(".emvb-ext > .hello-card");
  await expect(card).toHaveCount(1);
  // The classes are added to the built-in element's own ones; nothing else is added.
  expect(await card.getAttribute("class")).toMatch(/^emvb-div-block( \S+)* hello-card$/);
  const title = card.locator("h2");
  await expect(title).toHaveText("Hi from the extension");
  expect(await title.getAttribute("class")).toMatch(/ hello-title hello-wave$/);
  // The stylesheet is on the page and styles the classes.
  expect(await card.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("2px");
  // The runtime is written once and has run.
  await expect(page.locator('script[data-emvb-ext-runtime="emvb-ext-hello"]')).toHaveCount(1);
  await expect(card).toHaveAttribute("data-hello-ready", "");
  await expect(title).toHaveAttribute("data-hello-wave", "on");

  await page.goto(`/${without.slug}`);
  await expect(page.getByRole("heading", { name: "Plain page" })).toBeVisible();
  await expect(page.locator("script[data-emvb-ext-runtime]")).toHaveCount(0);
  const html = await page.content();
  expect(html).not.toContain("hello-card");
  expect(html).not.toContain("/* emvb-ext-hello */");
});

test("the extension runtime leaves the wave off under reduced motion (W-1086)", async ({
  page,
  request,
}) => {
  const { slug } = await publish(request, "Calm extension page", [
    { id: "greet001", type: GREETING, props: { text: "Calm hello" } },
  ]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/${slug}`);
  const card = page.locator(".hello-card");
  await expect(card).toHaveAttribute("data-hello-ready", "");
  expect(await card.locator(".hello-wave").getAttribute("data-hello-wave")).toBeNull();
});

test("the editor canvas shows the extension's output with its classes and stylesheet, and no runtime (W-1086)", async ({
  page,
  request,
}) => {
  const id = await createPage(
    request,
    "Extension canvas",
    layoutWith([
      { id: "head0001", type: "heading", props: { text: "Extension canvas", level: 1 } },
      { id: "greet001", type: GREETING, props: { text: "Hello on the canvas" } },
    ]),
    `ext-${unique()}`,
  );
  await openEditor(page, id, "Extension canvas");
  const card = canvas(page).locator('[data-emvb-id="greet001"] > .hello-card');
  await expect(card).toHaveCount(1);
  await expect(card.locator("h2")).toHaveText("Hello on the canvas");
  expect(await card.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("2px");
  await expect(canvas(page).locator("script")).toHaveCount(0);
  // The stylesheet stays in the canvas frame: the admin page itself never gets it.
  expect(
    await page.evaluate(() => document.documentElement.outerHTML.includes(".hello-card")),
  ).toBe(false);
});
