import { Switch } from "@cloudflare/kumo";
import * as React from "react";

type Props = {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** One line on when to turn it on; it describes the switch and lines up with its label. */
  hint?: React.ReactNode;
  /** Data attributes for the wrapper and the hint, so tests and styles can find them. */
  data?: Record<`data-${string}`, string>;
  hintData?: Record<`data-${string}`, string>;
};

/** A panel switch with its explanation under the label (UX-042, UX-046). */
export function HintedSwitch({ label, checked, onCheckedChange, hint, data, hintData }: Props) {
  const hintId = React.useId();
  return (
    <div className="emvb-field-group" {...data}>
      <Switch
        label={label}
        checked={checked}
        aria-describedby={hint ? hintId : undefined}
        onCheckedChange={(next) => onCheckedChange(next === true)}
      />
      {hint && (
        <p className="emvb-helper emvb-switch-hint" id={hintId} {...hintData}>
          {hint}
        </p>
      )}
    </div>
  );
}
