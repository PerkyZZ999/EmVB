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

const layoutWithSpacing = (text: string, spacingId: string) => ({
  schemaVersion: 1,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column", gap: { var: spacingId, from: "spacing" } },
    children: [{ id: "head0001", type: "heading", props: { text, level: 1 } }],
  },
});

const layoutWithClass = (textA: string, textB: string, classId: string) => ({
  schemaVersion: 1,
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

async function publish(id: string) {
  const { rev } = await getPage(author, id);
  const result = await api(author, "POST", `/_emdash/api/content/emvb_pages/${id}/publish`, {
    _rev: rev,
  });
  expect(result.status).toBe(200);
}

type DesignDoc = {
  schemaVersion: 1;
  variables: {
    colors: { id: string; name: string; value: string }[];
    fonts?: { id: string; name: string; value: string }[];
    fontSizes?: { id: string; name: string; value: { value: number; unit: string } }[];
    spacings?: { id: string; name: string; value: { value: number; unit: string } }[];
  };
  classes?: { id: string; name: string; style: Record<string, unknown> }[];
};

async function loadDesign() {
  const current = await api(author, "GET", "/_emdash/api/plugins/emvb/design");
  return current.json?.["data"] as { design: DesignDoc; revision: string | null };
}

async function saveDesign(design: DesignDoc, revision: string | null) {
  const saved = await api(author, "POST", "/_emdash/api/plugins/emvb/design/save", {
    design,
    revision,
  });
  expect(saved.status).toBe(200);
  return saved;
}

/** Sets one colour variable in the site design, or removes it when `value` is null. */
async function setColor(variable: string, value: string | null) {
  const data = await loadDesign();
  const colors = data.design.variables.colors.filter((c) => c.id !== variable);
  if (value !== null) colors.push({ id: variable, name: variable, value });
  await saveDesign(
    { ...data.design, variables: { ...data.design.variables, colors } },
    data.revision,
  );
}

/** Sets one spacing variable, or removes it when `value` is null. */
async function setSpacing(variable: string, value: number | null) {
  const data = await loadDesign();
  const spacings = (data.design.variables.spacings ?? []).filter((s) => s.id !== variable);
  if (value !== null) {
    spacings.push({ id: variable, name: variable, value: { value, unit: "px" } });
  }
  await saveDesign(
    {
      ...data.design,
      variables: { ...data.design.variables, spacings },
    },
    data.revision,
  );
}

/** Upserts or removes a style class by id. */
async function setClass(id: string, next: { name: string; style: Record<string, unknown> } | null) {
  const data = await loadDesign();
  const classes = (data.design.classes ?? []).filter((c) => c.id !== id);
  if (next !== null) classes.push({ id, name: next.name, style: next.style });
  await saveDesign({ ...data.design, classes }, data.revision);
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

test("changing a spacing variable changes the published page without re-publishing", async ({
  request,
}) => {
  const variable = `space-${unique()}`;
  const declaration = (value: number) => `--emvb-s-${variable}:${value}px`;
  await setSpacing(variable, 12);
  try {
    const slug = `space-${unique()}`;
    const id = await createPage(
      author,
      "Spacing check",
      layoutWithSpacing(`Space ${slug}`, variable),
      slug,
    );
    await publish(id);
    expect(await (await request.get(`/${slug}`)).text()).toContain(declaration(12));

    await setSpacing(variable, 32);
    const after = await (await request.get(`/${slug}`)).text();
    expect(after).toContain(declaration(32));
    expect(after).not.toContain(declaration(12));
  } finally {
    await setSpacing(variable, null);
  }
});

test("editing a class used on two elements updates both on the published page", async ({
  request,
}) => {
  const classId = `card-${unique()}`;
  await setClass(classId, { name: "Card", style: { color: "#112233" } });
  try {
    const slug = `class-${unique()}`;
    const id = await createPage(
      author,
      "Class check",
      layoutWithClass(`One ${slug}`, `Two ${slug}`, classId),
      slug,
    );
    await publish(id);
    let html = await (await request.get(`/${slug}`)).text();
    expect(html).toContain(`emvb-k-${classId}`);
    expect(html).toContain(`.emvb-k-${classId}{color:#112233}`);

    await setClass(classId, { name: "Card", style: { color: "#abcdef" } });
    html = await (await request.get(`/${slug}`)).text();
    expect(html).toContain(`.emvb-k-${classId}{color:#abcdef}`);
    expect(html).not.toContain("#112233");
    expect((html.match(new RegExp(`emvb-k-${classId}`, "g")) ?? []).length).toBeGreaterThanOrEqual(
      2,
    );
  } finally {
    await setClass(classId, null);
  }
});

test("a published page with an unknown node still renders its other elements with 200", async ({
  request,
}) => {
  const slug = `unk-${unique()}`;
  const text = `Known ${slug}`;
  const layout = {
    schemaVersion: 1,
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
  const id = await createPage(author, "Unknown check", layout, slug);
  await publish(id);

  const response = await request.get(`/${slug}`);
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain(`<h1 class="emvb-heading">${text}</h1>`);
  expect(html).not.toContain("carousel");
  expect(html).not.toContain("Unknown element");
  expect(html).not.toContain("Hidden");
});
