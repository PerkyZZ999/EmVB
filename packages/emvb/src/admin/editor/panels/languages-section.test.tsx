import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { mount, settle, unmount } from "../../../../test/dom/mount.ts";
import type { Layout } from "../../../core/schema/layout.ts";
import type { Fetcher } from "../../api.ts";
import { LanguagesSection } from "./LanguagesSection.tsx";

afterEach(unmount);

const layout = {
  schemaVersion: 18,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "head0001", type: "heading", props: { text: "Hello", level: 1 } }],
  },
} as unknown as Layout;

type Call = { path: string; method: string; body: unknown };
function site(locales: string[] | null, translations: { id: string; locale: string }[]) {
  const calls: Call[] = [];
  const fetcher: Fetcher = async (path, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, method: init?.method ?? "GET", body });
    if (path === "/_emdash/api/manifest")
      return Response.json({
        data: locales ? { i18n: { defaultLocale: "en", locales } } : {},
      });
    if (path.endsWith("/translations"))
      return Response.json({
        data: { translations: translations.map((t) => ({ ...t, slug: "about", status: "draft" })) },
      });
    if (path === "/_emdash/api/content/emvb_pages")
      return Response.json({ data: { item: { id: "FR01" } } }, { status: 201 });
    if (path.endsWith("/requests/create")) return Response.json({ data: { request: { id: "r" } } });
    return new Response("?", { status: 404 });
  };
  return { fetcher, calls };
}

const render = async (fetcher: Fetcher, navigate: (url: string) => void = () => undefined) => {
  await mount(
    <LanguagesSection
      fetcher={fetcher}
      collection="emvb_pages"
      entryId="EN01"
      title="About"
      slug="about"
      layout={layout}
      navigate={navigate}
    />,
  );
  await settle();
  await settle();
};
const q = (s: string) => document.querySelector<HTMLElement>(s);

describe("Translate this page (W-936)", () => {
  test("a site with one language shows nothing", async () => {
    await render(site(null, []).fetcher);
    expect(q("[data-emvb-languages]")).toBeNull();
  });

  test("lists the site's languages: this page, an existing translation to open, a missing one", async () => {
    const opened: string[] = [];
    const { fetcher } = site(
      ["en", "fr", "de"],
      [
        { id: "EN01", locale: "en" },
        { id: "DE01", locale: "de" },
      ],
    );
    await render(fetcher, (url) => opened.push(url));
    expect(q('[data-emvb-language="en"]')?.textContent).toContain("This page");
    expect(q('[data-emvb-language="fr"] [data-emvb-language-translate]')).not.toBeNull();
    await act(async () => q('[data-emvb-language="de"] [data-emvb-language-open]')?.click());
    expect(opened).toEqual([expect.stringContaining("entry=DE01")]);
    expect(q("[data-emvb-languages]")?.textContent).toContain("1 texts to translate");
  });

  test("Translate creates the linked draft with this layout, asks the agent, and opens it", async () => {
    const opened: string[] = [];
    const { fetcher, calls } = site(["en", "fr"], [{ id: "EN01", locale: "en" }]);
    await render(fetcher, (url) => opened.push(url));
    await act(async () => q("[data-emvb-language-translate]")?.click());
    await settle();
    const created = calls.find((c) => c.path === "/_emdash/api/content/emvb_pages");
    expect(created?.body).toEqual({
      data: { title: "About", layout },
      slug: "about",
      locale: "fr",
      translationOf: "EN01",
    });
    const asked = calls.find((c) => c.path.endsWith("/requests/create"))?.body as {
      target: unknown;
      prompt: string;
    };
    expect(asked.target).toEqual({ collection: "emvb_pages", id: "FR01" });
    expect(asked.prompt).toContain("(en) into");
    expect(asked.prompt).toContain("(fr)");
    expect(opened).toEqual([expect.stringContaining("entry=FR01")]);
  });

  test("without the agent box ticked, no request is sent", async () => {
    const { fetcher, calls } = site(["en", "fr"], [{ id: "EN01", locale: "en" }]);
    await render(fetcher);
    await act(async () =>
      q(
        '[data-emvb-languages] button[role="checkbox"], [data-emvb-languages] input[type="checkbox"]',
      )?.click(),
    );
    await act(async () => q("[data-emvb-language-translate]")?.click());
    await settle();
    expect(calls.some((c) => c.path.endsWith("/requests/create"))).toBe(false);
  });
});
