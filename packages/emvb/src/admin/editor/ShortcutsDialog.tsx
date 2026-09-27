import { Button, Dialog } from "@cloudflare/kumo";
import { SHORTCUTS } from "./shortcuts.ts";

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
        <p>Shortcuts don't fire while a text field has focus, except Ctrl/Cmd+S.</p>
        <Dialog.Close render={(props) => <Button {...props}>Close</Button>} />
      </Dialog>
    </Dialog.Root>
  );
}
