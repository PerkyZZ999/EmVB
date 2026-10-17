import { Button, Input } from "@cloudflare/kumo";
import * as React from "react";
import { elementIcon } from "../element-chrome.ts";
import {
  ELEMENT_DESCRIPTORS,
  SECTION_RECIPES,
  typeMayAddScript,
  type ElementType,
} from "../../../core/index.ts";
import { NEW_ELEMENT_MIME } from "../dnd/drop-target.ts";
import { BUTTON, FIELD } from "../../ui.ts";
import { isCancelEscape } from "../ime.ts";
import { matchesSearch } from "../../search.ts";
import { dragStash } from "../dnd/drag-stash.ts";

const GROUPS = [
  { id: "layout", label: "Layout" },
  { id: "content", label: "Content" },
  { id: "dynamic", label: "Dynamic" },
  { id: "form", label: "Form" },
] as const;

export function AddPanel({
  onAdd,
  onRecipe,
  defaultQuery = "",
  formsAvailable = true,
}: {
  onAdd: (type: ElementType) => void;
  /** Adds a section recipe (W-320); without it, recipes are not offered. */
  onRecipe?: (id: string) => void;
  /** Test-only initial search string. */
  defaultQuery?: string;
  /** Hide the Form group when the forms plugin is missing (W-036). */
  formsAvailable?: boolean;
}) {
  const [query, setQuery] = React.useState(defaultQuery);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const clear = () => {
    setQuery("");
    searchRef.current?.focus();
  };
  const matched = ELEMENT_DESCRIPTORS.filter(
    (d) =>
      d.type !== "tab-panel" &&
      (formsAvailable || d.group !== "form") &&
      matchesSearch(query, d.name, d.group),
  );
  const recipes = onRecipe
    ? SECTION_RECIPES.filter((r) => matchesSearch(query, r.name, r.description, "recipe section"))
    : [];
  return (
    <div className="emvb-panel-body" data-emvb-panel="add">
      {/* UX-053: named like the other searches; a visible heading only repeated the placeholder. */}
      <Input
        aria-label="Search elements"
        type="search"
        className={FIELD}
        ref={searchRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          // UX-013: Escape clears a search first, as Site styles searches do.
          if (isCancelEscape(event) && query) {
            event.stopPropagation();
            setQuery("");
          }
        }}
        placeholder="Search elements…"
      />
      {matched.length === 0 && recipes.length === 0 ? (
        <div className="emvb-add-nomatch" data-emvb-add-nomatch="">
          <p className="emvb-helper" role="status">
            No elements match &quot;{query.trim()}&quot;.
          </p>
          <Button type="button" variant="secondary" className={BUTTON} onClick={clear}>
            Clear search
          </Button>
        </div>
      ) : (
        GROUPS.map((group) => {
          const tiles = matched.filter((d) => d.group === group.id);
          if (tiles.length === 0) return null;
          return (
            <div key={group.id} className="emvb-add-group">
              <h3 className="emvb-add-group-title">{group.label}</h3>
              <div className="emvb-add-tiles" aria-label={group.label}>
                {tiles.map((tile) => {
                  const Icon = elementIcon(tile.type);
                  return (
                    <button
                      key={tile.type}
                      type="button"
                      className="emvb-element-tile"
                      data-emvb-add-tile={tile.type}
                      // UX-029: the JS badge is drawn for sighted users; this says the same aloud.
                      aria-description={
                        typeMayAddScript(tile.type) ? "Adds a small script to the page" : undefined
                      }
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
                      {typeMayAddScript(tile.type) && (
                        <span
                          className="emvb-js-badge"
                          title="Adds a small script to the page; everything else is zero-JS"
                          aria-hidden="true"
                        >
                          JS
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
      {onRecipe && recipes.length > 0 && (
        <div className="emvb-add-group" data-emvb-recipes="">
          <h3 className="emvb-add-group-title">Section recipes</h3>
          <p className="emvb-helper">
            Whole sections that use your Site styles colours, sizes and classes.
          </p>
          <div className="emvb-recipe-list" aria-label="Section recipes">
            {recipes.map((recipe) => (
              <button
                key={recipe.id}
                type="button"
                className="emvb-recipe-tile"
                data-emvb-recipe={recipe.id}
                onClick={() => onRecipe(recipe.id)}
              >
                <span className="emvb-recipe-name">{recipe.name}</span>
                <span className="emvb-recipe-desc">{recipe.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
