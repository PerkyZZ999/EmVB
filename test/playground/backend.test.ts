import { describe, expect, test } from "bun:test";
import { ApiError } from "../../packages/emvb/src/admin/api.ts";
import {
  discardDraft,
  listPages,
  previewUrl,
  publishDesign,
  publishPage,
  saveDesign,
  savePage,
  type PageDraft,
} from "../../packages/emvb/src/admin/content-api.ts";
import { loadFormFields, loadFormsCapability } from "../../packages/emvb/src/admin/forms-api.ts";
import {
  listUploadedIcons,
  uploadIconFile,
} from "../../packages/emvb/src/admin/icon-uploads-api.ts";
import { listImages, uploadImage } from "../../packages/emvb/src/admin/media-api.ts";
import { readRole, canUseEmvb } from "../../packages/emvb/src/admin/access/role.ts";
import { readCollection } from "../../packages/emvb/src/admin/setup/run.ts";
import { createThemePart, listThemeParts } from "../../packages/emvb/src/admin/theme-api.ts";
import { loadDesign, loadEntry } from "../../packages/emvb/src/admin/editor/useEditorData.ts";
import { PAGES_COLLECTION } from "../../packages/emvb/src/constants.ts";
import {
  createBackend,
  MEDIA_FILE_MAX_BYTES,
  STORAGE_KEY,
  UPLOADS_PATH,
  VIEW_PATH,
  type KeyValueStore,
  type UploadStore,
} from "../../site/src/playground/mock/backend.ts";

// The playground on emvb.dev runs the real editor against this in-browser stand-in for EmDash.
// These tests drive it through the editor's own API clients, so a route the editor relies on
// can't drift from what the stand-in answers.

function memoryStorage(limit = Infinity): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      if (value.length > limit) throw new DOMException("full", "QuotaExceededError");
      map.set(key, value);
    },
    removeItem: (key) => void map.delete(key),
  };
}

function memoryUploads(): UploadStore & { files: Map<string, Blob> } {
  const files = new Map<string, Blob>();
  return {
    files,
    put: async (path, file) => void files.set(path, file),
    clear: async () => files.clear(),
  };
}

const LANDING = "page-landing";

async function draftOf(fetcher: Parameters<typeof loadEntry>[0], id = LANDING): Promise<PageDraft> {
  const entry = await loadEntry(fetcher, id);
  return {
    title: entry.title,
    slug: entry.slug,
    canvasMode: entry.canvasMode,
    seoTitle: entry.seoTitle,
    seoDescription: entry.seoDescription,
    layout: entry.layout,
  };
}

const rejectionOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error("expected a rejection");
};

