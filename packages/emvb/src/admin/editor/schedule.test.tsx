import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { s1Page } from "../../../test/fixtures/layouts.ts";
import { emptyDesign } from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { scheduleEntry } from "../content-api.ts";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";
import { localInputValue, ScheduleDialog } from "./ScheduleDialog.tsx";
import { editorReducer, type EditorState } from "./store.ts";
import { loadEntry } from "./useEditorData.ts";

// W-1027: Schedule publish from the editor. EmDash (1.4 and 1.5) publishes the saved draft at
// the chosen time: POST …/schedule { scheduledAt, _rev }; DELETE cancels.

afterEach(async () => {
  await cleanup();
});

type Call = { path: string; method: string; body: unknown };
function recording(answer: unknown) {
  const calls: Call[] = [];
  const fetcher: Fetcher = async (path, init) => {
    calls.push({
      path,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return Response.json({ data: answer });
  };
  return { fetcher, calls };
}

describe("schedule API (W-1027)", () => {
  test("scheduling sends the time as ISO with the revision; cancelling deletes", async () => {
    const at = new Date("2026-12-01T14:30:00Z");
    const { fetcher, calls } = recording({
      item: { status: "scheduled", scheduledAt: "2026-12-01T14:30:00.000Z" },
      _rev: "rev-2",
    });
    expect(
      await scheduleEntry(fetcher, "/_emdash/api/content/emvb_pages", "01 P", at, "rev-1"),
    ).toEqual({
      rev: "rev-2",
      status: "scheduled",
      scheduledAt: "2026-12-01T14:30:00.000Z",
    });
    await scheduleEntry(fetcher, "/_emdash/api/content/emvb_pages", "01 P", null, "rev-2");
    expect(calls).toEqual([
      {
        path: "/_emdash/api/content/emvb_pages/01%20P/schedule",
        method: "POST",
        body: { scheduledAt: "2026-12-01T14:30:00.000Z", _rev: "rev-1" },
      },
      {
        path: "/_emdash/api/content/emvb_pages/01%20P/schedule",
        method: "DELETE",
        body: undefined,
      },
    ]);
  });

  test("a published page with scheduled changes stays Changes not published", async () => {
    const { fetcher } = recording({
      item: { status: "published", draftRevisionId: "d1", scheduledAt: "2026-12-01T14:30:00.000Z" },
      _rev: "r",
    });
    expect((await scheduleEntry(fetcher, "/x", "1", new Date(), null)).status).toBe("changed");
  });

  test("the editor loads the scheduled time; the store keeps it until Publish clears it", async () => {
    const { fetcher } = recording({
      item: { id: "01P", status: "scheduled", scheduledAt: "2026-12-01T14:30:00.000Z", data: {} },
      _rev: "r1",
    });
    expect((await loadEntry(fetcher, "01P")).scheduledAt).toBe("2026-12-01T14:30:00.000Z");
    const base: EditorState = {
      id: "01P",
      page: {
        title: "T",
        slug: "t",
        canvasMode: "site-layout",
        seoTitle: "",
        seoDescription: "",
        layout: s1Page(),
      },
      status: "draft",
      rev: "r1",
      design: emptyDesign(),
      designRevision: null,
      selectedId: null,
      version: 0,
      savedVersion: 0,
      lastDeleted: null,
    };
    let state = editorReducer(base, {
      type: "scheduled",
      rev: "r2",
      status: "scheduled",
      at: "2026-12-01T14:30:00.000Z",
    });
    expect([state.status, state.scheduledAt, state.rev]).toEqual([
      "scheduled",
      "2026-12-01T14:30:00.000Z",
      "r2",
    ]);
    state = editorReducer(state, { type: "published", rev: "r3" });
    expect([state.status, state.scheduledAt]).toEqual(["published", null]);
  });
});

describe("Schedule publishing dialog (W-1027)", () => {
  const now = () => new Date(2026, 10, 13, 15, 0);
  async function open(scheduledAt: string | null, answer: string | null = null) {
    const asked: (Date | null)[] = [];
    let closed = false;
    await mount(
      <ScheduleDialog
        open
        onOpenChange={(next) => {
          if (!next) closed = true;
        }}
        scheduledAt={scheduledAt}
        onSchedule={async (at) => {
          asked.push(at);
          return answer;
        }}
        now={now}
      />,
    );
    await settle();
    const input = document.querySelector<HTMLInputElement>('input[type="datetime-local"]');
    if (!input) throw new Error("no time field");
    return { asked, input, closed: () => closed };
  }
  const press = (name: string) =>
    act(async () =>
      [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === name)?.click(),
    );
  const typeTime = (input: HTMLInputElement, value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

  test("it suggests tomorrow at 9:00 and schedules the local time chosen", async () => {
    const { asked, input, closed } = await open(null);
    expect(input.value).toBe("2026-11-14T09:00");
    expect(input.min).toBe(localInputValue(now()));
    await typeTime(input, "2026-11-20T18:45");
    await press("Schedule");
    await settle();
    expect(asked.map((d) => d?.getTime())).toEqual([new Date(2026, 10, 20, 18, 45).getTime()]);
    expect(closed()).toBe(true);
  });

  test("a time already past, or less than a minute away, is refused with a reason", async () => {
    const { asked, input } = await open(null);
    await typeTime(input, "2026-11-13T15:00");
    await press("Schedule");
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      "Choose a time at least a minute from now.",
    );
    expect(asked).toEqual([]);
  });

  test("a scheduled page shows its time, can change it or cancel it; failures stay open", async () => {
    const at = new Date(2026, 10, 20, 18, 45).toISOString();
    const { asked, input, closed } = await open(at, "Scheduled date must be in the future");
    expect(input.value).toBe("2026-11-20T18:45");
    expect(document.body.textContent).toContain("Change the time or cancel it.");
    await press("Cancel schedule");
    await settle();
    expect(asked).toEqual([null]);
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      "Scheduled date must be in the future",
    );
    expect(closed()).toBe(false);
  });
});
