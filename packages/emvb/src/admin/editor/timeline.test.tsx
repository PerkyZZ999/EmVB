import { afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { emptyDesign, type Layout } from "../../core/index.ts";
import { cleanup, mount, rerender, settle } from "../../../test/dom/mount.ts";
import { noRevisions, revisionLayout, TimelineDialog } from "./Timeline.tsx";

afterEach(cleanup);

const layoutWith = (text: string, extra = false): Layout =>
  ({
    schemaVersion: 16,
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
  test("W-736: named loading feedback lasts through revisions and optional agent metadata", async () => {
    const revisions = Promise.withResolvers<Response>();
    const agents = Promise.withResolvers<Response>();
    const calls: string[] = [];
    const fetcher = async (path: string) => {
      calls.push(path);
      return path.endsWith("/agents/page") ? agents.promise : revisions.promise;
    };
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
    const loading = () =>
      document.querySelector('[role="status"][aria-label="Version timeline status"]');
    try {
      expect(
        [...document.querySelectorAll("p.emvb-helper")].map((item) => item.textContent),
      ).toContain("Loading versions…");
      expect(loading()?.textContent).toBe("Loading versions…");
      expect(loading()?.getAttribute("aria-live")).toBe("polite");
      expect(document.querySelector("[data-emvb-timeline-empty]") === null).toBe(true);
      await act(async () => revisions.resolve(Response.json({ data: { items: [] } })));
      await settle();
      expect(calls.at(-1)).toBe("/_emdash/api/plugins/emvb/agents/page");
      expect(loading()?.textContent).toBe("Loading versions…");
      expect(document.querySelector("[data-emvb-timeline-empty]") === null).toBe(true);
      await act(async () => agents.reject(new Error("Optional metadata unavailable")));
      await settle();
      expect(loading() === null).toBe(true);
      expect(document.querySelector("[data-emvb-timeline-empty]")?.textContent).toBe(
        "No saved versions yet. Each save adds one.",
      );
      expect(document.querySelector('[role="alert"]') === null).toBe(true);
    } finally {
      await act(async () => {
        revisions.resolve(Response.json({ data: { items: [] } }));
        agents.resolve(Response.json({ data: { versions: [] } }));
      });
    }
  });

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
    expect(calls).toEqual([
      "/_emdash/api/content/emvb_pages/01PAGE/revisions?limit=50",
      "/_emdash/api/plugins/emvb/agents/page",
    ]);
    expect(document.querySelector("[data-emvb-timeline-who]")).toBeNull();
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

  test.each([
    [["01AAA", "01BBB", "01CCC"]],
    [["01CCC", "01AAA", "01BBB"]],
    [["01CCC", "01BBB", "01AAA"]],
  ])("W-768: versions saved in the same second keep newest first (%p)", async (order) => {
    const fetcher = async (path: string) =>
      new Response(
        JSON.stringify(
          path.includes("revisions")
            ? {
                data: {
                  items: order.map((id) => ({
                    id,
                    createdAt: "2026-10-05T10:00:00Z",
                    data: { layout: layoutWith(id) },
                  })),
                  total: 3,
                },
              }
            : { data: { items: [] } },
        ),
        { headers: { "content-type": "application/json" } },
      );
    await mount(
      <TimelineDialog
        open
        onOpenChange={() => undefined}
        fetcher={fetcher}
        collection="emvb_pages"
        entryId="01PAGE"
        current={layoutWith("Now", true)}
        design={emptyDesign()}
        onApply={() => undefined}
      />,
    );
    await settle();
    const versions = [...document.querySelectorAll("[data-emvb-version]")].map((el) =>
      el.getAttribute("data-emvb-version"),
    );
    expect(versions).toEqual(["01CCC", "01BBB", "01AAA"]);
  });

  test("W-460 agent versions get a badge and the People/Agents filter", async () => {
    const fetcher = async (path: string) => {
      const data = path.endsWith("/agents/page")
        ? { versions: [{ revisionId: "r2", tool: "add_element", summary: "Added heading" }] }
        : {
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
          };
      return Response.json({ data });
    };
    await mount(
      <TimelineDialog
        open
        onOpenChange={() => undefined}
        fetcher={fetcher}
        collection="emvb_pages"
        entryId="01PAGE"
        current={layoutWith("Now", true)}
        design={emptyDesign()}
        onApply={() => undefined}
      />,
    );
    await settle();
    const ids = () =>
      [...document.querySelectorAll("[data-emvb-version]")].map((el) =>
        el.getAttribute("data-emvb-version"),
      );
    expect(
      document.querySelector('[data-emvb-version="r2"] [data-emvb-agent-version]'),
    ).not.toBeNull();
    expect(document.querySelector('[data-emvb-version="r1"] [data-emvb-agent-version]')).toBeNull();
    const pick = (who: string) =>
      document.querySelector(`[data-emvb-timeline-who="${who}"]`) as HTMLButtonElement;
    // W-477: a segmented control with counts, and the badge carries an icon, not just a word.
    expect(pick("agents").getAttribute("aria-pressed")).toBe("false");
    expect(pick("all").className).toBe("emvb-timeline-who-option");
    expect(pick("agents").querySelector(".emvb-timeline-count")?.textContent).toBe("1");
    expect(pick("all").querySelector(".emvb-timeline-count")?.textContent).toBe("2");
    expect(
      document.querySelector('[data-emvb-agent-version] svg[aria-hidden="true"]'),
    ).not.toBeNull();
    await act(async () => pick("agents").click());
    expect(pick("agents").getAttribute("aria-pressed")).toBe("true");
    expect(ids()).toEqual(["r2"]);
    await act(async () => pick("people").click());
    expect(ids()).toEqual(["r1"]);
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
    expect(document.querySelector("[role=alert]")?.textContent).toBe(noRevisions("page"));
  });

  test("snapshots load the host stylesheets before EmVB's CSS", async () => {
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          data: {
            items: [
              {
                id: "r1",
                createdAt: "2026-10-05T10:00:00Z",
                data: { layout: layoutWith("First") },
              },
            ],
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
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
        canvasStyles={["/site.css", "javascript:x", "/fonts.css"]}
      />,
    );
    await settle();
    const srcdoc = document.querySelector("iframe")?.getAttribute("srcdoc") ?? "";
    const first = srcdoc.indexOf('<link rel="stylesheet" href="/site.css"');
    const second = srcdoc.indexOf('<link rel="stylesheet" href="/fonts.css"');
    const style = srcdoc.indexOf("<style>");
    expect(first >= 0 && second > first && style > second).toBe(true);
    expect(srcdoc.includes("javascript:")).toBe(false);
  });

  test("W-811: a version picture keeps its origin, so it can load the host's stylesheets, and runs no scripts", async () => {
    const fetcher = async () =>
      Response.json({
        data: {
          items: [
            { id: "r1", createdAt: "2026-10-05T10:00:00Z", data: { layout: layoutWith("Then") } },
          ],
        },
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
        canvasStyles={["/site.css"]}
      />,
    );
    await settle();
    const frames = [...document.querySelectorAll("iframe.emvb-timeline-frame")];
    expect(frames.length > 0).toBe(true);
    for (const frame of frames) expect(frame.getAttribute("sandbox")).toBe("allow-same-origin");
  });

  test("W-752: a version picture has no live links to follow", async () => {
    const linked = {
      schemaVersion: 16,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text: 'Say href="x"', level: 1 } },
          { id: "btn00001", type: "button", props: { text: "About", href: "/about" } },
        ],
      },
    } as Layout;
    const fetcher = async () =>
      Response.json({
        data: {
          items: [{ id: "r1", createdAt: "2026-10-05T10:00:00Z", data: { layout: linked } }],
        },
      });
    await mount(
      <TimelineDialog
        open
        onOpenChange={() => undefined}
        fetcher={fetcher}
        collection="emvb_pages"
        entryId="01PAGE"
        current={linked}
        design={emptyDesign()}
        onApply={() => undefined}
        canvasStyles={["/site.css"]}
      />,
    );
    await settle();
    const frames = [...document.querySelectorAll("iframe")].map(
      (f) => f.getAttribute("srcdoc") ?? "",
    );
    expect(frames.length > 0).toBe(true);
    for (const srcdoc of frames) {
      const body = srcdoc.slice(srcdoc.indexOf("<body>"));
      expect(body.includes("About")).toBe(true);
      expect(/<a [^>]*href=/.test(body)).toBe(false);
      expect(body.includes('Say href="x"')).toBe(true);
      expect(srcdoc.includes('<link rel="stylesheet" href="/site.css"')).toBe(true);
    }
  });
});

