import { afterEach, expect, spyOn, test } from "bun:test";
import { act } from "react";
import type { Layout } from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { cleanup, mount, rerender, settle } from "../../../test/dom/mount.ts";
import { NewPageDialog } from "./NewPageDialog.tsx";

let restoreNavigation: () => void = () => undefined;
afterEach(async () => {
  await cleanup();
  restoreNavigation();
});

const template: Layout = {
  schemaVersion: 17,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "head0001", type: "heading", props: { text: "Template heading", level: 1 } }],
  },
};

async function choose(label: string) {
  const trigger = document.querySelector<HTMLElement>('[role="combobox"]');
  if (!trigger) throw new Error("Page template selector is missing");
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    trigger.click();
  });
  await settle();
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (item) => item.textContent === label,
  );
  if (!option) throw new Error(`Page template option is missing: ${label}`);
  await act(async () => option.click());
  await settle();
}

async function title(value: string) {
  const label = [...document.querySelectorAll("label")].find(
    (item) => item.textContent === "Title",
  );
  const input = label?.htmlFor ? document.getElementById(label.htmlFor) : null;
  if (!(input instanceof HTMLInputElement)) throw new Error("Page title is missing");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  const form = document.querySelector<HTMLFormElement>('[data-emvb-dialog="new-page"]');
  if (!form) throw new Error("New page form is missing");
  await act(async () => form.requestSubmit());
  await settle();
}

const listedTemplate = {
  id: "template-one",
  slug: "template-one",
  status: "draft",
  data: { title: "Landing template", part_type: "page_template" },
};

async function open(
  details: () => Promise<Response>,
  catalog: () => Promise<Response> = async () =>
    Response.json({ data: { items: [listedTemplate] } }),
) {
  const posted: { data: { title: string; layout: Layout }; slug: string }[] = [];
  const navigation = spyOn(window.location, "assign").mockImplementation(() => undefined);
  restoreNavigation = () => navigation.mockRestore();
  const fetcher: Fetcher = async (path, init) => {
    if (init?.method === "POST") {
      posted.push(JSON.parse(String(init.body)) as (typeof posted)[number]);
      return Response.json({ data: { item: { id: "new-page" } } }, { status: 201 });
    }
    if (path.endsWith("/template-one")) return details();
    return catalog();
  };
  await mount(<NewPageDialog open fetcher={fetcher} onOpenChange={() => undefined} />);
  await settle();
  await choose("Landing template");
  await title("New page title");
  return { posted, navigation, fetcher };
}

for (const failure of ["missing", "invalid", "offline"] as const) {
  test(`W-711: an unavailable ${failure} template never silently creates a blank page`, async () => {
    const { posted, navigation } = await open(async () => {
      if (failure === "offline") throw new TypeError("Failed to fetch");
      return failure === "missing"
        ? Response.json({ error: { message: "Gone" } }, { status: 404 })
        : Response.json({
            data: { item: { data: { part_type: "page_template", layout: "broken" } } },
          });
    });
    await submit();
    expect(posted.length).toBe(0);
    expect(navigation.mock.calls.length).toBe(0);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "The selected page template couldn't be loaded",
    );
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("choose Blank page");
    await choose("Blank page");
    await submit();
    expect(posted.length).toBe(1);
    expect(JSON.stringify(posted[0]?.data.layout)).toContain("New page title");
  });
}

test("W-711: retrying a template failure uses the recovered template and keeps the title", async () => {
  let available = false;
  const { posted } = await open(async () =>
    available
      ? Response.json({
          data: { item: { data: { part_type: "page_template", layout: template } } },
        })
      : Response.json({ error: { message: "Busy" } }, { status: 503 }),
  );
  await submit();
  expect(posted.length).toBe(0);
  available = true;
  await submit();
  expect(posted.length).toBe(1);
  expect(posted[0]?.data.title).toBe("New page title");
  expect(JSON.stringify(posted[0]?.data.layout)).toContain("Template heading");
  expect(posted[0]?.data.layout.root.id === template.root.id).toBe(false);
});

for (const refresh of ["empty", "offline", "replaced"] as const) {
  test(`W-712: catalog refresh (${refresh}) keeps the selected template changeable`, async () => {
    let refreshed = false;
    const { fetcher, posted } = await open(
      async () => Response.json({ error: { message: "Gone" } }, { status: 404 }),
      async () => {
        if (!refreshed) return Response.json({ data: { items: [listedTemplate] } });
        if (refresh === "offline") throw new TypeError("Failed to fetch");
        return Response.json({
          data: {
            items:
              refresh === "empty"
                ? []
                : [
                    {
                      ...listedTemplate,
                      id: "template-two",
                      data: { title: "Another template", part_type: "page_template" },
                    },
                  ],
          },
        });
      },
    );
    expect(document.querySelector('[role="combobox"]')?.textContent).toContain("Landing template");
    await rerender(<NewPageDialog open={false} fetcher={fetcher} onOpenChange={() => undefined} />);
    refreshed = true;
    await rerender(<NewPageDialog open fetcher={fetcher} onOpenChange={() => undefined} />);
    await settle();
    const selector = document.querySelector('[role="combobox"]');
    expect(selector !== null).toBe(true);
    expect(selector?.textContent).toContain("Previously selected template");
    await choose("Previously selected template");
    await choose("Blank page");
    await submit();
    expect(posted.length).toBe(1);
    expect(JSON.stringify(posted[0]?.data.layout)).toContain("New page title");
  });
}
