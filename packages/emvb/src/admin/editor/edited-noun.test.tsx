import { afterEach, expect, test } from "bun:test";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";
import { THEME_PARTS_COLLECTION } from "../../constants.ts";
import { ConflictDialog, LeaveDialog } from "./dialogs.tsx";
import { EditedNounContext, editedNounOf } from "./edited-noun.ts";
import { noRevisions } from "./Timeline.tsx";

afterEach(cleanup);

const none = () => undefined;

test("UX-087: the theme part editor's dialogs say theme part, not page", async () => {
  await mount(
    <EditedNounContext.Provider value={editedNounOf(THEME_PARTS_COLLECTION)}>
      <ConflictDialog open onOpenChange={none} onReload={none} onOverwrite={none} />
      <LeaveDialog open onOpenChange={none} onDiscard={none} onSaveAndLeave={none} />
    </EditedNounContext.Provider>,
  );
  await settle();
  const text = (kind: string) =>
    document.querySelector(`[data-emvb-dialog="${kind}"]`)?.textContent ?? `no ${kind} dialog`;
  expect(text("conflict")).toContain("This theme part was changed somewhere else");
  expect(text("conflict")).toContain("Someone saved this theme part after you opened it.");
  expect(text("leave")).toContain("You have unsaved changes on this theme part.");
});

test("UX-087: a page still says page, and the timeline notice follows the collection", async () => {
  await mount(<LeaveDialog open onOpenChange={none} onDiscard={none} onSaveAndLeave={none} />);
  await settle();
  expect(
    document.querySelector('[data-emvb-dialog="leave"]')?.textContent ?? "no dialog",
  ).toContain("You have unsaved changes on this page.");
  expect(noRevisions(editedNounOf(THEME_PARTS_COLLECTION))).toBe(
    "This site doesn't keep saved versions of this theme part, so there's no timeline to show.",
  );
});
