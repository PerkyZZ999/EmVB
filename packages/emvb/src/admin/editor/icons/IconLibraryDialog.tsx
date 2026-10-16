import { Button, Dialog } from "@cloudflare/kumo";
import {
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  TrashIcon,
  UploadSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import * as React from "react";
import type { Fetcher } from "../../api.ts";
import { BUTTON, SOLID_PRIMARY, UI_CSS } from "../../ui.ts";
import { ALL_ICONS, ICON_SETS, UPLOADS, type LibraryIcon } from "./library.ts";
import { fmt, useIconLibrary } from "./use-icon-library.ts";
import { isCommitEnter } from "../ime.ts";

/** Grid geometry, in px. Tiles stretch to fill the row; this is their narrowest. */
const TILE_MIN_WIDTH = 96;
export const TILE_HEIGHT = 88;
export const GAP = 8;
const ROW = TILE_HEIGHT + GAP;
const PAD = 12;
const OVERSCAN = 2;
/** happy-dom and a first paint before layout report 0; assume a typical dialog until measured. */
const FALLBACK = { width: 760, height: 480 };

/** How many tiles fit across `width`. */
export const columnsFor = (width: number) =>
  Math.max(1, Math.floor((width + GAP) / (TILE_MIN_WIDTH + GAP)));

/** The rows to render for a scroll position: what is on screen plus a little either side. */
export function visibleRows(
  scrollTop: number,
  height: number,
  rowCount: number,
): { first: number; last: number } {
  // A stale offset from a longer list must not point past the end of this one.
  const top = Math.min(Math.max(0, scrollTop - PAD), Math.max(0, rowCount * ROW - height));
  return {
    first: Math.max(0, Math.floor(top / ROW) - OVERSCAN),
    last: Math.min(rowCount - 1, Math.ceil((top + height) / ROW) + OVERSCAN),
  };
}

/** Where a key moves the active tile in a grid of `count` tiles, or undefined if it isn't a move. */
export function moveActive(
  key: string,
  index: number,
  count: number,
  columns: number,
  pageRows: number,
): number | undefined {
  if (count === 0) return undefined;
  const last = count - 1;
  if (index < 0) {
    return [
      "ArrowRight",
      "ArrowLeft",
      "ArrowDown",
      "ArrowUp",
      "Home",
      "PageDown",
      "PageUp",
    ].includes(key)
      ? 0
      : key === "End"
        ? last
        : undefined;
  }
  const row = Math.floor(index / columns);
  const lastRow = Math.floor(last / columns);
  switch (key) {
    case "ArrowRight":
      return Math.min(last, index + 1);
    case "ArrowLeft":
      return Math.max(0, index - 1);
    case "ArrowDown":
      // From the row above a short last row, land on its last tile rather than staying put.
      return index + columns <= last ? index + columns : row < lastRow ? last : index;
    case "ArrowUp":
      return index - columns >= 0 ? index - columns : index;
    case "Home":
      return 0;
    case "End":
      return last;
    case "PageDown":
      return Math.min(last, index + columns * pageRows);
    case "PageUp":
      return index - columns * pageRows >= 0 ? index - columns * pageRows : index % columns;
    default:
      return undefined;
  }
}

const optionId = (base: string, index: number) => `${base}-${index}`;

/** "Font Awesome Solid", or just "Lucide" for a set with one style. */
const iconSource = (icon: LibraryIcon) =>
  icon.styleLabel === icon.setLabel ? icon.setLabel : `${icon.setLabel} ${icon.styleLabel}`;

/** What a screen reader hears for a tile: "Rocket, Font Awesome Solid". */
const iconSpokenName = (icon: LibraryIcon) => `${icon.label}, ${iconSource(icon)}`;

function IconGrid({
  icons,
  selectedId,
  active,
  label,
  gridRef,
  onActive,
  onCursor,
  onInsert,
}: {
  icons: readonly LibraryIcon[];
  selectedId: string | undefined;
  active: number;
  label: string;
  gridRef: React.RefObject<HTMLDivElement | null>;
  /** Moves the keyboard cursor and selects that icon. */
  onActive: (index: number) => void;
  /** Moves only the keyboard cursor (tabbing in), leaving the selection alone. */
  onCursor: (index: number) => void;
  onInsert: (icon: LibraryIcon) => void;
}) {
  const base = React.useId();
  const [box, setBox] = React.useState(FALLBACK);
  const [scrollTop, setScrollTop] = React.useState(0);

  React.useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return undefined;
    const measure = () =>
      setBox({
        width: el.clientWidth > 0 ? el.clientWidth - PAD * 2 : FALLBACK.width,
        height: el.clientHeight > 0 ? el.clientHeight : FALLBACK.height,
      });
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [gridRef]);

  const columns = columnsFor(box.width);
  const tileWidth = (box.width - GAP * (columns - 1)) / columns;
  const rows = Math.ceil(icons.length / columns);
  const pageRows = Math.max(1, Math.floor(box.height / ROW));
  const { first, last } = visibleRows(scrollTop, box.height, rows);

  // A new list starts at the top; then the active tile is kept in view as the keyboard moves it
  // (and on opening, the current icon is scrolled to).
  const shownList = React.useRef(icons);
  React.useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    if (shownList.current !== icons) {
      shownList.current = icons;
      el.scrollTop = 0;
    }
    if (active >= 0) {
      const top = PAD + Math.floor(active / columns) * ROW;
      if (top < el.scrollTop) el.scrollTop = top - PAD;
      else if (top + TILE_HEIGHT > el.scrollTop + box.height)
        el.scrollTop = top + TILE_HEIGHT + PAD - box.height;
    }
    setScrollTop(el.scrollTop);
  }, [icons, active, columns, box.height, gridRef]);

  const tiles: React.ReactNode[] = [];
  for (let row = first; row <= last; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const index = row * columns + col;
      const icon = icons[index];
      if (!icon) break;
      const selected = icon.id === selectedId;
      tiles.push(
        <div
          key={icon.id}
          id={optionId(base, index)}
          role="option"
          aria-selected={selected}
          aria-setsize={icons.length}
          aria-posinset={index + 1}
          aria-label={iconSpokenName(icon)}
          title={`${icon.label} (${icon.id})`}
          className="emvb-icon-library-tile"
          data-emvb-icon-id={icon.id}
          data-selected={selected ? "true" : undefined}
          data-active={index === active ? "true" : undefined}
          style={{ top: row * ROW, left: col * (tileWidth + GAP), width: tileWidth }}
          onClick={() => {
            gridRef.current?.focus({ preventScroll: true });
            onActive(index);
          }}
          onDoubleClick={() => onInsert(icon)}
        >
          <span
            className="emvb-icon-library-glyph"
            aria-hidden="true"
            // Generated from the official packages and checked against the SVG allowlist (W-235).
            dangerouslySetInnerHTML={{ __html: icon.markup }}
          />
          <span className="emvb-icon-library-name">{icon.label}</span>
        </div>,
      );
    }
  }

  return (
    <div
      ref={gridRef}
      role="listbox"
      tabIndex={0}
      aria-label={label}
      aria-activedescendant={
        active >= 0 && active < icons.length ? optionId(base, active) : undefined
      }
      className="emvb-icon-library-grid"
      data-emvb-icon-grid=""
      data-columns={columns}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      onFocus={(event) => {
        if (event.target === event.currentTarget && active < 0 && icons.length > 0) onCursor(0);
      }}
      onKeyDown={(event) => {
        if (isCommitEnter(event)) {
          const icon = icons[active];
          if (icon) {
            event.preventDefault();
            onInsert(icon);
          }
          return;
        }
        const next = moveActive(event.key, active, icons.length, columns, pageRows);
        if (next === undefined) return;
        event.preventDefault();
        onActive(next);
      }}
    >
      <div
        role="presentation"
        className="emvb-icon-library-rows"
        style={{ height: Math.max(0, rows * ROW - GAP) }}
      >
        {tiles}
      </div>
    </div>
  );
}

