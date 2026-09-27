import { Button, Dialog } from "@cloudflare/kumo";
import { BUTTON, SOLID_DESTRUCTIVE, SOLID_PRIMARY, UI_CSS } from "../ui.ts";

type OpenProps = { open: boolean; onOpenChange: (open: boolean) => void };

/** 409 on save (R-006): the stored page changed; the user chooses, nothing is overwritten silently. */
export function ConflictDialog({
  open,
  onOpenChange,
  onReload,
  onOverwrite,
}: OpenProps & { onReload: () => void; onOverwrite: () => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="base" className="p-6">
        <style>{UI_CSS}</style>
        <div data-emvb-dialog="conflict" className="emvb-dialog">
          <Dialog.Title>This page was changed somewhere else</Dialog.Title>
          <Dialog.Description>
            Someone saved this page after you opened it. Reload to get their version and lose your
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
              Overwrite
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
}: OpenProps & { onDiscard: () => void; onSaveAndLeave: () => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="base" className="p-6">
        <style>{UI_CSS}</style>
        <div data-emvb-dialog="leave" className="emvb-dialog">
          <Dialog.Title>Leave without saving?</Dialog.Title>
          <Dialog.Description>You have unsaved changes on this page.</Dialog.Description>
          <div className="emvb-dialog-actions">
            <Dialog.Close
              render={(props) => (
                <Button {...props} variant="secondary" className={BUTTON}>
                  Keep editing
                </Button>
              )}
            />
            <Button
              variant="secondary"
              className={`${BUTTON} emvb-danger-text`}
              onClick={onDiscard}
            >
              Discard changes
            </Button>
            <Button
              variant="primary"
              className={BUTTON}
              style={SOLID_PRIMARY}
              onClick={onSaveAndLeave}
            >
              Save and leave
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
          <Dialog.Description>This can be undone with Restore after delete.</Dialog.Description>
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
              Delete
            </Button>
          </div>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