test("a restore refusal goes away when another version is picked (W-561)", async () => {
  const many = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `${prefix}${String(i).padStart(4, "0")}`,
      type: "text",
      props: { text: "x" },
    }));
  const page = (sections: unknown[]) =>
    ({
      schemaVersion: 16,
      root: { id: "root0001", type: "container", props: {}, children: sections },
    }) as Layout;
  // The current page is near the cap; the saved version (under it) still had another section.
  const big = { id: "biga0001", type: "container", props: {}, children: many("bigx", 1985) };
  const older = { ...big, children: many("bigx", 1960) };
  const gone = { id: "gone0001", type: "container", props: {}, children: many("gonx", 20) };
  const fetcher = async () =>
    new Response(
      JSON.stringify({
        data: {
          items: [
            { id: "r1", createdAt: "2026-10-01T10:00:00Z", data: { layout: layoutWith("Old") } },
            { id: "r2", createdAt: "2026-10-05T10:00:00Z", data: { layout: page([older, gone]) } },
          ],
          total: 2,
        },
      }),
      { headers: { "content-type": "application/json" } },
    );
  await mount(
    <TimelineDialog
      open
      onOpenChange={() => undefined}
      fetcher={fetcher}
      collection="emvb_pages"
      entryId="01PAGE"
      current={page([big])}
      design={emptyDesign()}
      onApply={() => undefined}
    />,
  );
  await settle();
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[data-emvb-restore-section="gone0001"]')?.click(),
  );
  const alert = () => document.querySelector(".emvb-timeline-main [role=alert]")?.textContent;
  expect(alert()).toContain("too many elements");
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[data-emvb-version="r1"]')?.click(),
  );
  await settle();
  expect(alert()).toBeUndefined();
});

