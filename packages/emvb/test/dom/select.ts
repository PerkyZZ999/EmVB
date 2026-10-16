import { act } from "react";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Opens the Kumo Select in (or at) `scope` and picks the option whose value is `value`. */
export async function pickOption(scope: Element | null | undefined, value: string): Promise<void> {
  const trigger = scope?.matches('[role="combobox"]')
    ? scope
    : scope?.querySelector('[role="combobox"]');
  if (!trigger) throw new Error("No select trigger to open");
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    (trigger as HTMLElement).click();
    await wait(10);
  });
  const option = document
    .querySelector(`[role="option"] [data-emvb-option="${value}"]`)
    ?.closest<HTMLElement>('[role="option"]');
  if (!option) throw new Error(`No option with the value ${value}`);
  await act(async () => {
    option.click();
    await wait(10);
  });
}
