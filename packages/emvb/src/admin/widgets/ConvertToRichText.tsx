import { Button, Dialog, Loader } from "@cloudflare/kumo";
import { TextAlignLeftIcon } from "@phosphor-icons/react";
import * as React from "react";
import type { Layout } from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { DialogCloseButton } from "../editor/DialogCloseButton.tsx";
import { BUTTON, SOLID_DESTRUCTIVE, UI_CSS } from "../ui.ts";
import { planRichText, writeRichText, type RichTextPlan } from "./convert-body.ts";

type Plan = Extract<RichTextPlan, { ok: true }>;

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** "form, 2 icons", for what a conversion leaves out. */
export function leftOutText(skipped: Record<string, number>): string {
  return Object.entries(skipped)
    .map(([type, n]) => (n === 1 ? type : `${n} ${type}s`))
    .join(", ");
}

/**
 * W-963: Convert to rich text, the way out of a canvas field. The layout's words, headings, lists,
 * links and images replace the entry's rich-text field, after a confirm that says what is kept and
 * what is left out. The layout itself is untouched; the entry reloads so its form shows the result.
 */
export function ConvertToRichText({
  fetcher,
  entry,
  layout,
  reload = () => window.location.reload(),
}: {
  fetcher: Fetcher;
  entry: { collection: string; id: string };
  layout: Layout;
  reload?: () => void;
}) {
  const [state, setState] = React.useState<
    | { kind: "idle" }
    | { kind: "planning" }
    | { kind: "confirm" | "writing"; plan: Plan }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const start = async () => {
    setState({ kind: "planning" });
    try {
      const plan = await planRichText(fetcher, entry, layout);
      setState(plan.ok ? { kind: "confirm", plan } : { kind: "error", message: plan.message });
    } catch {
      setState({ kind: "error", message: "The entry couldn't be read. Try again." });
    }
  };
  const write = async (plan: Plan) => {
    setState({ kind: "writing", plan });
    try {
      await writeRichText(fetcher, entry, plan);
      reload();
    } catch (error) {
      setState({
        kind: "error",
        message: `The ${plan.field} field wasn't changed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };
  const plan = state.kind === "confirm" || state.kind === "writing" ? state.plan : null;
  const writing = state.kind === "writing";
  const leftOut = plan ? leftOutText(plan.skipped) : "";

  return (
    <>
      <Button
        variant="secondary"
        className={BUTTON}
        icon={
          state.kind === "planning" ? (
            <Loader size={14} />
          ) : (
            <TextAlignLeftIcon aria-hidden="true" />
          )
        }
        disabled={state.kind === "planning"}
        onClick={() => void start()}
        data-emvb-convert-rich-text=""
      >
        Convert to rich text
      </Button>
      {state.kind === "error" && (
        <p className="emvb-canvas-convert-note" role="alert" data-emvb-convert="error">
          {state.message}
        </p>
      )}
      <Dialog.Root
        open={plan !== null}
        onOpenChange={(open) => {
          if (!open && !writing) setState({ kind: "idle" });
        }}
      >
        <Dialog size="base" className="p-6">
          <style>{UI_CSS}</style>
          <div data-emvb-dialog="convert-rich-text" className="emvb-dialog">
            <Dialog.Title>Copy this layout into {plan?.field}?</Dialog.Title>
            <Dialog.Description>
              {plan &&
                `${plural(plan.body.length, "block")} of words, headings, lists, links and images go into the entry's ${plan.field} field${plan.replaces ? ", replacing what it holds now" : ""}. The design (colours, columns, spacing) doesn't come across.`}
            </Dialog.Description>
            {plan && leftOut && (
              <p className="emvb-helper" data-emvb-left-out="">
                Left out: {leftOut}.
              </p>
            )}
            <p className="emvb-helper">
              The layout stays as it is. Save your other changes to this entry first: it reloads
              afterwards. To show the rich text on your site, clear the layout and save the entry.
            </p>
            <div className="emvb-dialog-actions">
              <DialogCloseButton>Cancel</DialogCloseButton>
              <Button
                variant={plan?.replaces ? "destructive" : "primary"}
                className={BUTTON}
                {...(plan?.replaces ? { style: SOLID_DESTRUCTIVE } : {})}
                icon={writing ? <Loader size={14} /> : undefined}
                aria-disabled={writing}
                aria-busy={writing}
                onClick={() => {
                  if (plan && !writing) void write(plan);
                }}
              >
                {plan?.replaces ? `Replace ${plan.field}` : `Copy into ${plan?.field ?? "field"}`}
              </Button>
            </div>
          </div>
        </Dialog>
      </Dialog.Root>
    </>
  );
}
