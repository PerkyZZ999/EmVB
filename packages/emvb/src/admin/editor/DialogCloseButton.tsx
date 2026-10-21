import { Button, Dialog } from "@cloudflare/kumo";
import type * as React from "react";
import { BUTTON } from "../ui.ts";

/** The secondary Close or Cancel button that closes a Kumo dialog (UX-009). */
export function DialogCloseButton({ children }: { children: React.ReactNode }) {
  return (
    <Dialog.Close
      render={(props) => (
        <Button {...props} variant="secondary" className={BUTTON}>
          {children}
        </Button>
      )}
    />
  );
}
