import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { cleanup, mount } from "../../../test/dom/mount.ts";
import { TopBar, type TopBarPage } from "./TopBar.tsx";
import type { SaveStatus } from "./useSave.ts";

afterEach(cleanup);

for (const action of ["save", "publish"] as const) {
  test(`W-726: ${action} reports pending work over an earlier saved status`, async () => {
    const view = await bar({ busy: action, status: { kind: "saved" } });
    expect(view.statusText()).toBe(action === "save" ? "Saving…" : "Publishing…");
    const active = view.host.querySelector(`.emvb-${action}-button`);
    const other = view.host.querySelector(`.emvb-${action === "save" ? "publish" : "save"}-button`);
    expect(active?.getAttribute("aria-busy")).toBe("true");
    expect(other?.getAttribute("aria-busy")).toBe("false");
    expect(Boolean(active?.querySelector('svg[role="status"]'))).toBe(true);
    expect(Boolean(other?.querySelector('svg[aria-hidden="true"]'))).toBe(true);
  });
}

// W-091: the top bar was only reached through whole-editor tests, which left its status text,
// Retry, busy states and button wiring unchecked.

type Props = {
  page?: TopBarPage | null;
  dirty?: boolean;
  status?: SaveStatus;
  busy?: "save" | "publish" | null;
  siteStyles?: boolean;
};

async function bar({
  page = { title: "Home", status: "draft" },
  dirty = false,
  status = { kind: "idle" },
  busy = null,
  siteStyles = true,
  canRevert,
}: Props & { canRevert?: boolean } = {}) {
  const calls: string[] = [];
  const log = (name: string) => () => {
    calls.push(name);
  };
  const host = await mount(
    <TopBar
      page={page}
      dirty={dirty}
      status={status}
      busy={busy}
      onExit={log("exit")}
      onShortcuts={log("shortcuts")}
      onSiteStyles={siteStyles ? log("site-styles") : undefined}
      onPreview={log("preview")}
      onSave={log("save")}
      onPublish={log("publish")}
      {...(canRevert === undefined ? {} : { canRevert, onRevert: log("revert") })}
    />,
  );
  const button = (name: string) => {
    const found = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.getAttribute("aria-label") === name || b.textContent?.trim() === name,
    );
    if (!found) throw new Error(`no ${name} button`);
    return found;
  };
  const click = async (name: string) => {
    await act(async () => button(name).click());
  };
  const statusText = () => host.querySelector(".emvb-save-status")?.textContent ?? null;
  return { host, calls, button, click, statusText };
}

describe("top bar save status (W-091)", () => {
  test("saving, saved, unsaved and idle each read as they should", async () => {
    expect((await bar({ status: { kind: "saving" }, dirty: true })).statusText()).toBe("Saving…");
    expect((await bar({ status: { kind: "saved" } })).statusText()).toBe("Saved");
    expect((await bar({ status: { kind: "saved" }, dirty: true })).statusText()).toBe(
      "Unsaved changes",
    );
    expect((await bar({ status: { kind: "idle" } })).statusText()).toBe("");
  });

  test("the status is a polite live region", async () => {
    const { host } = await bar();
    const region = host.querySelector(".emvb-save-status");
    expect([region?.getAttribute("role"), region?.getAttribute("aria-live")]).toEqual([
      "status",
      "polite",
    ]);
  });

  test("an error shows its message over unsaved changes, and Retry saves again", async () => {
    const view = await bar({
      status: { kind: "error", message: "Couldn't save. Offline.", retry: true },
      dirty: true,
    });
    expect(view.statusText()).toBe("Couldn't save. Offline.Retry");
    await view.click("Retry");
    expect(view.calls).toEqual(["save"]);
  });

  test("an error that can't be retried has no Retry", async () => {
    const view = await bar({ status: { kind: "error", message: "Too big.", retry: false } });
    expect(view.statusText()).toBe("Too big.");
    expect(() => view.button("Retry")).toThrow("no Retry button");
  });
});

