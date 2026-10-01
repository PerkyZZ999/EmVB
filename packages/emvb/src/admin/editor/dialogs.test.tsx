import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";
import { ConflictDialog, DeleteSubtreeDialog, LeaveDialog } from "./dialogs.tsx";

afterEach(cleanup);

// W-091: the conflict, leave and delete dialogs were reached only through whole-editor tests,
// one path each; the other buttons and the plural title weren't checked.

const calls: string[] = [];
const log = (name: string) => () => {
  calls.push(name);
};
const press = async (name: string) => {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.trim() === name,
  );
  if (!button) throw new Error(`no ${name} button`);
  await act(async () => button.click());
  await settle();
};
const dialog = (kind: string) => document.querySelector(`[data-emvb-dialog="${kind}"]`);

describe("editor dialogs (W-091)", () => {
  test("the conflict dialog's Reload and Overwrite each do their own thing", async () => {
    calls.length = 0;
    await mount(
      <ConflictDialog
        open
        onOpenChange={log("open-change")}
        onReload={log("reload")}
        onOverwrite={log("overwrite")}
      />,
    );
    expect(dialog("conflict")?.textContent).toContain("This page was changed somewhere else");
    await press("Reload page");
    await press("Overwrite");
    expect(calls).toEqual(["reload", "overwrite"]);
  });

  test("the leave dialog discards, saves and leaves, or keeps editing", async () => {
    calls.length = 0;
    const changes: boolean[] = [];
    await mount(
      <LeaveDialog
        open
        onOpenChange={(open) => changes.push(open)}
        onDiscard={log("discard")}
        onSaveAndLeave={log("save-and-leave")}
      />,
    );
    await press("Discard changes");
    await press("Save and leave");
    expect(calls).toEqual(["discard", "save-and-leave"]);
    await press("Keep editing");
    expect(changes).toEqual([false]);
  });

  test("the delete dialog counts the elements inside, singular and plural, and confirms", async () => {
    calls.length = 0;
    await mount(
      <DeleteSubtreeDialog
        open
        onOpenChange={log("open-change")}
        label="Container"
        count={5}
        onConfirm={log("confirm")}
      />,
    );
    expect(dialog("delete-subtree")?.textContent).toContain(
      "Delete Container and the 4 elements inside it?",
    );
    await press("Delete");
    expect(calls).toEqual(["confirm"]);
    await mount(
      <DeleteSubtreeDialog
        open
        onOpenChange={log("open-change")}
        label="Tabs"
        count={2}
        onConfirm={log("confirm")}
      />,
    );
    expect(dialog("delete-subtree")?.textContent).toContain(
      "Delete Tabs and the 1 element inside it?",
    );
  });
});
