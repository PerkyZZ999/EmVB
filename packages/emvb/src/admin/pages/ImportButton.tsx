import { Button } from "@cloudflare/kumo";
import { FileArrowUpIcon } from "@phosphor-icons/react";
import { BUTTON } from "../ui.ts";

/** Opens Import from Elementor (W-945), next to the list's New button. */
export function ImportButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="secondary"
      className={BUTTON}
      icon={<FileArrowUpIcon aria-hidden="true" />}
      onClick={onClick}
      data-emvb-import-elementor=""
    >
      Import from Elementor
    </Button>
  );
}
