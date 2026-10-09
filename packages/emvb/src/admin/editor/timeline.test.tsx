import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { emptyDesign, type Layout } from "../../core/index.ts";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";
import { NO_REVISIONS, revisionLayout, TimelineDialog } from "./Timeline.tsx";

afterEach(cleanup);

const layoutWith = (text: string, extra = false): Layout =>
  ({
    schemaVersion: 13,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        { id: "head0001", type: "heading", props: { text, level: 1 } },
        ...(extra ? [{ id: "text0001", type: "text", props: { text: "More" } }] : []),
      ],
    },
  }) as Layout;

describe("version timeline dialog (W-315)", () => {
  test("revision layouts are read from JSON text or objects; bad ones are null", () => {
    expect(revisionLayout({ layout: JSON.stringify(layoutWith("A")) })?.root.id).toBe("root0001");
    expect(revisionLayout({ layout: layoutWith("A") })?.root.id).toBe("root0001");
    expect(revisionLayout({ layout: "{" })).toBeNull();
    expect(revisionLayout({})).toBeNull();
  });

  test("lists versions newest first and restores one section as an edit", async () => {
    const calls: string[] = [];
    const fetcher = async (path: string) => {
      calls.push(path);
      return new Response(
        JSON.stringify({
          data: {
            items: [
              {
                id: "r1",
                createdAt: "2026-10-01T10:00:00Z",
                data: { layout: layoutWith("First") },
              },
              {
                id: "r2",
                createdAt: "2026-10-05T10:00:00Z",
                data: { layout: layoutWith("Second") },
              },
            ],
            total: 2,
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    };
    const applied: [Layout, string][] = [];
    await mount(
      <TimelineDialog
        open
        onOpenChange={() => undefined}
        fetcher={fetcher}
        collection="emvb_pages"
        entryId="01PAGE"
        current={layoutWith("Now", true)}
        design={emptyDesign()}
        onApply={(layout, note) => applied.push([layout, note])}
      />,
    );
    await settle();
    expect(calls).toEqual(["/_emdash/api/content/emvb_pages/01PAGE/revisions?limit=50"]);
    const versions = [...document.querySelectorAll("[data-emvb-version]")].map((el) =>
      el.getAttribute("data-emvb-version"),
    );
    expect(versions).toEqual(["r2", "r1"]);
    const kinds = [...document.querySelectorAll("[data-emvb-timeline-changes] > li")].map((el) =>
      el.getAttribute("data-kind"),
    );
    expect(kinds).toEqual(["changed", "added"]);
    const restore = document.querySelector(
      '[data-emvb-restore-section="head0001"]',
    ) as HTMLButtonElement;
    await act(async () => restore.click());
    expect(applied[0]?.[1]).toBe("Section restored");
    expect(JSON.stringify(applied[0]?.[0])).toContain("Second");
    expect(JSON.stringify(applied[0]?.[0])).toContain("More");
  });

  test("W-315 a host without revisions says so plainly, not a raw Not found", async () => {
    const fetcher = async () =>
      new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "Not found" } }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    await mount(
      <TimelineDialog
        open
        onOpenChange={() => undefined}
        fetcher={fetcher}
        collection="emvb_pages"
        entryId="01PAGE"
        current={layoutWith("Now")}
        design={emptyDesign()}
        onApply={() => undefined}
      />,
    );
    await settle();
    expect(document.querySelector("[role=alert]")?.textContent).toBe(NO_REVISIONS);
  });
});
