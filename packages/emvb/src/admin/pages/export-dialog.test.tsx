import { afterEach, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";
import { emptyDesign, LAYOUT_SCHEMA_VERSION } from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { ExportDialog } from "./ExportDialog.tsx";

afterEach(cleanup);

const posted: unknown[] = [];
const fakeSite: Fetcher = async (path, init) => {
  if (path === "/_emdash/api/schema/collections")
    return Response.json({ data: { items: [{ slug: "pages", label: "Site pages" }] } });
  if (path.startsWith("/_emdash/api/schema/collections/pages"))
    return Response.json({
      data: { item: { slug: "pages", fields: [{ slug: "content", type: "portableText" }] } },
    });
  if (init?.method === "POST") {
    posted.push(JSON.parse(String(init.body)));
    return Response.json({ data: { item: { id: "n1" } } }, { status: 201 });
  }
  if (path.startsWith("/_emdash/api/content/emvb_pages"))
    return Response.json({
      data: {
        items: [
          {
            id: "p1",
            slug: "home",
            status: "published",
            data: {
              title: "Home",
              layout: {
                schemaVersion: LAYOUT_SCHEMA_VERSION,
                root: { id: "root0001", type: "container", props: {}, children: [] },
              },
            },
          },
        ],
      },
    });
  if (path.startsWith("/_emdash/api/content/")) return Response.json({ data: { items: [] } });
  return Response.json({ data: { design: emptyDesign() } });
};

const pages = [
  { id: "p1", title: "Home", slug: "home", status: "published", updatedAt: "" },
  { id: "p2", title: "WIP", slug: "wip", status: "draft", updatedAt: "" },
];

const exportButton = () => {
  const button = [...document.querySelectorAll("button")].find((b) => b.textContent === "Export");
  if (!button) throw new Error("Export is missing");
  return button;
};

test("Export downloads a zip and says what it holds (W-963)", async () => {
  const created = spyOn(URL, "createObjectURL").mockImplementation(() => "blob:zip");
  const clicked = spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  try {
    await mount(
      <ExportDialog fetcher={fakeSite} open onOpenChange={() => undefined} pages={pages} />,
    );
    await settle();
    expect(document.body.textContent).toContain("All published pages (1)");
    await act(async () => exportButton().click());
    for (let i = 0; i < 20 && !document.body.textContent?.includes("Downloaded"); i += 1)
      // oxlint-disable-next-line no-await-in-loop -- waits for the export to finish
      await settle();
    const status = document.querySelector("[data-emvb-export-status]")?.textContent ?? "";
    expect(status).toContain("Downloaded 1 page.");
    expect(status).toContain("EXPORT-REPORT.md");
    expect(created).toHaveBeenCalledTimes(1);
    const blob = created.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("application/zip");
    expect(clicked).toHaveBeenCalledTimes(1);
  } finally {
    created.mockRestore();
    clicked.mockRestore();
  }
});

test("with nothing published, Export is unavailable", async () => {
  await mount(
    <ExportDialog fetcher={fakeSite} open onOpenChange={() => undefined} pages={pages.slice(1)} />,
  );
  await settle();
  expect(exportButton().getAttribute("aria-disabled")).toBe("true");
});

test("Rich text in a collection creates drafts there (W-963)", async () => {
  posted.length = 0;
  await mount(
    <ExportDialog fetcher={fakeSite} open onOpenChange={() => undefined} pages={pages} />,
  );
  await settle();
  const rich = [...document.querySelectorAll('[role="radio"], input[type="radio"]')].find((el) =>
    (el.closest("label")?.textContent ?? el.parentElement?.textContent ?? "").includes(
      "Rich text in a collection",
    ),
  );
  if (!(rich instanceof HTMLElement)) throw new Error("Rich text option is missing");
  await act(async () => rich.click());
  for (let i = 0; i < 10 && !document.body.textContent?.includes("Site pages"); i += 1)
    // oxlint-disable-next-line no-await-in-loop -- waits for the collections to load
    await settle();
  const copy = [...document.querySelectorAll("button")].find((b) => b.textContent === "Copy pages");
  if (!copy) throw new Error("Copy pages is missing");
  await act(async () => copy.click());
  for (let i = 0; i < 20 && !document.body.textContent?.includes("Created"); i += 1)
    // oxlint-disable-next-line no-await-in-loop -- waits for the copy to finish
    await settle();
  expect(document.querySelector("[data-emvb-export-status]")?.textContent).toBe(
    "Created 1 draft in Site pages.",
  );
  expect(posted).toHaveLength(1);
});
