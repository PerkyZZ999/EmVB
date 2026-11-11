import { afterEach, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";
import { emptyDesign, LAYOUT_SCHEMA_VERSION } from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { ExportDialog } from "./ExportDialog.tsx";

afterEach(cleanup);

const fakeSite: Fetcher = async (path) => {
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
