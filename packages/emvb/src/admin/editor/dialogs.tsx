import { Button, Dialog, Loader } from "@cloudflare/kumo";
import { useMediaQuery } from "./useMediaQuery.ts";
import { useEditedNoun } from "./edited-noun.ts";
import { BUTTON, SOLID_DESTRUCTIVE, SOLID_PRIMARY, UI_CSS } from "../ui.ts";

type OpenProps = { open: boolean; onOpenChange: (open: boolean) => void };

/** 409 on save (R-006): the stored page changed; the user chooses, nothing is overwritten silently. */
export function ConflictDialog({
  open,
  onOpenChange,
  onReload,
  onOverwrite,
}: OpenProps & { onReload: () => void; onOverwrite: () => void }) {
  const noun = useEditedNoun();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="base" className="p-6">
        <style>{UI_CSS}</style>
        <div data-emvb-dialog="conflict" className="emvb-dialog">
          <Dialog.Title>This {noun} was changed somewhere else</Dialog.Title>
          <Dialog.Description>
            Someone saved this {noun} after you opened it. Reload to get their version and lose your
            unsaved changes, or overwrite their version with yours.
          </Dialog.Description>
          <div className="emvb-dialog-actions">
            <Button variant="secondary" className={BUTTON} onClick={onReload}>
              Reload page
            </Button>
            <Button
              variant="destructive"
              className={BUTTON}
              style={SOLID_DESTRUCTIVE}
              onClick={onOverwrite}
            >
              Overwrite their version
            </Button>
          </div>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}

/** Revert to published (W-193): drops the saved draft and any unsaved edits, after a confirm. */
export function RevertDialog({
  open,
  onOpenChange,
  onRevert,
}: OpenProps & { onRevert: () => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="base" className="p-6">
        <style>{UI_CSS}</style>
        <div data-emvb-dialog="revert" className="emvb-dialog">
          <Dialog.Title>Revert to the published version?</Dialog.Title>
          <Dialog.Description>
            Your saved draft and any unsaved changes are discarded, and the editor shows what is
            live now. This can't be undone.
          </Dialog.Description>
          <div className="emvb-dialog-actions">
            <Dialog.Close
              render={(props) => (
                <Button {...props} variant="secondary" className={BUTTON}>
                  Cancel
                </Button>
              )}
            />
            <Button
              variant="destructive"
              className={BUTTON}
              style={SOLID_DESTRUCTIVE}
              onClick={onRevert}
            >
              Revert to published
            </Button>
          </div>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}

/** Exit with unsaved changes (IA "Leaving the editor"). */
export function LeaveDialog({
  open,
  onOpenChange,
  onDiscard,
  onSaveAndLeave,
  saving = false,
}: OpenProps & {
  onDiscard: () => void;
  onSaveAndLeave: () => void;
  /** W-834: Save and leave is saving; the dialog shows it and ignores presses and closing. */
  saving?: boolean;
}) {
  const noun = useEditedNoun();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const unlessSaving = (run: () => void) => () => {
    if (!saving) run();
  };
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && saving) return;
        onOpenChange(next);
      }}
    >
      <Dialog size="base" className="p-6">
        <style>{UI_CSS}</style>
        <div data-emvb-dialog="leave" className="emvb-dialog">
          <Dialog.Title>Leave without saving?</Dialog.Title>
          <Dialog.Description>You have unsaved changes on this {noun}.</Dialog.Description>
          <div className="emvb-dialog-actions">
            <Dialog.Close
              render={(props) => (
                <Button {...props} variant="secondary" className={BUTTON} aria-disabled={saving}>
                  Keep editing
                </Button>
              )}
            />
            <Button
              variant="secondary"
              className={`${BUTTON} emvb-danger-text`}
              aria-disabled={saving}
              onClick={unlessSaving(onDiscard)}
            >
              Discard changes
            </Button>
            <Button
              variant="primary"
              className={BUTTON}
              style={SOLID_PRIMARY}
              icon={saving && !reducedMotion ? <Loader size={14} /> : undefined}
              aria-disabled={saving}
              aria-busy={saving}
              onClick={unlessSaving(onSaveAndLeave)}
            >
              {saving ? "Saving…" : "Save and leave"}
            </Button>
          </div>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}

/** Confirm deleting an element that has children (W-020). */
export function DeleteSubtreeDialog({
  open,
  onOpenChange,
  label,
  count,
  onConfirm,
}: OpenProps & { label: string; count: number; onConfirm: () => void }) {
  const inside = count - 1;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="base" className="p-6">
        <style>{UI_CSS}</style>
        <div data-emvb-dialog="delete-subtree" className="emvb-dialog">
          <Dialog.Title>
            Delete {label} and the {inside} element{inside === 1 ? "" : "s"} inside it?
          </Dialog.Title>
          <Dialog.Description>You can undo this with Restore right after.</Dialog.Description>
          <div className="emvb-dialog-actions">
            <Dialog.Close
              render={(props) => (
                <Button {...props} variant="secondary" className={BUTTON}>
                  Cancel
                </Button>
              )}
            />
            <Button
              variant="destructive"
              className={BUTTON}
              style={SOLID_DESTRUCTIVE}
              onClick={onConfirm}
            >
              Delete {count} elements
            </Button>
          </div>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
