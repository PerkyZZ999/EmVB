import { Button } from "@cloudflare/kumo";
import { FileArrowUpIcon } from "@phosphor-icons/react";
import { BUTTON } from "../ui.ts";

/**
 * Opens an import dialog, next to the list's New button: Import from Elementor (W-945) or
 * Import HTML (W-1074, WordPress posts and HTML pages).
 */
export function ImportButton({
  onClick,
  source = "elementor",
}: {
  onClick: () => void;
  source?: "elementor" | "html";
}) {
  return (
    <Button
      variant="secondary"
      className={BUTTON}
      icon={<FileArrowUpIcon aria-hidden="true" />}
      onClick={onClick}
      {...(source === "html"
        ? { "data-emvb-import-html": "" }
        : { "data-emvb-import-elementor": "" })}
    >
      {source === "html" ? "Import HTML" : "Import from Elementor"}
    </Button>
  );
}
