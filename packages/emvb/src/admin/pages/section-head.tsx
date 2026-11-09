import type { Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

/** A card's heading row: an icon tile, the title and one line on what the card is for (W-477). */
export function SectionHead({
  id,
  icon: SectionIcon,
  title,
  children,
}: {
  id: string;
  icon: Icon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="emvb-agents-head">
      <span className="emvb-agents-icon" aria-hidden="true">
        <SectionIcon size={18} />
      </span>
      <div>
        <h2 id={id}>{title}</h2>
        <p>{children}</p>
      </div>
    </div>
  );
}
