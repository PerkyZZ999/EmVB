import { expect, request as requestFactory, test, type APIRequestContext } from "@playwright/test";
import { api, createPage, ensureEmvbSetup, getPage, publishPage } from "./support/api.ts";
import { setClass, setColor, setSpacing } from "./support/design.ts";
import { unique } from "./support/helpers.ts";

let author: APIRequestContext;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  const { dev, auth } = test.info().project.metadata as { dev: string; auth: string };
  const context = await browser.newContext({ baseURL: dev, storageState: auth });
  await ensureEmvbSetup(await context.newPage());
  await context.close();
  author = await requestFactory.newContext({ baseURL: dev, storageState: auth });
});

test.afterAll(async () => {
  await author.dispose();
});

const layoutWith = (text: string, color?: string) => ({
  schemaVersion: 3,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column", gap: { value: 24, unit: "px" } },
    children: [
      {
        id: "head0001",
        type: "heading",
        props: { text, level: 1 },
        ...(color ? { style: { color: { var: color } } } : {}),
      },
    ],
  },
});

const layoutWithSpacing = (text: string, spacingId: string) => ({
  schemaVersion: 3,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column", gap: { var: spacingId, from: "spacing" } },
    children: [{ id: "head0001", type: "heading", props: { text, level: 1 } }],
  },
});

const layoutWithClass = (textA: string, textB: string, classId: string) => ({
  schemaVersion: 3,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        id: "head0001",
        type: "heading",
        props: { text: textA, level: 1 },
        classes: [classId],
      },
      {
        id: "head0002",
        type: "heading",
        props: { text: textB, level: 2 },
        classes: [classId],
      },
    ],
  },
});

/** Creates and publishes a page as the author, and returns its public HTML (asserting 200). */
async function publishedHtml(
  request: APIRequestContext,
  title: string,
  layout: unknown,
  slug: string,
) {
  await publishPage(author, await createPage(author, title, layout, slug));
  const response = await request.get(`/${slug}`);
  expect(response.status()).toBe(200);
  return response.text();
}

const scriptsOf = (html: string) => html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) ?? [];

test("a published page renders from the production build with its content and CSS, and adds no script", async ({
  request,
}) => {
  const slug = `pub-${unique()}`;
  const text = `Published ${slug}`;
  const html = await publishedHtml(request, "Public check", layoutWith(text), slug);
  expect(html).toContain(`<h1 class="emvb-heading">${text}</h1>`);
  expect(html).toMatch(/<style>[^<]*\.emvb-root\{[^<]*gap:24px/);
  expect(html).not.toContain("data-emvb");

  // The site's own layout may bring scripts; EmVB adds none. Compare with a plain layout page.
  const baseline = await (await request.get("/this-page-does-not-exist-" + unique())).text();
  expect(scriptsOf(html)).toHaveLength(scriptsOf(baseline).length);
  expect(scriptsOf(html).join("\n")).not.toMatch(/emvb|initForms|plugin-forms/i);
});

test("a blank-canvas page is a whole document with no scripts at all", async ({ request }) => {
  const slug = `blank-${unique()}`;
  const id = await createPage(author, "Blank check", layoutWith(`Blank ${slug}`), slug);
  const { rev } = await getPage(author, id);
  expect(
    (
      await api(author, "PUT", `/_emdash/api/content/emvb_pages/${id}`, {
        data: { canvas_mode: "blank" },
        _rev: rev,
      })
    ).status,
  ).toBe(200);
  await publishPage(author, id);

  const html = await (await request.get(`/${slug}`)).text();
  expect(html.trimStart().toLowerCase().startsWith("<!doctype html>")).toBe(true);
  expect(html).toContain("<title>");
  expect(html).toContain(`Blank ${slug}`);
  expect(scriptsOf(html)).toEqual([]);
});

test("unpublished and missing pages are 404", async ({ request }) => {
  const slug = `draft-${unique()}`;
  await createPage(author, "Draft only", layoutWith(`Draft ${slug}`), slug);
  const draft = await request.get(`/${slug}`);
  expect(draft.status()).toBe(404);
  expect(await draft.text()).not.toContain(`Draft ${slug}`);
  expect((await request.get(`/missing-${unique()}`)).status()).toBe(404);
});

test("a preview link renders the draft, uncached, while the public page keeps the published version", async ({
  request,
}) => {
  const slug = `preview-${unique()}`;
  const id = await createPage(author, "Preview check", layoutWith(`Live ${slug}`), slug);
  await publishPage(author, id);
  const { rev } = await getPage(author, id);
  await api(author, "PUT", `/_emdash/api/content/emvb_pages/${id}`, {
    data: { layout: layoutWith(`Draft ${slug}`) },
    _rev: rev,
  });

  const link = await api(author, "POST", `/_emdash/api/content/emvb_pages/${id}/preview-url`, {});
  expect(link.status).toBe(200);
  const url = new URL((link.json?.["data"] as { url: string } | undefined)?.url ?? "", "http://x");
  expect(url.pathname).toBe(`/${slug}`);
  const preview = await request.get(url.pathname + url.search);
  expect(preview.status()).toBe(200);
  expect(await preview.text()).toContain(`Draft ${slug}`);
  expect(preview.headers()["cache-control"]).toContain("no-store");

  const live = await (await request.get(`/${slug}`)).text();
  expect(live).toContain(`Live ${slug}`);
  expect(live).not.toContain(`Draft ${slug}`);
});

test("changing a colour variable changes the published page without re-publishing", async ({
  request,
}) => {
  const variable = `tone-${unique()}`;
  const declaration = (value: string) => `--emvb-c-${variable}:${value}`;
  await setColor(author, variable, "#112233");
  try {
    const slug = `tone-${unique()}`;
    expect(
      await publishedHtml(request, "Variable check", layoutWith(`Tone ${slug}`, variable), slug),
    ).toContain(declaration("#112233"));

    await setColor(author, variable, "#445566");
    const after = await (await request.get(`/${slug}`)).text();
    expect(after).toContain(declaration("#445566"));
    expect(after).not.toContain(declaration("#112233"));
  } finally {
    await setColor(author, variable, null);
  }
});

test("changing a spacing variable changes the published page without re-publishing", async ({
  request,
}) => {
  const variable = `space-${unique()}`;
  const declaration = (value: number) => `--emvb-s-${variable}:${value}px`;
  await setSpacing(author, variable, 12);
  try {
    const slug = `space-${unique()}`;
    expect(
      await publishedHtml(
        request,
        "Spacing check",
        layoutWithSpacing(`Space ${slug}`, variable),
        slug,
      ),
    ).toContain(declaration(12));

    await setSpacing(author, variable, 32);
    const after = await (await request.get(`/${slug}`)).text();
    expect(after).toContain(declaration(32));
    expect(after).not.toContain(declaration(12));
  } finally {
    await setSpacing(author, variable, null);
  }
});

test("editing a class used on two elements updates both on the published page", async ({
  request,
}) => {
  const classId = `card-${unique()}`;
  await setClass(author, classId, { name: "Card", style: { color: "#112233" } });
  try {
    const slug = `class-${unique()}`;
    let html = await publishedHtml(
      request,
      "Class check",
      layoutWithClass(`One ${slug}`, `Two ${slug}`, classId),
      slug,
    );
    expect(html).toContain(`emvb-k-${classId}`);
    expect(html).toContain(`.emvb-k-${classId}{color:#112233}`);

    await setClass(author, classId, { name: "Card", style: { color: "#abcdef" } });
    html = await (await request.get(`/${slug}`)).text();
    expect(html).toContain(`.emvb-k-${classId}{color:#abcdef}`);
    expect(html).not.toContain("#112233");
    expect((html.match(new RegExp(`emvb-k-${classId}`, "g")) ?? []).length).toBeGreaterThanOrEqual(
      2,
    );
  } finally {
    await setClass(author, classId, null);
  }
});

test("a published page with an unknown node still renders its other elements with 200", async ({
  request,
}) => {
  const slug = `unk-${unique()}`;
  const text = `Known ${slug}`;
  const layout = {
    schemaVersion: 3,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        { id: "head0001", type: "heading", props: { text, level: 1 } },
        {
          id: "car00001",
          type: "carousel",
          props: { slides: 2 },
          children: [{ id: "head0002", type: "heading", props: { text: "Hidden", level: 2 } }],
        },
      ],
    },
  };
  const html = await publishedHtml(request, "Unknown check", layout, slug);
  expect(html).toContain(`<h1 class="emvb-heading">${text}</h1>`);
  expect(html).not.toContain("carousel");
  expect(html).not.toContain("Unknown element");
  expect(html).not.toContain("Hidden");
});

