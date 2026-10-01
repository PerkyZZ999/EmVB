import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { PageDraft } from "../../content-api.ts";
import { cleanup, mount, settle } from "../../../../test/dom/mount.ts";
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

async function settings(page: PageDraft, kind: "page" | "theme-part" = "page") {
  const sent: PagePatch[] = [];
  const host = await mount(
    <PageSettings
      page={page}
      slugError={null}
      kind={kind}
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
