import {
  AlignBottomIcon,
  AlignCenterHorizontalIcon,
  AlignCenterVerticalIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AlignTopIcon,
  ArrowBendDownRightIcon,
  ArrowBendUpRightIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowsHorizontalIcon,
  ArrowsOutLineHorizontalIcon,
  ArrowsVerticalIcon,
  ArrowUpIcon,
  TextAlignJustifyIcon,
  TextTIcon,
  type Icon,
} from "@phosphor-icons/react";

export type Choice = { value: string; label: string; icon: Icon };

/** Icon rows for the flex properties CSS actually applies (W-163). */
export const LAYOUT_CHOICES: Record<string, Choice[]> = {
  flexDirection: [
    { value: "row", label: "Row", icon: ArrowRightIcon },
    { value: "column", label: "Column", icon: ArrowDownIcon },
    { value: "row-reverse", label: "Row reverse", icon: ArrowLeftIcon },
    { value: "column-reverse", label: "Column reverse", icon: ArrowUpIcon },
  ],
  justifyContent: [
    { value: "flex-start", label: "Start", icon: AlignLeftIcon },
    { value: "center", label: "Center", icon: AlignCenterHorizontalIcon },
    { value: "flex-end", label: "End", icon: AlignRightIcon },
    { value: "space-between", label: "Space between", icon: TextAlignJustifyIcon },
    { value: "space-around", label: "Space around", icon: ArrowsOutLineHorizontalIcon },
    { value: "space-evenly", label: "Space evenly", icon: ArrowsHorizontalIcon },
  ],
  alignItems: [
    { value: "stretch", label: "Stretch", icon: ArrowsVerticalIcon },
    { value: "flex-start", label: "Start", icon: AlignTopIcon },
    { value: "center", label: "Center", icon: AlignCenterVerticalIcon },
    { value: "flex-end", label: "End", icon: AlignBottomIcon },
    { value: "baseline", label: "Baseline", icon: TextTIcon },
  ],
  flexWrap: [
    { value: "nowrap", label: "No wrap", icon: ArrowRightIcon },
    { value: "wrap", label: "Wrap", icon: ArrowBendDownRightIcon },
    { value: "wrap-reverse", label: "Wrap reverse", icon: ArrowBendUpRightIcon },
  ],
};

/** One property as a row of icon buttons. Nothing is pressed until the author sets a value. */
export function ChoiceGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: Choice[];
  onChange: (value: string) => void;
}) {
  const labelId = `emvb-choice-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="emvb-choice">
      <span className="emvb-choice-label" id={labelId}>
        {label}
      </span>
      <div className="emvb-choice-group" role="radiogroup" aria-labelledby={labelId}>
        {options.map((option) => {
          const Icon = option.icon;
          const checked = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={option.label}
              title={option.label}
              data-emvb-choice={option.value}
              onClick={() => onChange(option.value)}
            >
              <Icon size={16} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