test("Size, Position and Effects styles, local and from a class, render on the published page", async ({
  page,
  request,
}) => {
  const classId = `fx-${unique()}`;
  await setClass(author, classId, {
    name: "Effects",
    style: {
      opacity: 0.8,
      boxShadow: { x: 0, y: 4, blur: 12, spread: 0, color: "#0000002e" },
      filter: { blur: 2, grayscale: 50 },
      cursor: "pointer",
    },
  });
  try {
    const slug = `w088-${unique()}`;
    const text = `Sections ${slug}`;
    const layout = {
      schemaVersion: 3,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "card0001",
            type: "container",
            props: {},
            style: {
              position: "relative",
              width: { value: 50, unit: "%" },
              maxHeight: { value: 20, unit: "rem" },
              aspectRatio: "4/3",
              overflow: "hidden",
              zIndex: 1,
            },
            children: [
              {
                id: "head0001",
                type: "heading",
                props: { text, level: 1 },
                classes: [classId],
                style: { position: "absolute", top: { value: 8, unit: "px" }, left: "auto" },
              },
            ],
          },
        ],
      },
    };
    const html = await publishedHtml(request, "Sections check", layout, slug);
    expect(html).toContain("aspect-ratio:4 / 3");
    expect(html).toContain(`.emvb-k-${classId}{`);

    await page.goto(`/${slug}`);
    const read = (selector: string, keys: string[]) =>
      page.locator(selector).evaluate((el, names) => {
        const style = getComputedStyle(el);
        return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]));
      }, keys);
    expect(
      await read(".emvb-e-card0001", [
        "position",
        "max-height",
        "aspect-ratio",
        "overflow",
        "z-index",
      ]),
    ).toEqual({
      position: "relative",
      "max-height": "320px",
      "aspect-ratio": "4 / 3",
      overflow: "hidden",
      "z-index": "1",
    });
    expect(
      await read(".emvb-e-head0001", [
        "position",
        "top",
        "opacity",
        "box-shadow",
        "filter",
        "cursor",
      ]),
    ).toEqual({
      position: "absolute",
      top: "8px",
      opacity: "0.8",
      "box-shadow": "rgba(0, 0, 0, 0.18) 0px 4px 12px 0px",
      filter: "blur(2px) grayscale(0.5)",
      cursor: "pointer",
    });
  } finally {
    await setClass(author, classId, null);
  }
});
