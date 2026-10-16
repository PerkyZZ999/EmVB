import { Button, Dialog } from "@cloudflare/kumo";
import { SHORTCUTS } from "./shortcuts.ts";
import { BUTTON } from "../ui.ts";

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="base" className="p-6">
        <div className="emvb-dialog" data-emvb-dialog="shortcuts">
          <Dialog.Title>Keyboard shortcuts</Dialog.Title>
          <table className="emvb-shortcuts">
            <tbody>
              {SHORTCUTS.map(({ action, keys }) => (
                <tr key={action}>
                  <td>{action}</td>
                  <td>{keys}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="emvb-helper">
            Shortcuts don't fire while a text field has focus, except Ctrl/Cmd+S and Ctrl/Cmd+K. In
            a dialog, only Ctrl/Cmd+S fires.
          </p>
          <div className="emvb-dialog-actions">
            <Dialog.Close
              render={(props) => (
                <Button {...props} variant="secondary" className={BUTTON}>
                  Close
                </Button>
              )}
            />
          </div>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
