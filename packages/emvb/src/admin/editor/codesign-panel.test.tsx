import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import * as React from "react";
import { emptyDesign } from "../../core/schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout } from "../../core/schema/layout.ts";
import type { Proposal } from "../../core/proposals.ts";
import { mount, settle, unmount } from "../../../test/dom/mount.ts";
import type { Fetcher } from "../api.ts";
import { initialState } from "./editor-chrome.tsx";
import { CoDesignPanel } from "./panels/CoDesignPanel.tsx";
import { emptyHistory, historyReducer, type EditorHistory } from "./store.ts";
import { useCoDesign } from "./useCoDesign.ts";

afterEach(async () => {
  await unmount();
  requests = [];
  seenAt = null;
});

const layout = (): Layout =>
  ({
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [{ id: "head0001", type: "heading", props: { text: "Before", level: 1 } }],
    },
  }) as Layout;
const proposal: Proposal = {
  version: 1,
  target: { collection: "emvb_pages", id: "page1" },
  baseRevision: "rev-1",
  baseDesignRevision: null,
  ops: [
    { kind: "update", id: "head0001", set: { props: { text: "After" } } },
    {
      kind: "insert",
      parentId: "root0001",
      index: 1,
      node: { id: "text0002", type: "text", props: { text: "Added" } },
    },
  ],
};

type Call = { path: string; body: unknown };
let requests: { id: string; prompt: string; createdAt: string; status: string }[] = [];
let seenAt: string | null = null;
function api(calls: Call[]): Fetcher {
  let withdrawn = false;
  return async (path, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, body });
    if (path.endsWith("/proposals/withdraw")) withdrawn = true;
    if (path.endsWith("/requests/create")) {
      const prompt = (body as { prompt: string }).prompt;
      if (prompt.includes("too much"))
        return Response.json(
          {
            error: {
              code: "INVALID_REQUEST",
              message: "This page already has 5 requests waiting.",
            },
          },
          { status: 422 },
        );
      requests.unshift({
        id: "1111222233334444",
        prompt: prompt.trim(),
        createdAt: "",
        status: "open",
      });
      return Response.json({ data: { request: requests[0] } });
    }
    if (path.endsWith("/requests/cancel")) {
      requests.splice(0, requests.length);
      return Response.json({ data: {} });
    }
    if (path.endsWith("/requests"))
      return Response.json({ data: { items: [...requests], agentSeenAt: seenAt } });
    if (path.endsWith("/proposals"))
      return Response.json({
        data: {
          items: withdrawn
            ? []
            : [{ id: "abcdef0123456789", record: { proposal, createdAt: "2026-11-08T12:00:00Z" } }],
        },
      });
    return Response.json({ data: {} });
  };
}

let history: EditorHistory;
let dispatchRef: React.Dispatch<Parameters<typeof historyReducer>[1]> = () => undefined;
function Harness({ fetcher }: { fetcher: Fetcher }) {
  const [h, dispatch] = React.useReducer(historyReducer, undefined, () =>
    emptyHistory(
      initialState(
        {
          id: "page1",
          collection: "emvb_pages",
          title: "Home",
          slug: "home",
          canvasMode: "full",
          seoTitle: "",
          seoDescription: "",
          status: "draft",
          rev: "rev-1",
          layout: layout(),
        },
        { design: emptyDesign(), revision: null, publishedRevision: null, unpublished: false },
      ),
    ),
  );
  history = h;
  dispatchRef = dispatch;
  const co = useCoDesign({
    fetcher,
    collection: "emvb_pages",
    state: h.present,
    dispatch,
    changeDesign: async () => undefined,
    onError: () => undefined,
  });
  return <CoDesignPanel co={co} layout={h.present.page.layout} />;
}

const q = (s: string) => document.querySelector<HTMLElement>(s);
type Root = { children: { props: { text: string } }[] };
const rootOf = () => history.present.page.layout?.root as unknown as Root;
const headingText = () => rootOf().children[0]?.props.text;
const childCount = () => rootOf().children.length;

