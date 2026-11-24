import { expect, request as requestFactory, test, type APIRequestContext } from "@playwright/test";
import {
  createPage,
  createThemePart,
  ensureEmvbSetup,
  publishPage,
  publishThemePart,
} from "./support/api.ts";
import { unique } from "./support/helpers.ts";

// W-1086: on production builds (the Node server and the Cloudflare Worker) astro.config never
// runs, so extension code reaches the server only through the entry `emvb()` generated at build
// time. The sample extension emvb-ext-hello must render there with its classes, stylesheet and
// runtime, and each of those once per response even when the header, the page and the footer
// all show its element.

let author: APIRequestContext;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser, baseURL }) => {
  const { auth } = test.info().project.metadata as { auth: string };
  const context = await browser.newContext({ baseURL, storageState: auth });
  await ensureEmvbSetup(await context.newPage());
  await context.close();
  author = await requestFactory.newContext({ baseURL, storageState: auth });
});

test.afterAll(async () => {
  await author.dispose();
});

const GREETING = "ext:emvb-ext-hello/greeting";

const layoutWith = (children: unknown[]) => ({
  schemaVersion: 18,
  root: { id: "root0001", type: "container", props: {}, children },
});
const greeting = (id: string, text: string) => ({ id, type: GREETING, props: { text } });
const count = (text: string, part: string) => text.split(part).length - 1;

test("the built server renders the extension's element, classes, stylesheet and runtime once (W-1086)", async ({
  page,
  request,
}) => {
  const slug = `ext-prod-${unique()}`;
  const id = await createPage(
    author,
    "Extension in production",
    layoutWith([
      { id: "head0001", type: "heading", props: { text: "Extension in production", level: 1 } },
      greeting("greet001", "Hello from the body"),
    ]),
    slug,
  );
  await publishPage(author, id);
  // A header and a footer with the element too, shown on this page only.
  const onlyHere = {
    schemaVersion: 1,
    rules: [
      {
        id: "this-page",
        op: "include",
        group: "singular",
        name: "entry",
        args: { collection: "emvb_pages", id },
      },
    ],
  };
  for (const [partType, text] of [
    ["header", "Hello from the header"],
    ["footer", "Hello from the footer"],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- two parts, one after the other
    const partId = await createThemePart(author, {
      title: `Extension ${partType} ${slug}`,
      partType,
      layout: layoutWith([greeting(`greet${partType.slice(0, 3)}`, text)]),
      conditions: onlyHere,
    });
    // oxlint-disable-next-line no-await-in-loop -- two parts, one after the other
    await publishThemePart(author, partId);
  }

  const response = await request.get(`/${slug}`);
  expect(response.status()).toBe(200);
  const html = await response.text();
  // The element rendered (no placeholder), with its allowlisted classes, in all three places.
  expect(html).not.toMatch(/class="[^"]*emvb-ext-missing/);
  expect(count(html, 'class="emvb-ext"')).toBe(3);
  expect(html).toMatch(/class="emvb-div-block( \S+)* hello-card"/);
  expect(html).toMatch(/class="emvb-heading( \S+)* hello-title hello-wave"/);
  for (const text of ["Hello from the header", "Hello from the body", "Hello from the footer"])
    expect(html).toContain(text);
  // The stylesheet and the runtime, once each for the whole response.
  expect(count(html, "/* emvb-ext-hello */")).toBe(1);
  expect(count(html, 'data-emvb-ext-runtime="emvb-ext-hello"')).toBe(1);

  await page.goto(`/${slug}`);
  const cards = page.locator(".emvb-ext > .hello-card");
  await expect(cards).toHaveCount(3);
  // The stylesheet styles the classes, and the runtime ran.
  expect(await cards.first().evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("2px");
  for (const card of await cards.all()) await expect(card).toHaveAttribute("data-hello-ready", "");
});

test("a built page without the extension's element gets none of its assets (W-1086)", async ({
  request,
}) => {
  const slug = `ext-prod-plain-${unique()}`;
  await publishPage(
    author,
    await createPage(
      author,
      "Plain in production",
      layoutWith([{ id: "head0001", type: "heading", props: { text: "Plain", level: 1 } }]),
      slug,
    ),
  );
  const response = await request.get(`/${slug}`);
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).not.toContain("hello-card");
  expect(html).not.toContain("/* emvb-ext-hello */");
  expect(html).not.toContain("data-emvb-ext-runtime");
});
