import { Input } from "@cloudflare/kumo";
import {
  LinkSimpleIcon,
  MinusIcon,
  RectangleIcon,
  SquareIcon,
  TextAlignLeftIcon,
  TextHIcon,
  TextTIcon,
  ListBulletsIcon,
  CursorClickIcon,
  ImageIcon,
} from "@phosphor-icons/react";
import * as React from "react";
import { ELEMENT_DESCRIPTORS, type ElementType } from "../../../core/index.ts";
import { NEW_ELEMENT_MIME } from "../dnd/drop-target.ts";
import { FIELD } from "../../ui.ts";

const ICONS: Record<string, typeof TextHIcon> = {
  container: SquareIcon,
  spacer: RectangleIcon,
  divider: MinusIcon,
  heading: TextHIcon,
  text: TextAlignLeftIcon,
  label: TextTIcon,
  link: LinkSimpleIcon,
  button: CursorClickIcon,
  list: ListBulletsIcon,
  image: ImageIcon,
};

const GROUPS = [
  { id: "layout", label: "Layout" },
  { id: "content", label: "Content" },
] as const;

export function AddPanel({
  onAdd,
  defaultQuery = "",
}: {
  onAdd: (type: ElementType) => void;
  /** Test-only initial search string. */
  defaultQuery?: string;
}) {
  const [query, setQuery] = React.useState(defaultQuery);
  const q = query.trim().toLowerCase();
  const matched = ELEMENT_DESCRIPTORS.filter(
    (d) => d.group !== ("form" as string) && (!q || d.name.toLowerCase().includes(q)),
  );
  return (
    <div className="emvb-panel-body" data-emvb-panel="add">
      <Input
        label="Search elements"
        className={FIELD}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search elements"
      />
      {matched.length === 0 ? (
        <p className="emvb-helper">No elements match &quot;{query.trim()}&quot;.</p>
      ) : (
        GROUPS.map((group) => {
          const tiles = matched.filter((d) => d.group === group.id);
          if (tiles.length === 0) return null;
          return (
            <div key={group.id} className="emvb-add-group">
              <h3 className="emvb-add-group-title">{group.label}</h3>
              <div className="emvb-add-tiles" aria-label={group.label}>
                {tiles.map((tile) => {
                  const Icon = ICONS[tile.type] ?? SquareIcon;
                  return (
                    <button
                      key={tile.type}
                      type="button"
                      className="emvb-element-tile"
                      data-emvb-add-tile={tile.type}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData(NEW_ELEMENT_MIME, tile.type);
                        event.dataTransfer.effectAllowed = "copy";
                        try {
                          sessionStorage.setItem("emvb-drag-type", tile.type);
                          sessionStorage.removeItem("emvb-drag-id");
                        } catch {
                          /* private mode */
                        }
                      }}
                      onClick={() => onAdd(tile.type as ElementType)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") onAdd(tile.type as ElementType);
                      }}
                    >
                      <Icon size={20} aria-hidden="true" />
                      <span>{tile.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
