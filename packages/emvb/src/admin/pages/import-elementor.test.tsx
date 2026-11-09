import { afterEach, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { emptyDesign, type Layout } from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";
import { ImportElementorDialog, fileNameOf } from "./ImportElementorDialog.tsx";

let restoreNavigation: () => void = () => undefined;
afterEach(async () => {
  await cleanup();
  restoreNavigation();
});

type Posted = { data: { title: string; layout: Layout; part_type?: string }; slug: string };

const page = JSON.stringify({
  version: "0.4",
  title: "Old landing",
  type: "page",
  content: [
    {
      id: "h",
      elType: "widget",
      widgetType: "heading",
      settings: { title: "Hello from Elementor", header_size: "h1" },
    },
    { id: "s", elType: "widget", widgetType: "shortcode", settings: { shortcode: "[gallery]" } },
    {
      id: "b",
      elType: "widget",
      widgetType: "button",
      settings: { text: "Go", selected_icon: { value: "fas fa-arrow-right", library: "fa-solid" } },
    },
  ],
});

async function open(target: "page" | "part") {
  const posted: Posted[] = [];
  const navigation = spyOn(window.location, "assign").mockImplementation(() => undefined);
  restoreNavigation = () => navigation.mockRestore();
  const fetcher: Fetcher = async (_path, init) => {
    posted.push(JSON.parse(String(init?.body)) as Posted);
    return Response.json({ data: { item: { id: "made-1" } } }, { status: 201 });
  };
  await mount(
    <ImportElementorDialog fetcher={fetcher} open onOpenChange={() => undefined} target={target} />,
  );
  await settle();
  return { posted, navigation };
}

async function paste(value: string) {
  const area = document.getElementById("emvb-elementor-json");
  if (!(area instanceof HTMLTextAreaElement)) throw new Error("JSON box is missing");
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

async function typeTitle(value: string) {
  const input = field("Title");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  const form = document.querySelector<HTMLFormElement>('[data-emvb-dialog="import-elementor"]');
  if (!form) throw new Error("Import form is missing");
  await act(async () => form.requestSubmit());
  await settle();
  // Creating waits for the icon set, which loads as a separate chunk.
  for (let i = 0; i < 50 && !document.querySelector('[role="alert"]'); i++) {
    // oxlint-disable-next-line no-await-in-loop -- polls until the create settles
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    if ((window.location.assign as unknown as { mock: { calls: unknown[] } }).mock.calls.length > 0)
      break;
  }
}

const report = () => document.querySelector("[data-emvb-import-report]")?.textContent ?? "";

test("W-945: a pasted export shows its report, fills the title and creates the page", async () => {
  const { posted, navigation } = await open("page");
  await paste(page);
  expect(report()).toContain("Ready to import 2 of 3 Elementor elements.");
  expect(report()).toContain("Left out (1)");
  expect(report()).toContain("The shortcode [gallery] needs WordPress and was left out.");
  expect(field("Title").value).toBe("Old landing");
  expect(field("Slug").value).toBe("old-landing");
  await submit();
  expect(posted).toHaveLength(1);
  expect(posted[0]?.slug).toBe("old-landing");
  const layout = JSON.stringify(posted[0]?.data.layout);
  expect(layout).toContain("Hello from Elementor");
  // The editor's Font Awesome set turns the button's icon into stored SVG.
  expect(layout).toContain('"iconId":"fa-solid:arrow-right"');
  expect(layout).toContain("<svg");
  expect(navigation.mock.calls[0]?.[0]).toBe("/_emdash/admin/plugins/emvb/editor?entry=made-1");
});

test("W-945: a title the person typed is kept when the export changes", async () => {
  const { posted } = await open("page");
  await typeTitle("My own title");
  await paste(page);
  expect(field("Title").value).toBe("My own title");
  await submit();
  expect(posted[0]?.data.title).toBe("My own title");
});

test("W-945: input that isn't an export says why and creates nothing", async () => {
  const { posted } = await open("page");
  await paste("{not json");
  expect(document.querySelector("[data-emvb-import-error]")?.textContent).toContain(
    "isn't valid JSON",
  );
  await typeTitle("Anything");
  await submit();
  expect(posted).toHaveLength(0);
  const alerts = [...document.querySelectorAll('[role="alert"]')].map((el) => el.textContent ?? "");
  expect(alerts.some((t) => t.startsWith("Couldn't create the page. This isn't valid JSON"))).toBe(
    true,
  );
});

test("W-945: a header template becomes a header theme part", async () => {
  const { posted, navigation } = await open("part");
  await paste(
    JSON.stringify({
      version: "0.4",
      title: "Site header",
      type: "header",
      content: [{ id: "h", elType: "widget", widgetType: "heading", settings: { title: "Brand" } }],
    }),
  );
  expect(report()).toContain("as a header.");
  expect(field("Slug").value).toBe("header-site-header");
  await submit();
  expect(posted[0]?.data.part_type).toBe("header");
  expect(JSON.stringify(posted[0]?.data.layout)).toContain("Brand");
  expect(navigation.mock.calls[0]?.[0]).toBe(
    "/_emdash/admin/plugins/emvb/editor?entry=made-1&collection=emvb_theme_parts",
  );
});

const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" stroke="currentColor"/></svg>';
const svgUrl = (name: string) => `https://old.example/wp-content/uploads/${name}`;
const svgPage = JSON.stringify({
  title: "Contact",
  content: ["icone-telephone.svg", "Ic%C3%B4ne%20courriel.svg"].map((name, i) => ({
    id: `s${i}`,
    elType: "e-svg",
    settings: {
      svg: {
        $$type: "svg-src",
        value: { id: { $$type: "image-attachment-id", value: 30 + i }, url: svgUrl(name) },
      },
    },
    elements: [],
  })),
});
const svgRow = () => document.querySelector("[data-emvb-import-svgs]")?.textContent ?? "";
const button = (name: string) => {
  const found = [...document.querySelectorAll("button")].find((b) => b.textContent === name);
  if (!found) throw new Error(`${name} button is missing`);
  return found;
};

test("W-951: SVG files added in the dialog are matched by name and import as icons", async () => {
  const { posted } = await open("page");
  await paste(svgPage);
  expect(svgRow()).toContain("2 SVG files can become icons you can recolour.");
  const input = document.querySelector<HTMLInputElement>("[data-emvb-elementor-svgs]");
  if (!input) throw new Error("SVG file input is missing");
  const files = [
    new File([ICON_SVG], "ICONE-TELEPHONE.svg", { type: "image/svg+xml" }),
    new File([ICON_SVG], "Icône courriel.svg", { type: "image/svg+xml" }),
    new File([ICON_SVG], "unrelated.svg", { type: "image/svg+xml" }),
  ];
  Object.defineProperty(input, "files", { value: files, configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
  expect(svgRow()).toContain(
    "Added 2 SVG files. Not used (not in this export, or over 64 KB): unrelated.svg.",
  );
  await submit();
  const layout = JSON.stringify(posted[0]?.data.layout);
  expect(layout).toContain('"iconId":"file:icone-telephone"');
  expect(layout).toContain("currentColor");
  expect(layout).not.toContain('"type":"image"');
});

test("W-951: Fetch SVG files reads what the old site allows and says what it didn't", async () => {
  const fetched: { url: string; credentials: RequestCredentials | undefined }[] = [];
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const url = String(input);
    fetched.push({ url, credentials: init?.credentials });
    if (url.endsWith("icone-telephone.svg")) return new Response(ICON_SVG);
    throw new TypeError("Failed to fetch");
  }) as typeof fetch);
  try {
    const { posted } = await open("page");
    await paste(svgPage);
    await act(async () => button("Fetch SVG files").click());
    await settle();
    expect(fetched.map((f) => f.url)).toEqual([
      svgUrl("icone-telephone.svg"),
      svgUrl("Ic%C3%B4ne%20courriel.svg"),
    ]);
    expect(fetched.every((f) => f.credentials === "omit")).toBe(true);
    expect(svgRow()).toContain("Fetched 1 of 2. Your old site didn't allow the rest");
    await submit();
    const layout = JSON.stringify(posted[0]?.data.layout);
    expect(layout).toContain('"iconId":"file:icone-telephone"');
    // The one that couldn't be read stays an image.
    expect(layout).toContain('"type":"image"');
  } finally {
    fetchSpy.mockRestore();
  }
});

test("W-951: export addresses match chosen files by their decoded, case-free name", () => {
  expect(fileNameOf("https://x.test/a/Ic%C3%B4ne%20Courriel.svg?v=2#x")).toBe("icône courriel.svg");
  expect(fileNameOf("https://x.test/a/%E0%A4%A.svg")).toBe("%e0%a4%a.svg");
});

test("W-958: links to WordPress pages go where the person says, and are remembered", async () => {
  localStorage.removeItem("emvb-elementor-page-links");
  const posted: Posted[] = [];
  const navigation = spyOn(window.location, "assign").mockImplementation(() => undefined);
  restoreNavigation = () => navigation.mockRestore();
  const fetcher: Fetcher = async (path, init) => {
    if (!init?.method || init.method === "GET") {
      expect(String(path)).toContain("/_emdash/api/content/emvb_pages?");
      return Response.json({
        data: { items: [{ id: "p1", slug: "products", data: { title: "Products" } }] },
      });
    }
    posted.push(JSON.parse(String(init.body)) as Posted);
    return Response.json({ data: { item: { id: "made-1" } } }, { status: 201 });
  };
  await mount(
    <ImportElementorDialog fetcher={fetcher} open onOpenChange={() => undefined} target="page" />,
  );
  await settle();
  const linked = (id: number) => ({
    id: `b${id}`,
    elType: "e-button",
    settings: {
      text: { $$type: "string", value: `Go ${id}` },
      link: {
        $$type: "link",
        value: { destination: { $$type: "query", value: { id: { $$type: "number", value: id } } } },
      },
    },
    elements: [],
  });
  await paste(JSON.stringify({ title: "Accueil", content: [linked(43), linked(42)] }));
  await settle();
  const options = [...document.querySelectorAll("datalist option")].map((o) =>
    o.getAttribute("value"),
  );
  expect(options).toEqual(["/products"]);
  const field43 = field("WordPress page 43");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
      field43,
      "/products",
    );
    field43.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const field42 = field("WordPress page 42");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
      field42,
      "javascript:alert(1)",
    );
    field42.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(document.body.textContent).toContain("Enter an address such as /contact.");
  await submit();
  const layout = JSON.stringify(posted[0]?.data.layout);
  expect(layout).toContain('"href":"/products"');
  expect(layout).not.toContain("javascript");
  expect(JSON.parse(localStorage.getItem("emvb-elementor-page-links") ?? "{}")).toMatchObject({
    "43": "/products",
  });
  localStorage.removeItem("emvb-elementor-page-links");
});

