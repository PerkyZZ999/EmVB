import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { Fetcher } from "../../api.ts";
import type { PageDraft } from "../../content-api.ts";
import { cleanup, mount, rerender, settle } from "../../../../test/dom/mount.ts";
import type { PagePatch } from "../store.ts";
import { PageSettings } from "./PageSettings.tsx";

afterEach(cleanup);

// W-091: page settings were only reached through save tests (title, slug, slug error); SEO
// description, the theme-part form and its popup-only Triggers weren't checked.

const PAGE: PageDraft = {
  title: "About",
  slug: "about",
  canvasMode: "site-layout",
  seoTitle: "",
  seoDescription: "",
  layout: null,
};

async function settings(page: PageDraft, kind: "page" | "theme-part" = "page", fetcher?: Fetcher) {
  const sent: PagePatch[] = [];
  const host = await mount(
    <PageSettings
      page={page}
      slugError={null}
      kind={kind}
      fetcher={fetcher}
      onChange={(patch) => sent.push(patch)}
    />,
  );
  const field = (label: string) => {
    const element = [...host.querySelectorAll("label")].find((l) =>
      l.textContent?.trim().startsWith(label),
    );
    const id = element?.getAttribute("for");
    const input = id ? document.getElementById(id) : null;
    return input instanceof HTMLInputElement ? input : null;
  };
  const type = async (label: string, text: string) => {
    const input = field(label);
    if (!input) throw new Error(`no ${label} field`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const openSeo = async () => {
    const header = host.querySelector<HTMLElement>('[data-emvb-section="seo"]');
    await act(async () => header?.click());
    await settle();
  };
  return { host, sent, field, type, openSeo };
}

describe("page settings (W-091)", () => {
  test("closed SEO shows how many SEO fields are set", async () => {
    const both = await settings({ ...PAGE, seoTitle: "T", seoDescription: "D" });
    expect(both.host.querySelector('[data-emvb-section="seo"]')?.textContent).toBe("SEO · 2");
    const none = await settings(PAGE);
    expect(none.host.querySelector('[data-emvb-section="seo"]')?.textContent).toBe("SEO");
  });

  test("the SEO fields send their own patches and keep their length limits", async () => {
    const view = await settings(PAGE);
    await view.openSeo();
    expect([
      view.field("Meta title")?.maxLength,
      view.field("Meta description")?.maxLength,
    ]).toEqual([200, 500]);
    expect(view.field("Meta title")?.placeholder).toBe("About");
    await view.type("Meta title", "Search title");
    await view.type("Meta description", "Search text");
    expect(view.sent).toEqual([{ seoTitle: "Search title" }, { seoDescription: "Search text" }]);
  });

  test("W-284: Canonical URL and Hide from search engines send patches and count as set", async () => {
    const set = await settings({
      ...PAGE,
      seoCanonical: "https://example.com/a",
      seoNoIndex: true,
    });
    expect(set.host.querySelector('[data-emvb-section="seo"]')?.textContent).toBe("SEO · 2");
    const view = await settings(PAGE);
    await view.openSeo();
    expect(view.field("Canonical URL")?.type).toBe("url");
    // W-286: EmDash prints "noindex, nofollow", so the helper names both.
    expect(view.host.querySelector("[data-emvb-noindex-help]")?.textContent?.trim()).toBe(
      "Search engines are asked not to list this page or follow its links (noindex, nofollow).",
    );
    await view.type("Canonical URL", "https://example.com/original");
    const toggle = view.host.querySelector<HTMLElement>('[role="switch"]');
    await act(async () => toggle?.click());
    expect(view.sent).toEqual([
      { seoCanonical: "https://example.com/original" },
      { seoNoIndex: true },
    ]);
  });

  test("W-287: Social image uses the media picker, keeps only the URL, and can be removed", async () => {
    const fetcher: Fetcher = async () =>
      new Response(JSON.stringify({ data: { items: [] } }), { status: 200 });
    const none = await settings(PAGE);
    await none.openSeo();
    expect(none.host.querySelector("[data-emvb-seo-image]")).toBeNull();
    const view = await settings(PAGE, "page", fetcher);
    await view.openSeo();
    const box = view.host.querySelector("[data-emvb-seo-image]");
    expect(box?.querySelector(".emvb-field-label")?.textContent).toBe("Social image");
    const url = box?.querySelector<HTMLInputElement>("[data-emvb-media-url]");
    if (!url) throw new Error("no URL field");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        url,
        "https://cdn.example.com/og.png",
      );
      url.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      url.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(view.sent).toEqual([{ seoImage: "https://cdn.example.com/og.png" }]);
    const set = await settings(
      { ...PAGE, seoImage: "/_emdash/api/media/file/og.png" },
      "page",
      fetcher,
    );
    expect(set.host.querySelector('[data-emvb-section="seo"]')?.textContent).toBe("SEO · 1");
    await set.openSeo();
    const remove = [...set.host.querySelectorAll("button")].find(
      (b) => b.textContent === "Remove social image",
    );
    await act(async () => remove?.click());
    expect(set.sent).toEqual([{ seoImage: "" }]);
  });

  test("W-284: a canonical that isn't a full http(s) address says it won't be saved", async () => {
    const view = await settings({ ...PAGE, seoCanonical: "/about" });
    await view.openSeo();
    expect(view.host.textContent).toContain("Not saved: use a full address starting with https://");
    const fine = await settings({ ...PAGE, seoCanonical: "https://example.com/about" });
    await fine.openSeo();
    expect(fine.host.textContent?.includes("Not saved")).toBe(false);
  });
});

describe("theme part settings (W-091)", () => {
  test("a popup shows its type, sends title changes, and has Triggers", async () => {
    const view = await settings({ ...PAGE, title: "Offer", partType: "popup" }, "theme-part");
    expect(view.field("Type")?.value).toBe("Popup");
    expect(view.field("Type")?.disabled).toBe(true);
    await view.type("Title", "Spring offer");
    expect(view.sent).toEqual([{ title: "Spring offer" }]);
    expect(view.host.querySelector('[data-emvb-panel="triggers"]')).not.toBeNull();
    expect(view.host.querySelector('[data-emvb-panel="conditions"]')).not.toBeNull();
  });

  test("a float offers a place and a close button, and no Triggers", async () => {
    const view = await settings(
      {
        ...PAGE,
        partType: "float",
        float: { schemaVersion: 1, edge: "top", dismiss: false },
      },
      "theme-part",
    );
    expect(view.field("Type")?.value).toBe("Float");
    expect(view.host.querySelector('[data-emvb-panel="float"]') !== null).toBe(true);
    expect(view.host.querySelector('[data-emvb-panel="triggers"]') !== null).toBe(false);
    expect(view.host.textContent?.includes("Top bar")).toBe(true);
    expect(view.host.textContent?.includes("Close button")).toBe(true);
  });

  test("a footer has conditions but no Triggers", async () => {
    const view = await settings({ ...PAGE, partType: "footer" }, "theme-part");
    expect(view.field("Type")?.value).toBe("Footer");
    expect(view.host.querySelector('[data-emvb-panel="triggers"]')).toBeNull();
    expect(view.host.querySelector('[data-emvb-panel="conditions"]')).not.toBeNull();
  });

  test("changing a condition sends it as a conditions patch", async () => {
    const view = await settings({ ...PAGE, partType: "footer" }, "theme-part");
    const add = [...view.host.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Add Exclude",
    );
    await act(async () => add?.click());
    expect(view.sent.map((patch) => Object.keys(patch))).toEqual([["conditions"]]);
  });
});

describe("switching between page and theme-part settings (W-092)", () => {
  const view = (kind: "page" | "theme-part") => (
    <PageSettings page={PAGE} slugError={null} kind={kind} onChange={() => undefined} />
  );
  const panel = () =>
    document.querySelector("[data-emvb-panel]")?.getAttribute("data-emvb-panel") ?? null;
  const metaTitleShown = () =>
    [...document.querySelectorAll("label")].some((l) => l.textContent?.trim() === "Meta title");

  test("a mounted panel can change from theme-part to page and back without breaking", async () => {
    await mount(view("theme-part"));
    expect(panel()).toBe("theme-part-settings");
    await rerender(view("page"));
    expect(panel()).toBe("page-settings");
    expect(document.querySelector('[data-emvb-section="seo"]')?.textContent).toBe("SEO");
    await rerender(view("theme-part"));
    expect(panel()).toBe("theme-part-settings");
  });

  test("the hook runs on every render, so an open SEO section stays open across a switch", async () => {
    await mount(view("page"));
    await act(async () =>
      document.querySelector<HTMLElement>('[data-emvb-section="seo"]')?.click(),
    );
    await settle();
    expect(metaTitleShown()).toBe(true);
    await rerender(view("theme-part"));
    await rerender(view("page"));
    await settle();
    expect(metaTitleShown()).toBe(true);
  });
});