describe("co-design panel (W-930)", () => {
  test("lists the proposal's changes by group, each with Accept and Reject", async () => {
    await mount(<Harness fetcher={api([])} />);
    await settle();
    expect(q("[data-emvb-codesign-status]")?.textContent).toContain("1 proposal waiting");
    expect(q('[data-emvb-proposal-group="changed"]')?.textContent).toContain(
      "Change Heading text to “After”",
    );
    expect(q('[data-emvb-proposal-group="added"]')?.textContent).toContain("Add Text “Added”");
    expect(document.querySelectorAll("[data-emvb-op-accept]")).toHaveLength(2);
  });

  test("accepting one change edits the page as one undoable step; rejecting the other withdraws", async () => {
    const calls: Call[] = [];
    await mount(<Harness fetcher={api(calls)} />);
    await settle();
    await act(async () => q('[data-emvb-proposal-op="0"] [data-emvb-op-accept]')?.click());
    expect(headingText()).toBe("After");
    expect(childCount()).toBe(1);
    expect(calls.some((c) => c.path.endsWith("/withdraw"))).toBe(false);
    await act(async () => q('[data-emvb-proposal-op="1"] [data-emvb-op-reject]')?.click());
    await settle();
    expect(childCount()).toBe(1);
    // W-933: the person's review is recorded with the withdrawal.
    expect(calls.find((c) => c.path.endsWith("/withdraw"))?.body).toEqual({
      id: "abcdef0123456789",
      decision: { accepted: 1, rejected: 1 },
    });
    await act(async () => dispatchRef({ type: "undo" }));
    expect(headingText()).toBe("Before");
  });

  test("Accept all applies every change; the next save is recorded as via agent", async () => {
    const calls: Call[] = [];
    await mount(<Harness fetcher={api(calls)} />);
    await settle();
    await act(async () => q("[data-emvb-accept-all]")?.click());
    expect(headingText()).toBe("After");
    expect(childCount()).toBe(2);
    expect(q("[data-emvb-codesign-status]")?.textContent).toContain("2 accepted, not saved yet");
    await act(async () =>
      dispatchRef({ type: "saved", rev: "rev-2", version: history.present.version }),
    );
    await settle();
    expect(calls.find((c) => c.path.endsWith("/proposals/accepted"))?.body).toEqual({
      target: { collection: "emvb_pages", id: "page1" },
      accepted: 2,
    });
  });

  test("Reject all leaves the page alone and withdraws the proposal", async () => {
    const calls: Call[] = [];
    await mount(<Harness fetcher={api(calls)} />);
    await settle();
    await act(async () => q("[data-emvb-reject-all]")?.click());
    await settle();
    expect(headingText()).toBe("Before");
    expect(history.past).toHaveLength(0);
    expect(calls.some((c) => c.path.endsWith("/withdraw"))).toBe(true);
    expect(calls.some((c) => c.path.endsWith("/accepted"))).toBe(false);
  });

  test("a proposal for an older revision explains itself instead of applying", async () => {
    await mount(<Harness fetcher={api([])} />);
    await settle();
    await act(async () => dispatchRef({ type: "saved", rev: "rev-9", version: 0 }));
    await act(async () => q('[data-emvb-proposal-op="0"] [data-emvb-op-accept]')?.click());
    expect(q("[data-emvb-codesign-error]")?.textContent).toContain("earlier version of the page");
    expect(headingText()).toBe("Before");
  });

  test("W-931: no agent yet says so; a request is sent, waits, and can be cancelled", async () => {
    const calls: Call[] = [];
    await mount(<Harness fetcher={api(calls)} />);
    await settle();
    expect(q('[data-emvb-agent-connection="idle"]')?.textContent).toContain(
      "No agent has checked for requests yet",
    );
    const area = q("#emvb-agent-prompt") as HTMLTextAreaElement;
    const send = q("[data-emvb-agent-send]") as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(area, "  Tighten the hero copy ");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => send.click());
    await settle();
    expect(calls.find((c) => c.path.endsWith("/requests/create"))?.body).toEqual({
      target: { collection: "emvb_pages", id: "page1" },
      prompt: "  Tighten the hero copy ",
    });
    expect(area.value).toBe("");
    expect(q('[data-emvb-agent-request="open"]')?.textContent).toContain("Tighten the hero copy");
    await act(async () => q("[data-emvb-agent-cancel]")?.click());
    await settle();
    expect(calls.some((c) => c.path.endsWith("/requests/cancel"))).toBe(true);
    expect(q("[data-emvb-agent-request]")).toBeNull();
  });

  test("W-931: a refused request keeps the text and says why; a recent agent shows as connected", async () => {
    seenAt = new Date().toISOString();
    await mount(<Harness fetcher={api([])} />);
    await settle();
    expect(q('[data-emvb-agent-connection="connected"]')?.textContent).toContain(
      "An agent is connected",
    );
    const area = q("#emvb-agent-prompt") as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(area, "too much");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => q("[data-emvb-agent-send]")?.click());
    await settle();
    expect(q('#emvb-agent-prompt-status[role="alert"]')?.textContent).toBe(
      "This page already has 5 requests waiting.",
    );
    expect(area.value).toBe("too much");
  });
});