describe("playground backend: pages", () => {
  test("opens on the starter landing page, published, for an editor", async () => {
    const { fetcher } = createBackend();
    expect(canUseEmvb(await readRole(fetcher))).toBe(true);
    const entry = await loadEntry(fetcher, LANDING);
    expect(entry.title).toBe("Fieldnote landing page");
    expect(entry.status).toBe("published");
    // Header, main and footer (W-293), with the page's sections inside main.
    const top = entry.layout?.root.children ?? [];
    expect(top.map((n) => (n.props as { tag?: string }).tag)).toEqual(["header", "main", "footer"]);
    expect((top[1] as { children?: unknown[] }).children?.length).toBeGreaterThan(5);
    const pages = await listPages(fetcher);
    expect(pages.map((p) => p.id).toSorted()).toEqual(["page-journal", LANDING]);
  });

  test("a save is kept in storage and read back by the next visit", async () => {
    const storage = memoryStorage();
    const first = createBackend({ storage });
    const entry = await loadEntry(first.fetcher, LANDING);
    const draft = { ...(await draftOf(first.fetcher)), title: "My page" };
    await savePage(first.fetcher, LANDING, draft, entry.rev);
    expect(storage.map.has(STORAGE_KEY)).toBe(true);

    const again = createBackend({ storage });
    const reloaded = await loadEntry(again.fetcher, LANDING);
    expect(reloaded.title).toBe("My page");
    expect(reloaded.status).toBe("changed");
  });

  test("a stale revision fails with 409, as EmDash's _rev check does", async () => {
    const { fetcher } = createBackend();
    const { rev } = await loadEntry(fetcher, LANDING);
    const draft = await draftOf(fetcher);
    await savePage(fetcher, LANDING, draft, rev);
    const error = await rejectionOf(savePage(fetcher, LANDING, draft, rev));
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
  });

  test("a save from a second tab on an older copy is a 409, not a silent overwrite (W-290)", async () => {
    const storage = memoryStorage();
    const tabA = createBackend({ storage });
    const tabB = createBackend({ storage });
    const atA = await loadEntry(tabA.fetcher, LANDING);
    const atB = await loadEntry(tabB.fetcher, LANDING);
    await savePage(
      tabA.fetcher,
      LANDING,
      { ...(await draftOf(tabA.fetcher)), title: "From A" },
      atA.rev,
    );

    const draftB = { ...(await draftOf(tabB.fetcher)), title: "From B" };
    // Tab B already sees what tab A saved.
    expect(draftB.title).toBe("From B");
    expect((await loadEntry(tabB.fetcher, LANDING)).title).toBe("From A");
    const error = await rejectionOf(savePage(tabB.fetcher, LANDING, draftB, atB.rev));
    expect(error.status).toBe(409);
    expect((await loadEntry(createBackend({ storage }).fetcher, LANDING)).title).toBe("From A");
    expect(tabB.snapshot().entries.find((e) => e.id === LANDING)?.draft.data["title"]).toBe(
      "From A",
    );
  });

  test("site styles saved in another tab are picked up before the next save (W-290)", async () => {
    const storage = memoryStorage();
    const tabA = createBackend({ storage });
    const tabB = createBackend({ storage });
    const atA = await loadDesign(tabA.fetcher);
    const atB = await loadDesign(tabB.fetcher);
    await saveDesign(tabA.fetcher, atA.design, atA.revision);
    expect((await rejectionOf(saveDesign(tabB.fetcher, atB.design, atB.revision))).status).toBe(
      409,
    );
  });

  test("publish, change, then Revert to published brings the published page back", async () => {
    const { fetcher } = createBackend();
    let { rev } = await loadEntry(fetcher, LANDING);
    rev = await savePage(fetcher, LANDING, { ...(await draftOf(fetcher)), title: "Changed" }, rev);
    expect((await loadEntry(fetcher, LANDING)).status).toBe("changed");
    await discardDraft(fetcher, PAGES_COLLECTION, LANDING, rev);
    const back = await loadEntry(fetcher, LANDING);
    expect(back.title).toBe("Fieldnote landing page");
    expect(back.status).toBe("published");

    const published = await publishPage(
      fetcher,
      LANDING,
      await savePage(fetcher, LANDING, { ...(await draftOf(fetcher)), title: "New" }, back.rev),
    );
    expect(published.slug).toBe("fieldnote");
    expect((await loadEntry(fetcher, LANDING)).status).toBe("published");
  });

  test("a taken slug is SLUG_CONFLICT, so the editor points at the slug field", async () => {
    const { fetcher } = createBackend();
    const { rev } = await loadEntry(fetcher, LANDING);
    const error = await rejectionOf(
      savePage(fetcher, LANDING, { ...(await draftOf(fetcher)), slug: "journal" }, rev),
    );
    expect(error.status).toBe(409);
    expect(error.code).toBe("SLUG_CONFLICT");
  });

  test("an invalid layout is refused with the server's reason, as EmVB's save hook does", async () => {
    const { fetcher } = createBackend();
    const { rev, layout } = await loadEntry(fetcher, LANDING);
    if (!layout) throw new Error("the starter page has a layout");
    const broken = structuredClone(layout);
    (broken.root.children[0] as { props: unknown }).props = { tag: "marquee" };
    const error = await rejectionOf(
      savePage(fetcher, LANDING, { ...(await draftOf(fetcher)), layout: broken }, rev),
    );
    expect(error.status).toBe(422);
    expect(error.message).toContain("The page layout is invalid.");
  });

  test("Preview and View page open the playground's own renderer", async () => {
    const { fetcher } = createBackend();
    expect(await previewUrl(fetcher, LANDING)).toBe(`${VIEW_PATH}?entry=${LANDING}&draft=1`);
    expect((await readCollection(fetcher, PAGES_COLLECTION))?.urlPattern).toBe(
      `${VIEW_PATH}?slug={slug}`,
    );
  });

  test("theme parts can be created and listed", async () => {
    const { fetcher } = createBackend();
    const id = await createThemePart(fetcher, {
      title: "Header",
      slug: "header",
      partType: "header",
    });
    const parts = await listThemeParts(fetcher);
    expect(parts.map((p) => p.id)).toEqual([id]);
    expect(parts[0]?.partType).toBe("header");
  });

  test("lists page with a cursor like EmDash's", async () => {
    const { fetcher } = createBackend();
    for (let i = 0; i < 60; i += 1) {
      // oxlint-disable-next-line no-await-in-loop -- creation order is the point
      await createThemePart(fetcher, {
        title: `Part ${i}`,
        slug: `part-${i}`,
        partType: "section",
      });
    }
    expect((await listThemeParts(fetcher)).length).toBe(60);
  });
});

describe("playground backend: site styles", () => {
  test("save and publish follow the revision checks, and say when styles are unpublished", async () => {
    const { fetcher } = createBackend();
    const loaded = await loadDesign(fetcher);
    expect(loaded.unpublished).toBe(false);
    const next = structuredClone(loaded.design);
    next.variables.colors = next.variables.colors.map((c, i) =>
      i === 0 ? { ...c, value: "#000000" } : c,
    );
    const revision = await saveDesign(fetcher, next, loaded.revision);
    expect((await loadDesign(fetcher)).unpublished).toBe(true);
    expect((await rejectionOf(saveDesign(fetcher, next, loaded.revision))).status).toBe(409);
    await publishDesign(fetcher, loaded.publishedRevision);
    const after = await loadDesign(fetcher);
    expect(after.unpublished).toBe(false);
    expect(after.revision).toBe(revision);
  });
});

