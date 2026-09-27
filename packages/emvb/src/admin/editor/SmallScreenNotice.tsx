import { Button, Empty } from "@cloudflare/kumo";
import { DesktopIcon } from "@phosphor-icons/react";
import { PAGES_URL } from "./exit.ts";

export function SmallScreenNotice() {
  return (
    <div className="emvb-state emvb-small-screen" data-emvb-small-screen="">
      <Empty
        icon={<DesktopIcon size={32} aria-hidden="true" />}
        title="EmVB needs a larger screen"
        description="The editor works on screens at least 1024 px wide, and 1280 px or wider is best."
        contents={
          <Button variant="secondary" onClick={() => window.location.assign(PAGES_URL)}>
            Back to Visual pages
          </Button>
        }
      />
    </div>
  );
}
