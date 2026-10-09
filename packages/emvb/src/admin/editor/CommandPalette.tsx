import { Dialog } from "@cloudflare/kumo";
import * as React from "react";
import { filterPalette, type PaletteItem } from "./palette.ts";

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
  const listRef = React.useRef<HTMLUListElement>(null);
  React.useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);
  const shown = React.useMemo(() => filterPalette(items, query), [items, query]);
  const current = Math.min(active, Math.max(0, shown.length - 1));
  React.useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${current}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [current]);
  const run = (item: PaletteItem | undefined) => {
    if (!item) return;
    onOpenChange(false);
    // After the dialog closes, so focus moves where the command wants it.
    setTimeout(item.run, 0);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + shown.length) % Math.max(1, shown.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(shown[current]);
    } else if (event.key === "Home" && event.ctrlKey) {
      setActive(0);
    }
  };
  let lastGroup = "";
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="base" className="emvb-palette" data-emvb-palette="">
        <Dialog.Title className="sr-only">Command palette</Dialog.Title>
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
        <ul className="emvb-palette-list" id="emvb-palette-list" role="listbox" ref={listRef}>
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
                    {query.trim() ? item.group : ""}
                    {item.hint ? ` ${item.hint}` : ""}
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
