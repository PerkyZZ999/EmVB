import type * as React from "react";
import type { ImportNote } from "../../core/index.ts";

const GROUPS: { kind: ImportNote["kind"]; title: string }[] = [
  { kind: "unmapped", title: "Not recognised" },
  { kind: "skipped", title: "Left out" },
  { kind: "approximated", title: "Changed to fit EmVB" },
];

/**
 * What an import will do, before anything is created (W-945, shared with W-1074): the error, or
 * the summary line and the notes grouped as not recognised, left out and changed.
 */
export function ImportReport({
  result,
  summary,
  children,
}: {
  result: { ok: true; notes: ImportNote[] } | { ok: false; error: string } | undefined;
  summary: string;
  /** Extra lines under the summary (the fonts a page uses, …). */
  children?: React.ReactNode;
}) {
  if (!result) return null;
  if (!result.ok) {
    return (
      <p className="emvb-inline-error" role="alert" data-emvb-import-error="">
        {result.error}
      </p>
    );
  }
  return (
    <section
      className="emvb-import-report"
      aria-label="Import report"
      // The report can be long; it scrolls on its own and must be reachable by keyboard.
      tabIndex={0}
      data-emvb-import-report=""
    >
      <p className="emvb-import-summary" role="status">
        {summary}
      </p>
      {children}
      {GROUPS.map(({ kind, title }) => {
        const notes = result.notes.filter((note) => note.kind === kind);
        if (notes.length === 0) return null;
        return (
          <details key={kind} open={kind !== "approximated"} data-emvb-import-group={kind}>
            <summary>{`${title} (${notes.length})`}</summary>
            <ul>
              {notes.map((note) => (
                <li key={`${note.element}:${note.message}`}>
                  <strong>{note.element}:</strong> {note.message}
                  {note.count > 1 ? ` (${note.count}×)` : ""}
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </section>
  );
}
