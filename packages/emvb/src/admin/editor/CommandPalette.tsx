import { Dialog } from "@cloudflare/kumo";
import * as React from "react";
import { filterPalette, type PaletteItem } from "./palette.ts";
import { isCommitEnter } from "./ime.ts";

/**
 * Ctrl/Cmd+K (W-314): one box to insert an element, jump to a layer, apply a class, or run an
 * action. ↑/↓ choose, Enter runs, Esc closes. `>`, `+`, `@` and `.` narrow to one group.
 */
export function CommandPalette({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PaletteItem[];
}) {
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  // W-399: opened from a shortcut there is no trigger to return to, so focus fell to <body> on
  // close. Remember what had focus and go back to it when nothing else took focus.
  const wasOpen = React.useRef(false);
  // A focus return still waiting when the palette goes away must not move focus later (W-533).
  const settleTimer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(settleTimer.current), []);
  const returnTo = React.useRef<HTMLElement | null>(null);
  if (open && !wasOpen.current && typeof document !== "undefined") {
    const focused = document.activeElement;
    returnTo.current = focused instanceof HTMLElement && focused !== document.body ? focused : null;
  }
  wasOpen.current = open;
  /** After a command, the selected layer first (it may have changed); after Esc, where we were. */
  const restoreFocus = (afterCommand = false) => {
    // The dialog lets go of focus only once its close animation ends, so wait for that.
    const started = Date.now();
    window.clearTimeout(settleTimer.current);
    const settle = () => {
      const now = document.activeElement;
      // Kumo's Dialog doesn't pass data attributes through; find the palette by its input.
      const stillOpen = document.querySelector("[data-emvb-palette-input]") !== null;
      const inPalette = now?.closest('[role="dialog"]')?.querySelector("[data-emvb-palette-input]");
      if (now && now !== document.body && !inPalette) return;
      if (stillOpen && Date.now() - started < 2000) {
        settleTimer.current = window.setTimeout(settle, 30);
        return;
      }
      const selected = document.querySelector<HTMLElement>(
        '.emvb-layer-select[aria-current="true"]',
      );
      const back = returnTo.current?.isConnected ? returnTo.current : null;
      const target =
        (afterCommand ? (selected ?? back) : (back ?? selected)) ??
        document.querySelector<HTMLElement>("iframe[data-emvb-canvas]");
      target?.focus({ preventScroll: true });
    };
    settleTimer.current = window.setTimeout(settle, 30);
  };
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) restoreFocus();
  };
  React.useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);
  const shown = React.useMemo(() => filterPalette(items, query), [items, query]);
  const current = Math.min(active, Math.max(0, shown.length - 1));
  const scrollSelected = React.useCallback(
    (list: HTMLUListElement | null) => {
      if (!shown[current]) return;
      list
        ?.querySelector<HTMLElement>(`[data-index="${current}"]`)
        ?.scrollIntoView?.({ block: "nearest" });
    },
    [current, shown],
  );
  const run = (item: PaletteItem | undefined) => {
    if (!item) return;
    onOpenChange(false);
    // After the dialog closes, so focus moves where the command wants it.
    setTimeout(() => {
      item.run();
      restoreFocus(true);
    }, 0);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + shown.length) % Math.max(1, shown.length));
    } else if (isCommitEnter(event)) {
      event.preventDefault();
      run(shown[current]);
    } else if (event.key === "Home" && event.ctrlKey) {
      setActive(0);
    }
  };
  let lastGroup = "";
  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog size="base" className="emvb-palette" data-emvb-palette="">
        <Dialog.Title className="sr-only" data-emvb-dialog="palette">
          Command palette
        </Dialog.Title>
        <input
          className="emvb-palette-input"
          role="combobox"
          aria-expanded="true"
          aria-controls="emvb-palette-list"
          aria-activedescendant={shown[current] ? `emvb-palette-${current}` : undefined}
          aria-label="Type a command, an element, a layer or a class"
          placeholder="Insert, jump to a layer, apply a class, or run an action…"
          autoFocus
          value={query}
          data-emvb-palette-input=""
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <ul
          className="emvb-palette-list"
          id="emvb-palette-list"
          role="listbox"
          ref={scrollSelected}
        >
          {shown.length === 0 && (
            <li className="emvb-palette-empty" role="presentation">
              Nothing matches “{query}”.
            </li>
          )}
          {shown.map((item, index) => {
            const heading = !query.trim() && item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <React.Fragment key={item.id}>
                {heading && (
                  <li className="emvb-palette-group" role="presentation">
                    {heading}
                  </li>
                )}
                <li
                  id={`emvb-palette-${index}`}
                  role="option"
                  aria-selected={index === current}
                  data-index={index}
                  data-emvb-palette-item={item.id}
                  className="emvb-palette-item"
                  onMouseMove={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => run(item)}
                >
                  <span className="emvb-palette-label">{item.label}</span>
                  <span className="emvb-palette-hint">
                    {query.trim() ? <span className="emvb-palette-kind">{item.group}</span> : null}
                    {query.trim() && item.hint ? " " : null}
                    {item.hint ? <span className="emvb-palette-detail">{item.hint}</span> : null}
                  </span>
                </li>
              </React.Fragment>
            );
          })}
        </ul>
        <p className="emvb-palette-tips">
          ↑↓ choose · Enter run · Esc close · <kbd>&gt;</kbd> actions · <kbd>+</kbd> insert ·{" "}
          <kbd>@</kbd> layers · <kbd>.</kbd> classes
        </p>
      </Dialog>
    </Dialog.Root>
  );
}