describe("top bar page and actions (W-091)", () => {
  test("the page title falls back to Untitled page, and the status reads Draft or Published", async () => {
    const draft = await bar({ page: { title: "", status: "draft" } });
    expect(draft.host.querySelector(".emvb-topbar-title")?.textContent).toBe("Untitled page");
    expect(draft.host.querySelector(".emvb-status")?.textContent).toBe("Draft");
    const live = await bar({ page: { title: "About", status: "published" } });
    expect(live.host.querySelector(".emvb-topbar-title")?.textContent).toBe("About");
    expect(live.host.querySelector(".emvb-status")?.textContent).toBe("Published");
  });

  test("each button calls its own action", async () => {
    const view = await bar();
    await view.click("Exit");
    await view.click("Keyboard shortcuts");
    await view.click("Site styles");
    await view.click("Preview (opens in a new tab)");
    await view.click("Save draft");
    await view.click("Publish");
    expect(view.calls).toEqual(["exit", "shortcuts", "site-styles", "preview", "save", "publish"]);
  });

  test("the save button says when there are unsaved changes", async () => {
    expect((await bar({ dirty: true })).button("Save draft (unsaved changes)")).toBeTruthy();
    expect((await bar({ dirty: false })).button("Save draft")).toBeTruthy();
  });

  test("while saving or publishing both Save draft and Publish are disabled", async () => {
    const disabled = async (busy: "save" | "publish" | null) => {
      const view = await bar({ busy });
      return [
        view.button("Save draft").getAttribute("aria-disabled") === "true",
        view.button("Publish").getAttribute("aria-disabled") === "true",
      ];
    };
    expect(await disabled("save")).toEqual([true, true]);
    expect(await disabled("publish")).toEqual([true, true]);
    expect(await disabled(null)).toEqual([false, false]);
  });

  test("before the page loads only Exit and Keyboard shortcuts show", async () => {
    const view = await bar({ page: null });
    const names = [...view.host.querySelectorAll("button")].map(
      (b) => b.getAttribute("aria-label") ?? b.textContent?.trim(),
    );
    expect(names).toEqual(["Exit", "Keyboard shortcuts"]);
    expect(view.statusText()).toBeNull();
  });
});

test("UX-031: the page title carries its whole name as a tooltip, since a long one ellipsizes", async () => {
  const long = "Spring collection launch landing page for the north american market";
  const view = await bar({ page: { title: long, status: "draft" } });
  const title = view.host.querySelector(".emvb-topbar-title");
  expect(title?.getAttribute("title") ?? null).toBe(long);
  const untitled = await bar({ page: { title: "", status: "draft" } });
  expect(untitled.host.querySelector(".emvb-topbar-title")?.getAttribute("title") ?? null).toBe(
    "Untitled page",
  );
});

for (const busy of ["save", "publish"] as const) {
  test(`W-816: while ${busy} is busy, Save draft and Publish keep focus and ignore repeat presses`, async () => {
    const view = await bar({ busy });
    const save = view.button("Save draft");
    const publish = view.button("Publish");
    expect([save.disabled, publish.disabled]).toEqual([false, false]);
    save.focus();
    await view.click("Save draft");
    expect(document.activeElement).toBe(save);
    publish.focus();
    await view.click("Publish");
    expect(document.activeElement).toBe(publish);
    expect(view.calls).toEqual([]);
  });
}

test("W-816: when idle, Save draft and Publish still run", async () => {
  const idle = await bar();
  await idle.click("Save draft");
  await idle.click("Publish");
  expect(idle.calls).toEqual(["save", "publish"]);
});

test("W-828: a save in flight keeps Revert focusable and ignores the press; idle it reverts", async () => {
  const page = { title: "Home", status: "published" } as const;
  const view = await bar({ page, dirty: true, busy: "save", canRevert: true });
  const revert = view.button("Revert to published");
  expect(revert.disabled).toBe(false);
  expect(revert.getAttribute("aria-disabled")).toBe("true");
  revert.focus();
  await view.click("Revert to published");
  expect(document.activeElement).toBe(revert);
  expect(view.calls).toEqual([]);
  const idle = await bar({ page, dirty: true, canRevert: true });
  await idle.click("Revert to published");
  expect(idle.calls).toEqual(["revert"]);
});
