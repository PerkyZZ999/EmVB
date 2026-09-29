import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Fetcher } from "../api.ts";
import { PageList } from "./PageList.tsx";
import { ThemePartList } from "./ThemePartList.tsx";

let root: Root | undefined;
let host: HTMLElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

const replying =
  (reply: () => Response): Fetcher =>
  async () =>
    reply();
const items = (list: unknown[]) => () =>
  new Response(JSON.stringify({ data: { items: list } }), { status: 200 });
const broken = () =>
  new Response(JSON.stringify({ error: { code: "BOOM", message: "Database offline" } }), {
    status: 500,
  });

const formatted = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );

/** The rendered list with each <time>'s text checked against the locale format, then elided. */
function html() {
  for (const time of host.querySelectorAll("time")) {
    const iso = time.getAttribute("datetime") ?? "";
    expect(time.textContent).toBe(iso ? formatted(iso) : "");
  }
  return host.innerHTML.replace(/(<time[^>]*>)[^<]*(<\/time>)/g, "$1…$2");
}

async function mount(element: React.ReactElement) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(element);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const pages = [
  {
    id: "01A",
    slug: "about",
    status: "published",
    updatedAt: "2026-09-01T10:00:00.000Z",
    data: { title: "About" },
  },
  { id: "01B", slug: "draft-one", status: "draft", updatedAt: "", data: { title: "" } },
];

const parts = [
  {
    id: "01H",
    slug: "header-main",
    status: "published",
    updatedAt: "2026-09-02T08:30:00.000Z",
    data: {
      title: "Main header",
      part_type: "header",
      conditions: {
        schemaVersion: 1,
        rules: [{ id: "r1", op: "include", group: "general", name: "entire_site", args: {} }],
      },
    },
  },
  {
    id: "01P",
    slug: "popup-x",
    status: "draft",
    updatedAt: "",
    data: { title: "Promo", part_type: "popup" },
  },
];

// Snapshots were recorded from the lists before W-086 M4 shared their pieces.
describe("PageList", () => {
  for (const [name, reply] of [
    ["rows", items(pages)],
    ["empty", items([])],
    ["error", broken],
  ] as const) {
    test(`renders ${name}`, async () => {
      await mount(<PageList fetcher={replying(reply)} />);
      expect(html()).toMatchSnapshot();
    });
  }
});

describe("ThemePartList", () => {
  for (const [name, reply] of [
    ["rows", items(parts)],
    ["empty", items([])],
    ["error", broken],
  ] as const) {
    test(`renders ${name}`, async () => {
      await mount(<ThemePartList fetcher={replying(reply)} />);
      expect(html()).toMatchSnapshot();
    });
  }

  test("filters by type and shows the filter's empty state", async () => {
    await mount(<ThemePartList fetcher={replying(items(parts))} />);
    const tab = (label: string) =>
      [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
        (t) => t.textContent === label,
      );
    await act(async () => tab("Popups")?.click());
    expect(html()).toMatchSnapshot();
    await act(async () => tab("Footers")?.click());
    expect(html()).toMatchSnapshot();
  });
});
