// oxlint-disable no-underscore-dangle -- Portable Text names its fields _type and _key.
import { expect, test } from "bun:test";
import { emptyDesign, LAYOUT_SCHEMA_VERSION } from "../core/index.ts";
import { ApiError, type Fetcher } from "./api.ts";
import { copyPagesAsRichText, richTextTargets } from "./copy-rich-text.ts";

const page = (id: string, slug: string, text: string, status = "published") => ({
  id,
  slug,
  status,
  data: {
    title: text,
    layout: {
      schemaVersion: LAYOUT_SCHEMA_VERSION,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text, level: 1 } },
          { id: "form0001", type: "form", props: { formId: "f" }, children: [] },
        ],
      },
    },
  },
});

function fake(taken: string[] = []) {
  const posts: { path: string; body: { data: Record<string, unknown>; slug?: string } }[] = [];
  const fetcher: Fetcher = async (path, init) => {
    if (path === "/_emdash/api/schema/collections")
      return Response.json({
        data: {
          items: [
            { slug: "pages", label: "Pages" },
            { slug: "notes", label: "Notes" },
            { slug: "emvb_pages", label: "EmVB", hidden: true },
          ],
        },
      });
    if (path.startsWith("/_emdash/api/schema/collections/pages"))
      return Response.json({
        data: {
          item: {
            slug: "pages",
            fields: [
              { slug: "title", type: "string" },
              { slug: "intro", type: "portableText" },
              { slug: "content", type: "portableText" },
            ],
          },
        },
      });
    if (path.startsWith("/_emdash/api/schema/collections/emvb_pages"))
      return Response.json({
        data: { item: { slug: "emvb_pages", fields: [{ slug: "content", type: "portableText" }] } },
      });
    if (path.startsWith("/_emdash/api/schema/collections/notes"))
      return Response.json({
        data: { item: { slug: "notes", fields: [{ slug: "text", type: "string" }] } },
      });
    if (path.startsWith("/_emdash/api/content/emvb_pages"))
      return Response.json({
        data: {
          items: [
            page("p1", "about", "About"),
            page("p2", "home", "Home"),
            page("p3", "wip", "WIP", "draft"),
          ],
        },
      });
    if (path.startsWith("/_emdash/api/content/emvb_theme_parts"))
      return Response.json({ data: { items: [] } });
    if (path.includes("/design/draft")) return Response.json({ data: { design: emptyDesign() } });
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as (typeof posts)[number]["body"];
      if (taken.includes(body.slug ?? ""))
        return Response.json(
          { error: { code: "CONFLICT", message: "Slug exists" } },
          { status: 409 },
        );
      posts.push({ path, body });
      return Response.json({ data: { item: { id: `new-${posts.length}` } } }, { status: 201 });
    }
    throw new ApiError(404, "NOT_FOUND", path);
  };
  return { fetcher, posts };
}

test("only visible collections with a rich-text field are offered, content first (W-963)", async () => {
  expect(await richTextTargets(fake().fetcher)).toEqual([
    { slug: "pages", label: "Pages", field: "content", hasTitle: true },
  ]);
});

test("published pages become draft entries with their words as rich text (W-963)", async () => {
  const { fetcher, posts } = fake(["home"]);
  const target = { slug: "pages", label: "Pages", field: "content", hasTitle: true };
  const result = await copyPagesAsRichText(fetcher, target);
  expect(result.created).toEqual([{ title: "About", id: "new-1" }]);
  expect(result.failed).toEqual([{ title: "Home", message: "its address is already used there" }]);
  expect(result.skipped).toEqual({ form: 2 });
  expect(posts).toHaveLength(1);
  expect(posts[0]?.path).toBe("/_emdash/api/content/pages");
  const sent = posts[0]?.body;
  expect(sent?.slug).toBe("about");
  expect(Object.keys(sent?.data ?? {})).toEqual(["title", "content"]);
  expect(sent?.data["title"]).toBe("About");
  const blocks = sent?.data["content"] as { _type: string; style: string }[];
  expect(blocks.map((b) => [b._type, b.style])).toEqual([["block", "h1"]]);
  expect("status" in (sent ?? {})).toBe(false);
});

test("one page only, when chosen", async () => {
  const { fetcher, posts } = fake();
  await copyPagesAsRichText(
    fetcher,
    { slug: "pages", label: "Pages", field: "content", hasTitle: false },
    "p2",
  );
  expect(posts.map((p) => p.body.slug)).toEqual(["home"]);
  expect(Object.keys(posts[0]?.body.data ?? {})).toEqual(["content"]);
});