test("W-958: Copy images puts old-site images in the media library and the page uses the copies", async () => {
  const uploads: string[] = [];
  const posted: Posted[] = [];
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
  const fetched: { url: string; credentials: RequestCredentials | undefined }[] = [];
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const url = String(input);
    fetched.push({ url, credentials: init?.credentials });
    if (url.endsWith("hero.jpg"))
      return new Response(new Blob(["jpg"], { type: "image/jpeg" }), { status: 200 });
    if (url.endsWith("scan.webp"))
      return new Response(new Blob(["<p>"], { type: "text/html" }), { status: 200 });
    throw new TypeError("Failed to fetch");
  }) as typeof fetch);
  try {
    await mount(
      <ImportElementorDialog fetcher={fetcher} open onOpenChange={() => undefined} target="page" />,
    );
    await settle();
    const image = (name: string) => ({
      id: name.replace(/\W/g, ""),
      elType: "e-image",
      settings: {
        image: {
          $$type: "image",
          value: {
            src: {
              $$type: "image-src",
              value: {
                url: { $$type: "url", value: `https://old.example/wp-content/uploads/${name}` },
              },
            },
          },
        },
      },
      elements: [],
    });
    await paste(
      JSON.stringify({
        title: "Gallery",
        content: [image("hero.jpg"), image("Team%20Photo.png"), image("scan.webp")],
      }),
    );
    const row = () => document.querySelector("[data-emvb-import-images]")?.textContent ?? "";
    expect(row()).toContain("3 images load from your old site.");
    await act(async () => button("Copy images").click());
    for (let i = 0; i < 20 && !row().includes("Copied"); i++) {
      // oxlint-disable-next-line no-await-in-loop -- waits for the copies to finish
      await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    }
    expect(row()).toContain("Copied 1 of 3.");
    expect(fetched.every((f) => f.credentials === "omit")).toBe(true);
    expect(uploads).toEqual(["hero.jpg"]);

    const input = document.querySelector<HTMLInputElement>("[data-emvb-elementor-images]");
    if (!input) throw new Error("image file input is missing");
    Object.defineProperty(input, "files", {
      value: [
        new File(["png"], "team photo.png", { type: "image/png" }),
        new File(["x"], "notes.txt", { type: "text/plain" }),
      ],
      configurable: true,
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    for (let i = 0; i < 20 && uploads.length < 2; i++) {
      // oxlint-disable-next-line no-await-in-loop -- waits for the upload
      await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    }
    await settle();
    expect(row()).toContain("Copied 1 image to the media library. Not used");
    expect(row()).toContain("notes.txt");
    await submit();
    const layout = JSON.stringify(posted[0]?.data.layout);
    expect(layout).toContain('"src":"/_emdash/api/media/file/hero.jpg"');
    expect(layout).toContain('"mediaId":"m-hero.jpg"');
    expect(layout).toContain('"mediaId":"m-team photo.png"');
    // The one that couldn't be copied still loads from the old site.
    expect(layout).toContain("https://old.example/wp-content/uploads/scan.webp");
  } finally {
    fetchSpy.mockRestore();
  }
});

