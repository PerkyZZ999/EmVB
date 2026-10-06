import { Input } from "@cloudflare/kumo";
import {
  LinkSimpleIcon,
  MinusIcon,
  RectangleIcon,
  SquareIcon,
  SquaresFourIcon,
  TextAlignLeftIcon,
  TextHIcon,
  TextTIcon,
  ListBulletsIcon,
  CaretDownIcon,
  CursorClickIcon,
  ImageIcon,
  GraphIcon,
  BrowserIcon,
  StarIcon,
  YoutubeLogoIcon,
  TextboxIcon,
  CheckSquareIcon,
  RadioButtonIcon,
  PaperPlaneTiltIcon,
  ClipboardTextIcon,
  NotePencilIcon,
  RowsIcon,
} from "@phosphor-icons/react";
import * as React from "react";
import { ELEMENT_DESCRIPTORS, type ElementType } from "../../../core/index.ts";
import { NEW_ELEMENT_MIME } from "../dnd/drop-target.ts";
import { FIELD } from "../../ui.ts";
import { dragStash } from "../dnd/drag-stash.ts";

const ICONS: Record<string, typeof TextHIcon> = {
  container: SquareIcon,
  "div-block": SquareIcon,
  "layout-section": RowsIcon,
  flexbox: SquaresFourIcon,
  spacer: RectangleIcon,
  divider: MinusIcon,
  heading: TextHIcon,
  text: TextAlignLeftIcon,
  label: TextTIcon,
  link: LinkSimpleIcon,
  button: CursorClickIcon,
  list: ListBulletsIcon,
  image: ImageIcon,
  icon: StarIcon,
  svg: GraphIcon,
  tabs: BrowserIcon,
  accordion: ListBulletsIcon,
  menu: CaretDownIcon,
  "menu-item": CaretDownIcon,
  video: YoutubeLogoIcon,
  form: ClipboardTextIcon,
  "text-input": TextboxIcon,
  textarea: NotePencilIcon,
  select: TextboxIcon,
  checkbox: CheckSquareIcon,
  radio: RadioButtonIcon,
  submit: PaperPlaneTiltIcon,
  "post-title": TextHIcon,
  "post-excerpt": TextAlignLeftIcon,
  "post-content": NotePencilIcon,
  "post-image": ImageIcon,
  "post-link": LinkSimpleIcon,
  "post-date": TextTIcon,
  "post-author": TextTIcon,
  loop: ListBulletsIcon,
};

const GROUPS = [
  { id: "layout", label: "Layout" },
  { id: "content", label: "Content" },
  { id: "dynamic", label: "Dynamic" },
  { id: "form", label: "Form" },
] as const;

export function AddPanel({
  onAdd,
  defaultQuery = "",
  formsAvailable = true,
}: {
  onAdd: (type: ElementType) => void;
  /** Test-only initial search string. */
  defaultQuery?: string;
  /** Hide the Form group when the forms plugin is missing (W-036). */
  formsAvailable?: boolean;
}) {
  const [query, setQuery] = React.useState(defaultQuery);
  const q = query.trim().toLowerCase();
  const matched = ELEMENT_DESCRIPTORS.filter(
    (d) =>
      d.type !== "tab-panel" &&
      (formsAvailable || d.group !== "form") &&
      (!q || d.name.toLowerCase().includes(q)),
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
                        dragStash.new(tile.type);
                      }}
                      onClick={() => onAdd(tile.type as ElementType)}
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