test("a restore refusal is gone after closing and reopening the timeline (W-623)", async () => {
  const many = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `${prefix}${String(i).padStart(4, "0")}`,
      type: "text",
      props: { text: "x" },
    }));
  const page = (sections: unknown[]) =>
    ({
      schemaVersion: 16,
      root: { id: "root0001", type: "container", props: {}, children: sections },
    }) as Layout;
  const big = { id: "biga0001", type: "container", props: {}, children: many("bigx", 1985) };
  const older = { ...big, children: many("bigx", 1960) };
  const gone = { id: "gone0001", type: "container", props: {}, children: many("gonx", 20) };
  const fetcher = async () =>
    new Response(
      JSON.stringify({
        data: {
          items: [
            { id: "r2", createdAt: "2026-10-05T10:00:00Z", data: { layout: page([older, gone]) } },
          ],
          total: 1,
        },
      }),
      { headers: { "content-type": "application/json" } },
    );
  const dialog = (open: boolean) => (
    <TimelineDialog
      open={open}
      onOpenChange={() => undefined}
      fetcher={fetcher}
      collection="emvb_pages"
      entryId="01PAGE"
      current={page([big])}
      design={emptyDesign()}
      onApply={() => undefined}
    />
  );
  await mount(dialog(true));
  await settle();
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[data-emvb-restore-section="gone0001"]')?.click(),
  );
  const alert = () => document.querySelector(".emvb-timeline-main [role=alert]")?.textContent;
  expect(alert()).toContain("too many elements");
  await rerender(dialog(false));
  await settle();
  await rerender(dialog(true));
  await settle();
  expect(alert()).toBeUndefined();
});

test("W-832: restoring a section moves focus to the next restore, then to the whole version", async () => {
  const fetcher = async (path: string) =>
    Response.json(
      path.includes("revisions")
        ? {
            data: {
              items: [
                {
                  id: "r1",
                  createdAt: "2026-10-01T10:00:00Z",
                  data: { layout: layoutWith("First", true) },
                },
              ],
            },
          }
        : { data: { versions: [] } },
    );
  function Host() {
    const [current, setCurrent] = React.useState(layoutWith("Now"));
    return (
      <TimelineDialog
        open
        onOpenChange={() => undefined}
        fetcher={fetcher}
        collection="emvb_pages"
        entryId="01PAGE"
        current={current}
        design={emptyDesign()}
        onApply={(layout) => setCurrent(layout)}
      />
    );
  }
  await mount(<Host />);
  await settle();
  const section = (id: string) =>
    document.querySelector<HTMLButtonElement>(`[data-emvb-restore-section="${id}"]`);
  const heading = section("head0001");
  heading?.focus();
  await act(async () => heading?.click());
  await settle();
  expect(section("head0001")).toBeNull();
  expect(document.activeElement === section("text0001")).toBe(true);
  await act(async () => section("text0001")?.click());
  await settle();
  expect(section("text0001")).toBeNull();
  expect(document.activeElement?.hasAttribute("data-emvb-restore-version")).toBe(true);
});
