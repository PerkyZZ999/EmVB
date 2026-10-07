import { describe, expect, test } from "bun:test";
import { s1Page } from "../../test/fixtures/layouts.ts";
import { emptyDesign } from "../core/index.ts";
import type { Fetcher } from "./api.ts";
import { listPages } from "./content-api.ts";
import { editorReducer, type EditorState } from "./editor/store.ts";
import { loadEntry } from "./editor/useEditorData.ts";
import { entryStatus, statusLabel } from "./entry-status.ts";

const state = (status: string): EditorState => ({
  id: "01PAGE",
  page: {
    title: "Home",
    slug: "home",
    canvasMode: "site-layout",
    seoTitle: "",
    seoDescription: "",
    layout: s1Page(),
  },
  status,
  rev: "rev1",
  design: emptyDesign(),
  designRevision: null,
  selectedId: null,
  version: 1,
  savedVersion: 0,
  lastDeleted: null,
});

const answering =
  (body: unknown): Fetcher =>
  async () =>
    new Response(JSON.stringify({ data: body }), { status: 200 });

describe("a saved draft on a published page is shown as not live (W-190)", () => {
  test("published with a draft revision reads as changed; labels say so", () => {
    expect(entryStatus({ status: "published", draftRevisionId: "01REV" })).toBe("changed");
    expect(entryStatus({ status: "published", draftRevisionId: null })).toBe("published");
    expect(entryStatus({ status: "draft", draftRevisionId: "01REV" })).toBe("draft");
    expect(entryStatus(undefined)).toBe("draft");
    expect(statusLabel("changed")).toBe("Changes not published");
    expect(statusLabel("published")).toBe("Published");
    expect(statusLabel("draft")).toBe("Draft");
  });

  test("Save draft on a published page turns it changed, and Publish turns it back", () => {
    let next = editorReducer(state("published"), { type: "saved", rev: "rev2", version: 1 });
    expect(next.status).toBe("changed");
    next = editorReducer(next, { type: "published", rev: "rev3" });
    expect(next.status).toBe("published");
    expect(editorReducer(state("draft"), { type: "saved", rev: "rev2", version: 1 }).status).toBe(
      "draft",
    );
  });

  test("the editor and the pages list read the draft revision", async () => {
    const item = {
      id: "01PAGE",
      slug: "a",
      status: "published",
      draftRevisionId: "01REV",
      data: {},
    };
    expect((await loadEntry(answering({ item, _rev: "r" }), "01PAGE")).status).toBe("changed");
    expect((await listPages(answering({ items: [item] })))[0]?.status).toBe("changed");
  });

  test("a scheduled entry reads Scheduled, not Draft (W-201)", () => {
    expect(statusLabel(entryStatus({ status: "scheduled", draftRevisionId: null }))).toBe(
      "Scheduled",
    );
  });
});