test("W-958: with Add Elementor's classes on, classes join the site without changing one", async () => {
  const atomic = (await import("../../../test/fixtures/elementor/atomic-page.json")).default;
  const posted: Posted[] = [];
  const savedDesigns: {
    design: { classes: { id: string; name: string; style: unknown }[] };
    revision: string | null;
  }[] = [];
  const navigation = spyOn(window.location, "assign").mockImplementation(() => undefined);
  restoreNavigation = () => navigation.mockRestore();
  const mine = { id: "acme-title", name: "acme-title", style: { color: "#000000" } };
  const fetcher: Fetcher = async (path, init) => {
    const url = String(path);
    if (url.endsWith("/design/draft"))
      return Response.json({
        data: { design: { ...emptyDesign(), classes: [mine] }, revision: "r1" },
      });
    if (url.endsWith("/design/save")) {
      savedDesigns.push(JSON.parse(String(init?.body)) as (typeof savedDesigns)[number]);
      return Response.json({ data: { revision: "r2" } });
    }
    posted.push(JSON.parse(String(init?.body)) as Posted);
    return Response.json({ data: { item: { id: "made-1" } } }, { status: 201 });
  };
  await mount(
    <ImportElementorDialog fetcher={fetcher} open onOpenChange={() => undefined} target="page" />,
  );
  await settle();
  await paste(JSON.stringify({ ...atomic, title: "Classes" }));
  const box = [...document.querySelectorAll("label")].find((l) =>
    l.textContent?.includes("Add Elementor's classes to my site's classes"),
  );
  const toggle = box?.querySelector<HTMLElement>("button, input");
  if (!toggle) throw new Error("classes checkbox is missing");
  expect(toggle.getAttribute("aria-checked") ?? String((toggle as HTMLInputElement).checked)).toBe(
    "false",
  );
  await act(async () => toggle.click());
  await settle();
  await submit();
  expect(savedDesigns).toHaveLength(1);
  expect(savedDesigns[0]?.revision).toBe("r1");
  const classes = savedDesigns[0]?.design.classes ?? [];
  // The site's own class is untouched; the import's look is added as a numbered copy.
  expect(classes[0]).toEqual(mine);
  const copy = classes.find((c) => c.name === "acme-title 2");
  expect(copy).toBeDefined();
  const layout = JSON.stringify(posted[0]?.data.layout);
  expect(layout).toContain(`"classes":["${copy?.id}"]`);
  expect(layout).not.toContain('"classes":["acme-title"]');
});
