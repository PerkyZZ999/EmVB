import { afterEach, expect, spyOn, test } from "bun:test";
import { act } from "react";
import type { Layout } from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";
import { ImportHtmlDialog } from "./ImportHtmlDialog.tsx";

let restoreNavigation: () => void = () => undefined;
afterEach(async () => {
  await cleanup();
  restoreNavigation();
});

type Posted = { data: { title: string; layout: Layout; part_type?: string }; slug: string };

const post = [
  '<!-- wp:heading {"level":1} --><h1>Spring menu</h1><!-- /wp:heading -->',
  "<!-- wp:paragraph --><p>Our new <strong>seasonal</strong> dishes.</p><!-- /wp:paragraph -->",
  '<!-- wp:image --><figure class="wp-block-image"><img src="https://old.example/wp-content/uploads/dish.jpg" alt="A dish"/></figure><!-- /wp:image -->',
  "<!-- wp:latest-posts /-->",
].join("\n");

async function open(target: "page" | "part") {
  const posted: Posted[] = [];
  const uploads: string[] = [];
  const navigation = spyOn(window.location, "assign").mockImplementation(() => undefined);
  restoreNavigation = () => navigation.mockRestore();
  const fetcher: Fetcher = async (path, init) => {
    if (String(path) === "/_emdash/api/media" && init?.body instanceof FormData) {
      const file = init.body.get("file") as File;
      uploads.push(file.name);
      return Response.json({
        data: { item: { id: `m-${file.name}`, url: `/_emdash/api/media/file/${file.name}` } },
      });
    }
    posted.push(JSON.parse(String(init?.body)) as Posted);
    return Response.json({ data: { item: { id: "made-1" } } }, { status: 201 });
  };
  await mount(
    <ImportHtmlDialog fetcher={fetcher} open onOpenChange={() => undefined} target={target} />,
  );
  await settle();
  return { posted, navigation, uploads };
}

async function paste(value: string) {
  const area = document.getElementById("emvb-import-html");
  if (!(area instanceof HTMLTextAreaElement)) throw new Error("HTML box is missing");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(area, value);
    area.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

const field = (name: string) => {
  const label = [...document.querySelectorAll("label")].find((l) => l.textContent === name);
  const input = label?.htmlFor ? document.getElementById(label.htmlFor) : null;
  if (!(input instanceof HTMLInputElement)) throw new Error(`${name} is missing`);
  return input;
};

async function submit() {
  const form = document.querySelector<HTMLFormElement>('[data-emvb-dialog="import-html"]');
  if (!form) throw new Error("Import form is missing");
  await act(async () => form.requestSubmit());
  await settle();
}

const report = () => document.querySelector("[data-emvb-import-report]")?.textContent ?? "";

test("W-1074: pasted WordPress blocks show the report, fill the title and create a draft page", async () => {
  const { posted, navigation } = await open("page");
  await paste(post);
  expect(report()).toContain("Ready to import 3 of 4 WordPress blocks.");
  expect(report()).toContain("Left out (1)");
  expect(report()).toContain("WordPress builds this when the page is shown");
  expect(field("Title").value).toBe("Spring menu");
  expect(field("Slug").value).toBe("spring-menu");
  await submit();
  expect(posted).toHaveLength(1);
  const layout = JSON.stringify(posted[0]?.data.layout);
  expect(layout).toContain('"text":"Our new seasonal dishes."');
  expect(layout).toContain('"bold":true');
  expect(navigation.mock.calls[0]?.[0]).toBe("/_emdash/admin/plugins/emvb/editor?entry=made-1");
});

test("W-1074: a plain HTML page becomes a theme part of the chosen type", async () => {
  const { posted, navigation } = await open("part");
  await paste("<title>Promo</title><section><h2>Sale</h2><p>Half price.</p></section>");
  expect(report()).toContain("Ready to import 2 of 2 HTML elements as a section.");
  expect(field("Slug").value).toBe("section-promo");
  await submit();
  expect(posted[0]?.data.part_type).toBe("section");
  expect(JSON.stringify(posted[0]?.data.layout)).toContain("Half price.");
  expect(navigation.mock.calls[0]?.[0]).toBe(
    "/_emdash/admin/plugins/emvb/editor?entry=made-1&collection=emvb_theme_parts",
  );
});

test("W-1074: input with nothing to import says why and creates nothing", async () => {
  const { posted } = await open("page");
  await paste("<script>alert(1)</script>");
  expect(document.querySelector("[data-emvb-import-error]")?.textContent).toContain(
    "Nothing in this HTML could be imported",
  );
  await submit();
  expect(posted).toHaveLength(0);
});

test("W-1074: Copy images puts the post's images in the media library and the page uses them", async () => {
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    (async () =>
      new Response(new Blob(["jpg"], { type: "image/jpeg" }), {
        status: 200,
      })) as unknown as typeof fetch,
  );
  try {
    const { posted, uploads } = await open("page");
    await paste(post);
    const copy = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Copy images",
    );
    if (!copy) throw new Error("Copy images is missing");
    await act(async () => copy.click());
    for (let i = 0; i < 50 && uploads.length === 0; i++) {
      // oxlint-disable-next-line no-await-in-loop -- waits for the copies to finish
      await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    }
    await settle();
    expect(uploads).toEqual(["dish.jpg"]);
    expect(document.querySelector("[data-emvb-import-images]")?.textContent).toContain(
      "Copied 1 image to the media library.",
    );
    await submit();
    const layout = JSON.stringify(posted[0]?.data.layout);
    expect(layout).toContain('"src":"/_emdash/api/media/file/dish.jpg"');
    expect(layout).toContain('"mediaId":"m-dish.jpg"');
  } finally {
    fetchSpy.mockRestore();
  }
});
