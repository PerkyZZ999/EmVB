import { expect, request as requestFactory, test, type APIRequestContext } from "@playwright/test";
import { api, createPage, ensureEmvbSetup, getPage } from "./support/api.ts";

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

const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

const layoutWith = (text: string, color?: string) => ({
  schemaVersion: 1,
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

async function publish(id: string) {
  const { rev } = await getPage(author, id);
  const result = await api(author, "POST", `/_emdash/api/content/emvb_pages/${id}/publish`, {
    _rev: rev,
  });
  expect(result.status).toBe(200);
}

/** Sets one colour variable in the site design, or removes it when `value` is null. */
async function setColor(variable: string, value: string | null) {
  const current = await api(author, "GET", "/_emdash/api/plugins/emvb/design");
  const data = current.json?.["data"] as {
    design: {
      schemaVersion: 1;
      variables: { colors: { id: string; name: string; value: string }[] };
    };
    revision: string | null;
  };
  const colors = data.design.variables.colors.filter((c) => c.id !== variable);
  if (value !== null) colors.push({ id: variable, name: variable, value });
  const saved = await api(author, "POST", "/_emdash/api/plugins/emvb/design/save", {
    design: { ...data.design, variables: { colors } },
    revision: data.revision,
  });
  expect(saved.status).toBe(200);
}

const scriptsOf = (html: string) => html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) ?? [];

test("a published page renders from the production build with its content and CSS, and adds no script", async ({
  request,
}) => {
  const slug = `pub-${unique()}`;
  const text = `Published ${slug}`;
  const id = await createPage(author, "Public check", layoutWith(text), slug);
  await publish(id);

  const response = await request.get(`/${slug}`);
  expect(response.status()).toBe(200);
  const html = await response.text();
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
  await publish(id);

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
  await publish(id);
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
  await setColor(variable, "#112233");
  try {
    const slug = `tone-${unique()}`;
    const id = await createPage(
      author,
      "Variable check",
      layoutWith(`Tone ${slug}`, variable),
      slug,
    );
    await publish(id);
    expect(await (await request.get(`/${slug}`)).text()).toContain(declaration("#112233"));

    await setColor(variable, "#445566");
    const after = await (await request.get(`/${slug}`)).text();
    expect(after).toContain(declaration("#445566"));
    expect(after).not.toContain(declaration("#112233"));
  } finally {
    await setColor(variable, null);
  }
});
