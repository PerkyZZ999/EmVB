import { Button, Dialog } from "@cloudflare/kumo";
import * as React from "react";
import {
  measurePage,
  PERF_BUDGETS,
  SCRIPT_LABELS,
  type DesignSystem,
  type Layout,
  type PerfKind,
  type ThemeDynamicData,
} from "../../core/index.ts";
import { ELEMENT_NAMES } from "./element-chrome.ts";
import { BUTTON } from "../ui.ts";

const KINDS: { kind: PerfKind; label: string }[] = [
  { kind: "html", label: "HTML" },
  { kind: "css", label: "CSS" },
  { kind: "js", label: "JavaScript" },
  { kind: "images", label: "Images" },
];

const kb = (bytes: number) => (bytes < 1000 ? `${bytes} B` : `${(bytes / 1000).toFixed(1)} KB`);

/**
 * The page's weight against its budget (W-310): one bar per kind, the scripts it loads (zero
 * by default, W-311), warnings, and the heaviest sections, each a click away on the canvas.
 */
export function PerfMeterDialog({
  open,
  onOpenChange,
  layout,
  design,
  parts,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: Layout | null;
  design: DesignSystem;
  /** W-671: the synced sections and Loop Item parts the canvas shows, weighed with the page. */
  parts?: ThemeDynamicData;
  onSelect: (id: string) => void;
}) {
  const report = React.useMemo(
    () => (open && layout ? measurePage(layout, design, parts) : null),
    [open, layout, design, parts],
  );
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="base" className="p-6 emvb-perf" data-emvb-perf="">
        <div className="emvb-dialog" data-emvb-dialog="perf">
          <Dialog.Title>Page weight</Dialog.Title>
          {report && (
            <>
              <ul className="emvb-perf-bars">
                {KINDS.map(({ kind, label }) => {
                  const share = Math.min(1, report.bytes[kind] / PERF_BUDGETS[kind]);
                  const over = report.over.includes(kind);
                  return (
                    <li key={kind} data-emvb-perf-kind={kind} data-over={over ? "" : undefined}>
                      <span className="emvb-perf-label">{label}</span>
                      <span
                        className="emvb-perf-bar"
                        role="meter"
                        aria-label={`${label} weight`}
                        aria-valuemin={0}
                        aria-valuemax={PERF_BUDGETS[kind]}
                        aria-valuenow={Math.min(report.bytes[kind], PERF_BUDGETS[kind])}
                        aria-valuetext={`${kb(report.bytes[kind])} of ${kb(PERF_BUDGETS[kind])}`}
                      >
                        <span style={{ width: `${Math.round(share * 100)}%` }} />
                      </span>
                      <span className="emvb-perf-value">
                        {kb(report.bytes[kind])} / {kb(PERF_BUDGETS[kind])}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="emvb-helper" data-emvb-perf-js="">
                {report.scripts.length === 0
                  ? "Zero JavaScript: this page is plain HTML and CSS."
                  : `Scripts: ${report.scripts.map((s) => SCRIPT_LABELS[s.script]).join(", ")}.`}
              </p>
              {report.warnings.length > 0 && (
                <ul className="emvb-perf-warnings" data-emvb-perf-warnings="">
                  {report.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
              {report.sections.length > 0 && (
                <>
                  <h3 className="emvb-perf-heading">Heaviest sections</h3>
                  <ol className="emvb-perf-sections">
                    {report.sections.slice(0, 5).map((section) => (
                      <li key={section.id}>
                        <button
                          type="button"
                          className="emvb-link-button"
                          data-emvb-perf-section={section.id}
                          onClick={() => {
                            onSelect(section.id);
                            onOpenChange(false);
                          }}
                        >
                          {section.label || ELEMENT_NAMES[section.type] || section.type}
                        </button>{" "}
                        {kb(section.bytes)}
                        {section.images > 0
                          ? ` · ${section.images} image${section.images === 1 ? "" : "s"}`
                          : ""}
                      </li>
                    ))}
                  </ol>
                </>
              )}
              <p className="emvb-helper">
                HTML and CSS are gzipped estimates; image sizes come from their width and height.
              </p>
            </>
          )}
          <div className="emvb-dialog-actions">
            <Dialog.Close
              render={(props) => (
                <Button {...props} variant="secondary" className={BUTTON}>
                  Close
                </Button>
              )}
            />
          </div>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
