import { afterEach, expect, spyOn, test } from "bun:test";
import { act } from "react";
import type { Layout } from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";
import { ImportElementorDialog } from "./ImportElementorDialog.tsx";

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