/** W-1091 (#26): a site with English and French, and a page translated into French. */
function bilingual(options: { i18n?: boolean; contentTranslatable?: boolean } = {}) {
  const { i18n = true, contentTranslatable = true } = options;
  const posts: {
    body: { data: Record<string, unknown>; slug?: string; locale?: string; translationOf?: string };
  }[] = [];
  const translated = (
    id: string,
    locale: string,
    text: string,
    group = "g1",
    slug = "care-plans",
  ) => ({ ...page(id, slug, text), locale, translationGroup: group });
  const fetcher: Fetcher = async (path, init) => {
    if (path === "/_emdash/api/manifest")
      return Response.json({
        data: i18n ? { i18n: { defaultLocale: "en", locales: ["en", "fr"] } } : {},
      });
    if (path === "/_emdash/api/schema/collections")
      return Response.json({ data: { items: [{ slug: "posts", label: "Posts" }] } });
    if (path.startsWith("/_emdash/api/schema/collections/posts"))
      return Response.json({
        data: {
          item: {
            slug: "posts",
            fields: [
              { slug: "title", type: "string" },
              { slug: "content", type: "portableText", translatable: contentTranslatable },
            ],
          },
        },
      });
    if (path.startsWith("/_emdash/api/content/emvb_pages"))
      return Response.json({
        data: {
          items: [
            // The French copy comes first (by title), as it did in the report.
            translated("fr1", "fr", "Forfaits d'entretien"),
            translated("en1", "en", "Website care plans"),
            translated("en2", "en", "About", "g2", "about"),
          ],
        },
      });
    if (path.startsWith("/_emdash/api/content/emvb_theme_parts"))
      return Response.json({ data: { items: [] } });
    if (path.includes("/design/draft")) return Response.json({ data: { design: emptyDesign() } });
    if (path.startsWith("/_emdash/api/content/posts") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as (typeof posts)[number]["body"];
      const locale = body.locale ?? "en";
      // EmDash: a slug is unique per language.
      if (posts.some((p) => p.body.slug === body.slug && (p.body.locale ?? "en") === locale))
        return Response.json(
          { error: { code: "CONFLICT", message: "Slug exists" } },
          { status: 409 },
        );
      posts.push({ body });
      return Response.json({ data: { item: { id: `new-${posts.length}` } } }, { status: 201 });
    }
    throw new ApiError(404, "NOT_FOUND", path);
  };
  return { fetcher, posts };
}

const POSTS = { slug: "posts", label: "Posts", field: "content", hasTitle: true };
const headingOf = (body: { data: Record<string, unknown> }) =>
  (body.data["content"] as { children: { text: string }[] }[])[0]?.children[0]?.text;

test("W-1091 (#26): each language becomes its own entry, in its own locale, linked as translations", async () => {
  const { fetcher, posts } = bilingual();
  const result = await copyPagesAsRichText(fetcher, POSTS);
  expect(result.failed).toEqual([]);
  const sent = posts.map((p) => [
    p.body.locale,
    p.body.slug,
    headingOf(p.body),
    p.body.translationOf,
  ]);
  expect(sent).toEqual([
    ["en", "about", "About", undefined],
    ["en", "care-plans", "Website care plans", undefined],
    // The French entry is a translation of the English one, with the French words.
    ["fr", "care-plans", "Forfaits d'entretien", "new-2"],
  ]);
  expect(result.created.map((c) => c.title)).toEqual([
    "About (en)",
    "Website care plans (en)",
    "Forfaits d'entretien (fr)",
  ]);
});

test("W-1091 (#26): a rich-text field shared by every language takes the default language only", async () => {
  const { fetcher, posts } = bilingual({ contentTranslatable: false });
  const [target] = await richTextTargets(fetcher);
  expect(target).toEqual({ ...POSTS, translatable: false });
  if (!target) throw new Error("no target");
  const result = await copyPagesAsRichText(fetcher, target);
  expect(posts.map((p) => [p.body.locale, headingOf(p.body)])).toEqual([
    ["en", "About"],
    ["en", "Website care plans"],
  ]);
  expect(result.failed).toEqual([
    {
      title: "Forfaits d'entretien (fr)",
      message: "Posts shares its content field across languages, so only the en page was copied",
    },
  ]);
});

test("W-1091 (#26): without languages set up, one entry per page and no other language's words", async () => {
  const { fetcher, posts } = bilingual({ i18n: false });
  const result = await copyPagesAsRichText(fetcher, POSTS);
  expect(posts.map((p) => [p.body.locale, headingOf(p.body)])).toEqual([
    [undefined, "About"],
    [undefined, "Website care plans"],
  ]);
  expect(result.failed.map((f) => f.title)).toEqual(["Forfaits d'entretien (fr)"]);
  expect(result.failed[0]?.message).toContain("languages");
});