function IconLibrary({
  currentId,
  fetcher,
  onInsert,
}: {
  currentId: string | undefined;
  /** With a fetcher, My uploads lists and adds uploaded SVGs (W-239). */
  fetcher?: Fetcher;
  onInsert: (icon: LibraryIcon) => void;
}) {
  const {
    categories,
    categoryId,
    setCategoryId,
    query,
    setQuery,
    searchId,
    category,
    filtered,
    active,
    setActive,
    gridRef,
    inUploads,
    uploading,
    fileRef,
    onUpload,
    uploadNote,
    uploadsFailed,
    setUploadsFailed,
    setAttempt,
    failed,
    ready,
    status,
    counts,
    selectedId,
    activate,
    selected,
    uploadId,
    renameUpload,
    deleteUpload,
  } = useIconLibrary({ currentId, fetcher });
  const searchRef = React.useRef<HTMLInputElement>(null);
  return (
    <div className="emvb-icon-library" data-emvb-dialog="icon-library">
      <header className="emvb-icon-library-head">
        <div>
          <Dialog.Title className="emvb-icon-library-title">Icon library</Dialog.Title>
          <Dialog.Description className="emvb-helper">
            Lucide, Font Awesome Free, Tabler and Remix. The icon you insert is saved into the page
            as SVG, so visitors never download an icon set.
          </Dialog.Description>
        </div>
        <Dialog.Close
          render={(props) => (
            <Button
              {...props}
              variant="ghost"
              shape="square"
              size="sm"
              aria-label="Close icon library"
              className="emvb-icon-btn"
            >
              <XIcon size={16} aria-hidden="true" />
            </Button>
          )}
        />
      </header>

      <nav className="emvb-icon-library-nav" aria-label="Icon sets">
        <ul>
          {categories.map((item) => {
            const count = counts.get(item.id);
            const current = item.id === categoryId;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="emvb-icon-library-cat"
                  data-emvb-icon-category={item.id}
                  data-sub={item.style ? "true" : undefined}
                  data-uploads={item.id === UPLOADS ? "true" : undefined}
                  aria-current={current ? "true" : undefined}
                  onClick={() => setCategoryId(item.id)}
                >
                  <span>{item.label}</span>
                  {count !== undefined ? (
                    <span className="emvb-icon-library-count">{fmt(count)}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="emvb-icon-library-licenses">
          {ICON_SETS.map((set) => `${set.label} · ${set.license}`).join("\n")}
        </p>
      </nav>

      <div className="emvb-icon-library-main">
        <div className="emvb-icon-library-search">
          <label htmlFor={searchId} className="emvb-sr-only">
            Search icons
          </label>
          <MagnifyingGlassIcon
            size={16}
            className="emvb-icon-library-search-glyph"
            aria-hidden="true"
          />
          <input
            ref={searchRef}
            id={searchId}
            type="search"
            // The dialog opens straight into the search, like a command palette.
            autoFocus
            value={query}
            placeholder={`Search ${category.id === ALL_ICONS ? "all icons" : category.label}…`}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // W-682: not the Enter that confirms an IME word (W-606).
              if ((event.key === "ArrowDown" || isCommitEnter(event)) && filtered.length > 0) {
                event.preventDefault();
                if (active < 0) setActive(0);
                gridRef.current?.focus();
              }
            }}
          />
          <span className="emvb-icon-library-status" role="status" aria-live="polite">
            {status}
          </span>
        </div>
        {inUploads && (
          <div className="emvb-icon-library-upload" data-emvb-icon-upload="">
            <Button
              variant="secondary"
              size="sm"
              className={BUTTON}
              icon={<UploadSimpleIcon aria-hidden="true" />}
              disabled={uploading}
              data-emvb-icon-upload-btn=""
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Upload SVG"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".svg,image/svg+xml"
              className="emvb-sr-only"
              tabIndex={-1}
              aria-hidden="true"
              data-emvb-icon-upload-input=""
              onChange={(event) => void onUpload(event.target.files?.[0])}
            />
            <span
              className="emvb-helper"
              data-emvb-icon-upload-note={uploadNote ? (uploadNote.error ? "error" : "ok") : ""}
              role={uploadNote?.error ? "alert" : undefined}
            >
              {uploadNote?.text ??
                "Up to 256 KB. Scripts, event handlers and outside images are removed or refused; the icon is saved with the page."}
            </span>
          </div>
        )}
        {inUploads && uploadsFailed ? (
          <div className="emvb-icon-library-empty">
            <p>Your uploads didn&apos;t load: {uploadsFailed}</p>
            <Button
              variant="secondary"
              size="sm"
              className={BUTTON}
              onClick={() => {
                setUploadsFailed(undefined);
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </Button>
          </div>
        ) : failed ? (
          <div className="emvb-icon-library-empty">
            <p>The {failed} icons didn&apos;t load. Check the connection and try again.</p>
            <Button
              variant="secondary"
              size="sm"
              className={BUTTON}
              onClick={() => setAttempt((n) => n + 1)}
            >
              Try again
            </Button>
          </div>
        ) : !ready ? (
          <div className="emvb-icon-library-empty" aria-busy="true">
            <span className="emvb-icon-library-spinner" aria-hidden="true" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="emvb-icon-library-empty">
            <p>{status}</p>
            {query.trim() && (
              <Button
                variant="secondary"
                size="sm"
                className={BUTTON}
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
              >
                Clear search
              </Button>
            )}
          </div>
        ) : (
          <IconGrid
            icons={filtered}
            selectedId={selectedId}
            active={active}
            label={`${category.label} icons`}
            gridRef={gridRef}
            onActive={activate}
            onCursor={setActive}
            onInsert={onInsert}
          />
        )}
      </div>

      <footer className="emvb-icon-library-foot">
        <div className="emvb-icon-library-picked" data-emvb-icon-picked={selected?.id ?? ""}>
          {selected ? (
            <>
              <span
                className="emvb-icon-library-picked-glyph"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: selected.markup }}
              />
              <span className="emvb-icon-library-picked-text">
                <strong>{selected.label}</strong>
                <span>
                  {iconSource(selected)} · <code className="emvb-mono">{selected.id}</code>
                </span>
              </span>
            </>
          ) : (
            <span className="emvb-helper">
              Pick an icon, then Insert. Double-click or Enter inserts at once.
            </span>
          )}
        </div>
        <div className="emvb-icon-library-actions">
          {uploadId && fetcher && (
            <>
              <Button
                type="button"
                variant="secondary"
                className={BUTTON}
                icon={<PencilSimpleIcon aria-hidden="true" />}
                data-emvb-icon-rename=""
                onClick={renameUpload}
              >
                Rename
              </Button>
              <Button
                type="button"
                variant="secondary"
                className={BUTTON}
                icon={<TrashIcon aria-hidden="true" />}
                data-emvb-icon-delete=""
                onClick={deleteUpload}
              >
                Delete
              </Button>
            </>
          )}
          <Dialog.Close
            render={(props) => (
              <Button {...props} variant="secondary" className={BUTTON}>
                Close
              </Button>
            )}
          />
          <Button
            variant="primary"
            className={`${BUTTON} ${SOLID_PRIMARY}`}
            disabled={!selected}
            data-emvb-icon-insert=""
            onClick={() => {
              if (selected) onInsert(selected);
            }}
          >
            Insert
          </Button>
        </div>
      </footer>
    </div>
  );
}

/**
 * The icon library (W-236): sets in a sidebar, a word search and a virtualized grid of every
 * icon. Sets load on first view; inserting hands back the icon with its complete SVG.
 */
export function IconLibraryDialog({
  open,
  onOpenChange,
  currentId,
  fetcher,
  onInsert,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentId: string | undefined;
  /** Enables My uploads (W-239). */
  fetcher?: Fetcher;
  onInsert: (icon: LibraryIcon) => void;
  /** After the close animation, once the focus trap has let go: the place to put focus back. */
  onClosed?: () => void;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(next) => {
        if (!next) onClosed?.();
      }}
    >
      <Dialog
        size="xl"
        className="emvb-icon-library-popup"
        style={{
          width: "min(1080px, calc(100vw - 32px))",
          height: "min(760px, calc(100vh - 48px))",
        }}
      >
        <style>{UI_CSS + ICON_LIBRARY_CSS}</style>
        {open ? (
          <IconLibrary
            currentId={currentId}
            fetcher={fetcher}
            onInsert={(icon) => {
              onInsert(icon);
              onOpenChange(false);
            }}
          />
        ) : null}
      </Dialog>
    </Dialog.Root>
  );
}

const ICON_LIBRARY_CSS = `
.emvb-icon-library-popup.emvb-icon-library-popup { padding: 0; display: flex; }
.emvb-icon-library {
  --emvb-tile-bg: color-mix(in oklab, var(--color-kumo-elevated) 60%, var(--color-kumo-base));
  flex: 1; min-height: 0; min-width: 0;
  display: grid;
  grid-template-columns: 208px minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr) auto;
  grid-template-areas: "head head" "nav main" "foot foot";
  color: var(--text-color-kumo-default);
  font-size: 13px; line-height: 18px;
}
.emvb-icon-library-upload {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 10px 16px; border-bottom: 1px solid var(--color-kumo-hairline);
}
.emvb-icon-library-upload [data-emvb-icon-upload-note="error"] { color: var(--text-color-kumo-danger, #b91c1c); }
.emvb-icon-library-cat[data-uploads] { margin-top: 8px; border-top: 1px solid var(--color-kumo-hairline); padding-top: 8px; }
.emvb-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.emvb-icon-library-head {
  grid-area: head; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
  padding: 16px 16px 14px 20px; border-bottom: 1px solid var(--color-kumo-hairline);
}
.emvb-icon-library-title { margin: 0 0 2px; font-size: 16px; line-height: 22px; font-weight: 600; }
.emvb-icon-library-nav {
  grid-area: nav; display: flex; flex-direction: column; justify-content: space-between; gap: 12px;
  min-height: 0; overflow: auto; padding: 12px 10px;
  border-right: 1px solid var(--color-kumo-hairline);
  background: color-mix(in oklab, var(--color-kumo-recessed) 45%, var(--color-kumo-base));
}
.emvb-icon-library-nav ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 1px; }
.emvb-icon-library-cat {
  display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 8px;
  height: 30px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent;
  color: var(--text-color-kumo-default); font: inherit; font-weight: 500; text-align: left; cursor: pointer;
}
.emvb-icon-library-cat[data-sub="true"] { height: 26px; padding-left: 24px; font-weight: 400; color: var(--text-color-kumo-subtle); }
.emvb-icon-library-cat:hover { background: var(--color-kumo-tint); }
.emvb-icon-library-cat[aria-current="true"] {
  background: color-mix(in oklab, var(--color-kumo-brand) 12%, transparent);
  color: var(--text-color-kumo-default);
  box-shadow: inset 2px 0 0 var(--color-kumo-brand);
}
.emvb-icon-library-cat:focus-visible, .emvb-icon-library-grid:focus-visible, .emvb-icon-library-search input:focus-visible {
  outline: 2px solid var(--color-kumo-brand); outline-offset: -2px;
}
.emvb-icon-library-count { font-size: 11px; font-variant-numeric: tabular-nums; color: var(--text-color-kumo-subtle); }
/* W-244: on the current entry's tinted background the subtle grey is 4.1:1. */
.emvb-icon-library-cat[aria-current="true"] .emvb-icon-library-count { color: var(--text-color-kumo-default); }
.emvb-icon-library-licenses { margin: 0; padding: 0 10px; white-space: pre-line; font-size: 11px; line-height: 16px; color: var(--text-color-kumo-subtle); }
.emvb-icon-library-main { grid-area: main; display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.emvb-icon-library-search {
  position: relative; display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; border-bottom: 1px solid var(--color-kumo-hairline);
}
.emvb-icon-library-search input {
  flex: 1; min-width: 0; height: 36px; padding: 0 12px 0 36px;
  border: 1px solid var(--color-kumo-line); border-radius: 8px;
  background: var(--color-kumo-control, var(--color-kumo-base)); color: inherit; font: inherit; font-size: 14px;
}
.emvb-icon-library-search-glyph { position: absolute; left: 28px; width: 16px; height: 16px; color: var(--text-color-kumo-subtle); pointer-events: none; }
.emvb-icon-library-status { flex: none; min-width: 88px; text-align: right; font-size: 12px; font-variant-numeric: tabular-nums; color: var(--text-color-kumo-subtle); }
.emvb-icon-library-grid { position: relative; flex: 1; min-height: 0; overflow-y: auto; padding: ${PAD}px; }
.emvb-icon-library-rows { position: relative; }
.emvb-icon-library-tile {
  position: absolute; height: ${TILE_HEIGHT}px; box-sizing: border-box;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  padding: 10px 6px 8px; border-radius: 8px; border: 1px solid transparent;
  background: var(--emvb-tile-bg); color: var(--text-color-kumo-default); cursor: pointer; user-select: none;
}
.emvb-icon-library-tile:hover { border-color: var(--color-kumo-line); }
.emvb-icon-library-tile[data-active="true"] { border-color: var(--color-kumo-line); background: var(--color-kumo-tint); }
.emvb-icon-library-grid:focus-visible .emvb-icon-library-tile[data-active="true"] { outline: 2px solid var(--color-kumo-brand); outline-offset: 1px; }
.emvb-icon-library-tile[data-selected="true"] {
  border-color: var(--color-kumo-brand);
  background: color-mix(in oklab, var(--color-kumo-brand) 10%, var(--color-kumo-base));
  color: var(--color-kumo-brand);
}
.emvb-icon-library-tile[data-selected="true"]::after {
  content: ""; position: absolute; top: 6px; right: 6px; width: 6px; height: 6px; border-radius: 9999px; background: var(--color-kumo-brand);
}
.emvb-icon-library-glyph { display: flex; width: 26px; height: 26px; }
.emvb-icon-library-glyph svg { width: 26px; height: 26px; }
.emvb-icon-library-name {
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 11px; line-height: 14px; color: var(--text-color-kumo-subtle);
}
.emvb-icon-library-tile[data-selected="true"] .emvb-icon-library-name { color: var(--text-color-kumo-default); }
.emvb-icon-library-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; text-align: center; color: var(--text-color-kumo-subtle); }
.emvb-icon-library-empty p { margin: 0; }
.emvb-icon-library-spinner { width: 22px; height: 22px; border-radius: 9999px; border: 2px solid var(--color-kumo-line); border-top-color: var(--color-kumo-brand); animation: emvb-icon-spin 0.8s linear infinite; }
@keyframes emvb-icon-spin { to { transform: rotate(360deg); } }
.emvb-icon-library-foot {
  grid-area: foot; display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 12px 16px 12px 20px; border-top: 1px solid var(--color-kumo-hairline);
}
.emvb-icon-library-picked { display: flex; align-items: center; gap: 12px; min-width: 0; }
.emvb-icon-library-picked-glyph {
  flex: none; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px;
  border-radius: 8px; color: var(--color-kumo-brand);
  background: color-mix(in oklab, var(--color-kumo-brand) 10%, var(--color-kumo-base));
}
.emvb-icon-library-picked-glyph svg { width: 22px; height: 22px; }
.emvb-icon-library-picked-text { display: flex; flex-direction: column; min-width: 0; }
.emvb-icon-library-picked-text span { font-size: 12px; color: var(--text-color-kumo-subtle); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.emvb-icon-library-actions { display: flex; gap: 8px; flex: none; }
@media (max-width: 640px) {
  .emvb-icon-library { grid-template-columns: minmax(0, 1fr); grid-template-areas: "head" "nav" "main" "foot"; grid-template-rows: auto auto minmax(0, 1fr) auto; }
  .emvb-icon-library-nav { border-right: 0; border-bottom: 1px solid var(--color-kumo-hairline); max-height: 96px; }
  .emvb-icon-library-nav ul { flex-direction: row; flex-wrap: wrap; }
  .emvb-icon-library-cat, .emvb-icon-library-cat[data-sub="true"] { width: auto; padding: 0 10px; }
  .emvb-icon-library-licenses { display: none; }
}
@media (prefers-reduced-motion: reduce) { .emvb-icon-library-spinner { animation: none; } }
`;
