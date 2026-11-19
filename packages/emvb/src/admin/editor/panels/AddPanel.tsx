import { Button, Input } from "@cloudflare/kumo";
import * as React from "react";
import { elementIcon, providerIcon } from "../element-chrome.ts";
import { componentProviders } from "@perkyzz/emvb-provider-api";
import { providerPaletteDescriptors, providerPaletteGroups } from "../provider-palette.ts";
import {
  ELEMENT_DESCRIPTORS,
  SECTION_RECIPES,
  typeMayAddScript,
  type ElementType,
} from "../../../core/index.ts";
import { useExtensionElements } from "../extensions-context.tsx";
import { PuzzlePieceIcon } from "@phosphor-icons/react";
import { NEW_ELEMENT_MIME } from "../dnd/drop-target.ts";
import { BUTTON, FIELD } from "../../ui.ts";
import { isCancelEscape } from "../ime.ts";
import { matchesSearch } from "../../search.ts";
import { dragStash } from "../dnd/drag-stash.ts";
import type { SavedSectionActions } from "../useSavedSections.ts";
import { matchingSections, SavedSectionsGroup } from "./SavedSectionsGroup.tsx";

const GROUPS = [
  { id: "layout", label: "Layout" },
  { id: "content", label: "Content" },
  { id: "dynamic", label: "Dynamic" },
  { id: "form", label: "Form" },
] as const;

export function AddPanel({
  onAdd,
  onRecipe,
  saved,
  defaultQuery = "",
  formsAvailable = true,
}: {
  onAdd: (type: ElementType | string) => void;
  /** Adds a section recipe (W-320); without it, recipes are not offered. */
  onRecipe?: (id: string) => void;
  /** My sections (W-876); without it the group is not shown. */
  saved?: SavedSectionActions;
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
  const providerDescriptors = providerPaletteDescriptors(componentProviders());
  const matched = [...ELEMENT_DESCRIPTORS, ...providerDescriptors].filter(
    (d) =>
      d.type !== "tab-panel" &&
      (formsAvailable || d.group !== "form") &&
      matchesSearch(
        query,
        d.name,
        d.group,
        "category" in d ? d.category : "",
        "keywords" in d ? d.keywords.join(" ") : "",
      ),
  );
  const extensionElements = useExtensionElements().filter((el) =>
    matchesSearch(query, el.label, el.name, "extension"),
  );
  const recipes = onRecipe
    ? [
        ...SECTION_RECIPES.map((recipe) => ({
          name: recipe.name,
          description: recipe.description,
          insertId: `native:${recipe.id}`,
          provider: "EmVB",
        })),
        ...componentProviders().flatMap((provider) =>
          (provider.recipes ?? []).map((recipe) => ({
            name: recipe.name,
            description: recipe.description,
            insertId: `provider:${provider.id}:${recipe.id}`,
            provider: provider.label,
          })),
        ),
      ].filter((recipe) =>
        matchesSearch(query, recipe.name, recipe.description, recipe.provider, "recipe section"),
      )
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
      {/* Sections first: site owners start from whole sections; single parts follow below. */}
      {onRecipe && recipes.length > 0 && (
        <div className="emvb-add-group" data-emvb-recipes="">
          <h3 className="emvb-add-group-title">Sections</h3>
          <p className="emvb-helper">Insert a whole section, then change its words.</p>
          <div className="emvb-recipe-list" aria-label="Sections">
            {recipes.map((recipe) => (
              <button
                key={recipe.insertId}
                type="button"
                className="emvb-recipe-tile"
                data-emvb-recipe={recipe.insertId}
                onClick={() => onRecipe(recipe.insertId)}
              >
                <span className="emvb-recipe-name">{recipe.name}</span>
                <span className="emvb-recipe-provider">{recipe.provider}</span>
                <span className="emvb-recipe-desc">{recipe.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {matched.length === 0 &&
      recipes.length === 0 &&
      (!saved || matchingSections(saved, query).length === 0) ? (
        <div className="emvb-add-nomatch" data-emvb-add-nomatch="">
          <p className="emvb-helper" role="status">
            No elements match &quot;{query.trim()}&quot;.
          </p>
          <Button type="button" variant="secondary" className={BUTTON} onClick={clear}>
            Clear search
          </Button>
        </div>
      ) : (
        [...GROUPS, ...providerPaletteGroups(providerDescriptors)].map((group) => {
          const tiles = matched.filter((descriptor) => descriptor.group === group.id);
          if (tiles.length === 0) return null;
          return (
            <div key={group.id} className="emvb-add-group">
              <h3 className="emvb-add-group-title">{group.label}</h3>
              <div className="emvb-add-tiles" aria-label={group.label}>
                {tiles.map((tile) => {
                  const Icon =
                    tile.type.startsWith("provider:") && "icon" in tile
                      ? providerIcon(tile.icon)
                      : elementIcon(tile.type);
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
                      onClick={() => onAdd(tile.type)}
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
      {extensionElements.length > 0 && (
        <div className="emvb-add-group" data-emvb-extensions="">
          <h3 className="emvb-add-group-title">Extensions</h3>
          <div className="emvb-add-tiles" aria-label="Extensions">
            {extensionElements.map((tile) => (
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
                onClick={() => onAdd(tile.type)}
              >
                <PuzzlePieceIcon size={20} aria-hidden="true" />
                <span>{tile.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {saved && <SavedSectionsGroup saved={saved} query={query} />}
    </div>
  );
}
