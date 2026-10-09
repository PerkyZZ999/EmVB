import { Button, Dialog } from "@cloudflare/kumo";
import {
  applyA11yFix,
  applyAllA11yFixes,
  findNode,
  type A11yReport,
  type Layout,
} from "../../core/index.ts";
import { ELEMENT_NAMES } from "./panels/ElementPanel.tsx";

/** Score bands for the badge colour (W-317). */
const scoreBand = (score: number) => (score >= 90 ? "good" : score >= 70 ? "fair" : "poor");

/** The live score in the top bar (W-317); opens the co-pilot. */
export function A11yScoreButton({ report, onOpen }: { report: A11yReport; onOpen: () => void }) {
  const count = report.issues.length;
  return (
    <button
      type="button"
      className="emvb-a11y-score"
      data-band={scoreBand(report.score)}
      data-emvb-a11y-open=""
      title={
        count === 0
          ? "Accessibility: no issues found"
          : `Accessibility: ${count} issue${count === 1 ? "" : "s"}`
      }
      aria-label={`Accessibility score ${report.score} of 100, ${count} issue${count === 1 ? "" : "s"}`}
      onClick={onOpen}
    >
      A11y <b>{report.score}</b>
    </button>
  );
}

/**
 * Accessibility co-pilot (W-317): the page's issues with what's wrong, a jump to the element,
 * and a one-click fix where there is a safe one (or all at once). Fixes are ordinary edits.
 */
export function A11yDialog({
  open,
  onOpenChange,
  report,
  layout,
  onSelect,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: A11yReport;
  layout: Layout | null;
  onSelect: (id: string) => void;
  onApply: (layout: Layout, note: string) => void;
}) {
  const fixable = report.issues.filter((issue) => issue.fix);
  const name = (id: string) => {
    const node = layout ? findNode(layout, id) : undefined;
    if (!node) return "Element";
    if (layout && node.id === layout.root.id) return "Page";
    return node.label || ELEMENT_NAMES[node.type] || node.type;
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="base" className="p-6 emvb-a11y" data-emvb-a11y="">
        <Dialog.Title>
          Accessibility · <span data-band={scoreBand(report.score)}>{report.score}</span>/100
        </Dialog.Title>
        {report.issues.length === 0 ? (
          <p className="emvb-helper" data-emvb-a11y-clean="">
            No issues found. Automated checks catch some problems, not all: try the page with a
            keyboard and a screen reader too.
          </p>
        ) : (
          <ul className="emvb-a11y-issues">
            {report.issues.map((issue) => (
              <li key={issue.id} data-emvb-a11y-issue={issue.id} data-severity={issue.severity}>
                <span className="emvb-a11y-what">
                  <button
                    type="button"
                    className="emvb-link-button"
                    onClick={() => {
                      onSelect(issue.nodeId);
                      onOpenChange(false);
                    }}
                  >
                    {name(issue.nodeId)}
                  </button>
                  : {issue.message}
                </span>
                {issue.fix && layout && (
                  <Button
                    variant="secondary"
                    size="sm"
                    data-emvb-a11y-fix={issue.id}
                    onClick={() =>
                      onApply(applyA11yFix(layout, issue), `Fixed: ${issue.fixLabel ?? "issue"}`)
                    }
                  >
                    {issue.fixLabel ?? "Fix"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="emvb-a11y-actions">
          {fixable.length > 1 && layout && (
            <Button
              variant="primary"
              data-emvb-a11y-fix-all=""
              onClick={() =>
                onApply(
                  applyAllA11yFixes(layout, fixable),
                  `Fixed ${fixable.length} accessibility issues`,
                )
              }
            >
              Fix all {fixable.length}
            </Button>
          )}
          <Dialog.Close render={(props) => <Button {...props}>Close</Button>} />
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
