import { afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { layoutOfBytes } from "../../../test/fixtures/layouts.ts";
import { cleanup, mount } from "../../../test/dom/mount.ts";
import {
  byteLength,
  emptyDesign,
  MAX_LAYOUT_BYTES,
  type ConditionsDoc,
  type Layout,
  type TriggersDoc,
} from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { editorReducer, type EditorState } from "./store.ts";
import { tooLargeMessage, useSave } from "./useSave.ts";

afterEach(cleanup);

const layout: Layout = {
  schemaVersion: 8,
  root: { id: "root0001", type: "container", props: {}, children: [] },
};
const conditions: ConditionsDoc = {
  schemaVersion: 1,
  rules: [{ id: "r1", op: "exclude", group: "general", name: "entire_site", args: {} }],
};
const triggers: TriggersDoc = {
  schemaVersion: 1,
  open: [{ type: "delay", ms: 500 }],
  advanced: {},
};

const state = (page: Partial<EditorState["page"]> = {}, rest: Partial<EditorState> = {}) =>
  ({
    id: "T1",
    page: {
      title: "Site header",
      slug: "site-header",
      canvasMode: "site-layout",
      seoTitle: "",
      seoDescription: "",
      layout,
      ...page,
    },
    status: "draft",
    rev: "r1",
    design: emptyDesign(),
    designRevision: null,
    selectedId: null,
    version: 2,
    savedVersion: 1,
    lastDeleted: null,
    ...rest,
  }) as EditorState;

type Call = { method: string; path: string; body: unknown };
type Reply = { status: number; body: unknown };

/** Records every request and answers from `replies` by "METHOD path", falling back to 500. */
function server(replies: Record<string, Reply | Reply[]>) {
  const calls: Call[] = [];
  const fetcher: Fetcher = async (path, init) => {
    const method = init?.method ?? "GET";
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const entry = replies[`${method} ${path}`];
    const reply = Array.isArray(entry) ? entry.shift() : entry;
    if (!reply) return Response.json({ error: { code: "DOWN", message: "down" } }, { status: 500 });
    return Response.json(reply.body, { status: reply.status });
  };
  return { fetcher, calls };
}

type Hook = ReturnType<typeof useSave>;
const live: { hook?: Hook; state?: EditorState } = {};

function Probe(props: { fetcher: Fetcher; initial: EditorState; collection?: string }) {
  const [current, dispatch] = React.useReducer(editorReducer, props.initial);
  live.hook = useSave(props.fetcher, current, dispatch, props.collection);
  live.state = current;
  return null;
}

const hook = (): Hook => {
  if (!live.hook) throw new Error("useSave is not mounted");
  return live.hook;
};

async function start(fetcher: Fetcher, initial: EditorState, collection?: string) {
  await mount(<Probe fetcher={fetcher} initial={initial} collection={collection} />);
  return live as Required<typeof live>;
}

const run = async <T,>(fn: () => Promise<T>) => {
  let result: T | undefined;
  await act(async () => {
    result = await fn();
  });
  return result as T;
};

const PART = "/_emdash/api/content/emvb_theme_parts/T1";
const PAGE = "/_emdash/api/content/emvb_pages/T1";
const ok = (rev: string, extra: Record<string, unknown> = {}): Reply => ({
  status: 200,
  body: { data: { _rev: rev, ...extra } },
});

describe("useSave for theme parts (W-091, R-061, R-063)", () => {
  test("a theme part saves its type, conditions and triggers, and no page fields", async () => {
    const { fetcher, calls } = server({ [`PUT ${PART}`]: ok("r2") });
    const h = await start(
      fetcher,
      state({ partType: "footer", conditions, triggers }),
      "emvb_theme_parts",
    );
    expect(await run(() => hook().save())).toBe("r2");
    expect(calls).toEqual([
      {
        method: "PUT",
        path: PART,
        body: {
          data: { title: "Site header", layout, part_type: "footer", conditions, triggers },
          slug: "site-header",
          _rev: "r1",
        },
      },
    ]);
    expect([h.state.rev, h.state.savedVersion, h.hook.status]).toEqual([
      "r2",
      2,
      { kind: "saved" },
    ]);
  });

  test("a theme part without type, conditions or triggers saves the defaults", async () => {
    const { fetcher, calls } = server({ [`PUT ${PART}`]: ok("r2") });
    await start(fetcher, state(), "emvb_theme_parts");
    await run(() => hook().save());
    const sent = calls[0]?.body as { data?: unknown } | undefined;
    expect(sent?.data).toEqual({
      title: "Site header",
      layout,
      part_type: "header",
      conditions: { schemaVersion: 1, rules: [] },
      triggers: { schemaVersion: 1, open: [{ type: "page_load" }], advanced: {} },
    });
  });

  test("publishing a saved theme part publishes that revision without saving again", async () => {
    const { fetcher, calls } = server({
      [`POST ${PART}/publish`]: ok("r3", { item: { slug: "site-header" } }),
    });
    const h = await start(fetcher, state({}, { version: 1, savedVersion: 1 }), "emvb_theme_parts");
    expect(await run(() => hook().publish())).toBe(true);
    expect(calls).toEqual([{ method: "POST", path: `${PART}/publish`, body: { _rev: "r1" } }]);
    expect([live.state?.rev, h.hook.status]).toEqual(["r3", { kind: "saved" }]);
  });
});

describe("useSave publish and overwrite (W-091, R-006)", () => {
  test("a publish conflict opens the conflict dialog with the publish message", async () => {
    const conflict = { status: 409, body: { error: { code: "CONFLICT", message: "stale" } } };
    const { fetcher } = server({ [`POST ${PAGE}/publish`]: conflict });
    await start(fetcher, state({}, { version: 1, savedVersion: 1 }));
    expect(await run(() => hook().publish())).toBe(false);
    expect([live.hook?.conflict, live.hook?.status]).toEqual([
      true,
      {
        kind: "error",
        message: "Couldn't publish. This page was changed somewhere else.",
        retry: false,
      },
    ]);
  });

  test("a failed save before publishing stops the publish", async () => {
    const { fetcher, calls } = server({});
    await start(fetcher, state());
    expect(await run(() => hook().publish())).toBe(false);
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([`PUT ${PAGE}`]);
    expect(live.hook?.status).toEqual({
      kind: "error",
      message: "Couldn't save. Check your connection and try again.",
      retry: true,
    });
  });

  test("Overwrite saves over the stored revision and closes the conflict", async () => {
    const stored = { status: 200, body: { data: { item: { data: {} }, _rev: "r9" } } };
    const { fetcher, calls } = server({ [`GET ${PAGE}`]: stored, [`PUT ${PAGE}`]: ok("r10") });
    await start(fetcher, state());
    await run(() => hook().overwrite());
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      `GET ${PAGE}`,
      `PUT ${PAGE}`,
    ]);
    expect((calls[1]?.body as Record<string, unknown> | undefined)?.["_rev"]).toBe("r9");
    expect([live.state?.rev, live.hook?.conflict, live.hook?.status]).toEqual([
      "r10",
      false,
      { kind: "saved" },
    ]);
  });

  test("Overwrite that can't read the stored page shows a retryable connection error", async () => {
    const { fetcher, calls } = server({});
    await start(fetcher, state());
    await run(() => hook().overwrite());
    expect(calls.map((call) => call.method)).toEqual(["GET"]);
    expect(live.hook?.status).toEqual({
      kind: "error",
      message: "Couldn't save. Check your connection and try again.",
      retry: true,
    });
  });
});

describe("useSave size limit (W-091, S0-9)", () => {
  test("a layout of exactly the limit is saved", async () => {
    const big = layoutOfBytes(MAX_LAYOUT_BYTES);
    expect(byteLength(big)).toBe(MAX_LAYOUT_BYTES);
    const { fetcher, calls } = server({ [`PUT ${PAGE}`]: ok("r2") });
    await start(fetcher, state({ layout: big }));
    expect(await run(() => hook().save())).toBe("r2");
    expect(calls.length).toBe(1);
  });

  test("the size message rounds up to whole KB and names the limit", () => {
    expect(tooLargeMessage(MAX_LAYOUT_BYTES + 1)).toBe(
      "Couldn't save. This page is 513 KB and the limit is 512 KB. Remove some content and save again.",
    );
  });
});