describe("playground backend: uploads and forms", () => {
  test("an uploaded SVG icon is cleaned and listed; one with a script is refused", async () => {
    const { fetcher } = createBackend();
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';
    const result = await uploadIconFile(
      fetcher,
      new File([svg], "logo.svg", { type: "image/svg+xml" }),
    );
    expect("item" in result && result.item.name).toBe("logo");
    expect((await listUploadedIcons(fetcher)).length).toBe(1);
    const evil = svg.replace("<path", "<script>alert(1)</script><path");
    const refused = await fetcher(`/_emdash/api/plugins/emvb/icons/upload`, {
      method: "POST",
      body: JSON.stringify({ name: "evil.svg", svg: evil }),
    });
    expect(refused.status).toBe(422);
    expect((await listUploadedIcons(fetcher)).length).toBe(1);
  });

  test("an image upload is kept by the browser and served from a same-origin path", async () => {
    const storage = memoryStorage();
    const uploads = memoryUploads();
    const { fetcher, reset } = createBackend({ storage, uploads });
    const png = new File([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], "dot.png", {
      type: "image/png",
    });
    const item = await uploadImage(fetcher, png, { width: 1, height: 1, alt: "A dot" });
    // EmVB renders only http(s) and same-origin image URLs (R-032), never data: URLs.
    expect(item.url.startsWith(UPLOADS_PATH)).toBe(true);
    expect(uploads.files.has(item.url)).toBe(true);
    expect(storage.map.get(STORAGE_KEY)?.length ?? 0).toBeLessThan(100_000);
    expect((await listImages(fetcher))[0]?.id).toBe(item.id);
    const big = new File([new Uint8Array(MEDIA_FILE_MAX_BYTES + 1)], "big.png", {
      type: "image/png",
    });
    const error = await rejectionOf(uploadImage(fetcher, big));
    expect(error.status).toBe(413);
    expect(error.message).toContain("limited to");
    reset();
    await Promise.resolve();
    expect(uploads.files.size).toBe(0);
  });

  test("without a place to keep files, an upload says to paste a URL", async () => {
    const { fetcher } = createBackend();
    const png = new File([new Uint8Array([1, 2, 3])], "dot.png", { type: "image/png" });
    const error = await rejectionOf(uploadImage(fetcher, png));
    expect(error.status).toBe(501);
    expect(error.message).toContain("Paste an image URL");
  });

  test("a change the browser can't store is undone and explained", async () => {
    const seeded = memoryStorage();
    createBackend({ storage: seeded }).reset();
    const size = seeded.map.get(STORAGE_KEY)?.length ?? 0;
    const storage = memoryStorage(size + 50);
    const { fetcher } = createBackend({ storage, uploads: memoryUploads() });
    const png = new File([new Uint8Array(4000)], "a.png", { type: "image/png" });
    const error = await rejectionOf(uploadImage(fetcher, png));
    expect(error.status).toBe(507);
    expect(await listImages(fetcher, { q: "a.png" })).toEqual([]);
  });

  test("the forms plugin answers with the demo form and its fields", async () => {
    const { fetcher } = createBackend();
    const capability = await loadFormsCapability(fetcher);
    expect(capability.status).toBe("ready");
    const fields = await loadFormFields(fetcher, "contact");
    expect(fields?.map((f) => f.name)).toEqual(["name", "email", "message"]);
  });
});

describe("playground backend: storage", () => {
  test("Reset goes back to the starter content", async () => {
    const storage = memoryStorage();
    const backend = createBackend({ storage });
    const { rev } = await loadEntry(backend.fetcher, LANDING);
    await savePage(
      backend.fetcher,
      LANDING,
      { ...(await draftOf(backend.fetcher)), title: "X" },
      rev,
    );
    let calls = 0;
    backend.subscribe(() => (calls += 1));
    backend.reset();
    expect(calls).toBe(1);
    expect((await loadEntry(backend.fetcher, LANDING)).title).toBe("Fieldnote landing page");
    expect(createBackend({ storage }).snapshot().entries[0]?.draft.data["title"]).toBe(
      "Fieldnote landing page",
    );
  });

  test("unreadable saved state falls back to the starter content", () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, "{not json");
    expect(createBackend({ storage }).snapshot().entries.length).toBe(2);
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, entries: [] }));
    expect(createBackend({ storage }).snapshot().entries.length).toBe(2);
  });

  test("routes EmDash doesn't have answer like EmDash does (404)", async () => {
    const { fetcher } = createBackend();
    const response = await fetcher("/_emdash/api/plugins/nope/thing");
    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  });
});
