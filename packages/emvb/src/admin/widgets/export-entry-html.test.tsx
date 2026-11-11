import { afterEach, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";
import { emptyDesign, LAYOUT_SCHEMA_VERSION } from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { ExportDialog } from "../pages/ExportDialog.tsx";
import { ExportEntryHtml } from "./ExportEntryHtml.tsx";

afterEach(cleanup);

const layout = (text: string) => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "head0001", type: "heading", props: { text, level: 1 } }],
  },
});

/** W-977: a site whose `posts` carry a canvas field. */
const postsSite: Fetcher = async (path) => {
  if (path === "/_emdash/api/schema/collections")
    return Response.json({ data: { items: [{ slug: "posts", label: "Posts" }] } });
  if (path.startsWith("/_emdash/api/schema/collections/posts"))
    return Response.json({
      data: {
        item: {
          slug: "posts",
          urlPattern: "/blog/{slug}",
          fields: [{ slug: "canvas", type: "json", widget: "emvb:canvas" }],
        },
      },
    });
  if (path.startsWith("/_emdash/api/content/posts"))
    return Response.json({
      data: {
        items: [
          {
            id: "e1",
            slug: "hello",
            status: "published",
            data: { title: "Hello", canvas: layout("Hi") },
          },
          {
            id: "e2",
            slug: "soon",
            status: "draft",
            data: { title: "Soon", canvas: layout("Soon") },
          },
        ],
      },
    });
  if (path.startsWith("/_emdash/api/content/")) return Response.json({ data: { items: [] } });
  if (path.includes("/design/")) return Response.json({ data: { design: emptyDesign() } });
  return Response.json({ error: { code: "NOT_FOUND", message: path } }, { status: 404 });
};

const waitFor = async (selector: string) => {
  for (let i = 0; i < 30 && !document.querySelector(selector); i += 1)
    // oxlint-disable-next-line no-await-in-loop -- waits for the export to finish
    await settle();
};

test("W-977: Export HTML on the Canvas card downloads the entry's published layout", async () => {
  const created = spyOn(URL, "createObjectURL").mockImplementation(() => "blob:zip");
  const clicked = spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  try {
    await mount(
      <ExportEntryHtml
        fetcher={postsSite}
        entry={{ collection: "posts", id: "e1" }}
        origin="https://s.test"
      />,
    );
    const button = document.querySelector<HTMLButtonElement>("[data-emvb-export-entry]");
    await act(async () => button?.click());
    await waitFor("[data-emvb-export-entry-status]");
    expect(document.querySelector('[data-emvb-export-entry-status="done"]')?.textContent).toContain(
      "Downloaded the published layout",
    );
    const blob = created.mock.calls[0]?.[0] as Blob | undefined;
    expect(blob?.type).toBe("application/zip");
    expect(clicked).toHaveBeenCalledTimes(1);
  } finally {
    created.mockRestore();
    clicked.mockRestore();
  }
});

test("W-977: an entry with no published layout says to publish it first", async () => {
  await mount(
    <ExportEntryHtml
      fetcher={postsSite}
      entry={{ collection: "posts", id: "e2" }}
      origin="https://s.test"
    />,
  );
  const button = document.querySelector<HTMLButtonElement>("[data-emvb-export-entry]");
  await act(async () => button?.click());
  await waitFor("[data-emvb-export-entry-status]");
  expect(document.querySelector('[data-emvb-export-entry-status="error"]')?.textContent).toContain(
    "Publish it first",
  );
});

test("W-977: Export pages offers your collections with a canvas field", async () => {
  await mount(<ExportDialog fetcher={postsSite} open onOpenChange={() => undefined} pages={[]} />);
  await waitFor("[data-emvb-export-from]");
  expect(document.body.textContent).toContain("Export from");
  expect(document.body.textContent).toContain("EmVB pages");
});
