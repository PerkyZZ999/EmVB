import * as React from "react";
import { Dialog } from "@cloudflare/kumo";
import { keyCombos, SHORTCUTS } from "./shortcuts.ts";
import { DialogCloseButton } from "./DialogCloseButton.tsx";

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
                  {/* W-864: key boxes, as the command palette's tips; the text still reads "Ctrl/Cmd+K". */}
                  <td>
                    {keyCombos(keys).map(({ before, keys: combo }, i) => (
                      <React.Fragment key={i}>
                        {before}
                        {combo.map((key, k) => (
                          <React.Fragment key={k}>
                            {k > 0 ? "+" : null}
                            <kbd>{key}</kbd>
                          </React.Fragment>
                        ))}
                      </React.Fragment>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="emvb-helper">
            Shortcuts don't fire while a text field has focus, except Ctrl/Cmd+S and Ctrl/Cmd+K. In
            a dialog, only Ctrl/Cmd+S fires.
          </p>
          <div className="emvb-dialog-actions">
            <DialogCloseButton>Close</DialogCloseButton>
          </div>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
