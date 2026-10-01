import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { cleanup, mount } from "../../../test/dom/mount.ts";
import { TopBar, type TopBarPage } from "./TopBar.tsx";
import type { SaveStatus } from "./useSave.ts";

afterEach(cleanup);

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
}: Props = {}) {
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
    await view.click("Preview");
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
      return [view.button("Save draft").disabled, view.button("Publish").disabled];
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
