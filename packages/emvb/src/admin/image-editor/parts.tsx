/**
 * Shared pieces of the image editor (W-483): icon buttons with tooltips, the panel header,
 * centered sliders, the histogram strip and the tool pickers.
 *
 * Layout and behaviour follow photocn's editor components (https://github.com/rbbydotdev/photocn,
 * apps/www/src/registry/image-editor: toolbar.tsx, panel-header.tsx, histogram.tsx, crop-panel.tsx,
 * compact-layout.tsx, icon-skew.tsx), MIT License, Copyright (c) 2026 rbbydotdev. Rebuilt with
 * Kumo components and EmVB tokens instead of shadcn/ui.
 */
import { Button, Tabs, Tooltip } from "@cloudflare/kumo";
import {
  ArrowCounterClockwiseIcon,
  ArrowUUpLeftIcon,
  ArrowUUpRightIcon,
  CropIcon,
  DropIcon,
  EyeIcon,
  InfoIcon,
  MagicWandIcon,
  PulseIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
  StackIcon,
  type Icon,
} from "@phosphor-icons/react";
import * as React from "react";
import { useImageEditor } from "./engine.ts";
import { IMAGE_EDITOR_TOOLS, type ImageEditorToolId } from "./tools.ts";
import { isCommitEnter } from "../editor/ime.ts";

export const TOOL_ICONS: Record<ImageEditorToolId, Icon> = {
  adjust: SlidersHorizontalIcon,
  compose: CropIcon,
  curves: PulseIcon,
  effects: SparkleIcon,
  filters: MagicWandIcon,
  blender: StackIcon,
  blur: DropIcon,
  metadata: InfoIcon,
};

type IconButtonProps = {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** Show the label next to the icon (photocn's `showLabel`). */
  showLabel?: boolean;
  variant?: "ghost" | "outline";
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "disabled" | "className">;

/**
 * W-839: Undo, Redo and Reset disable themselves when they run out (and an icon button loses its
 * tooltip wrapper, so it remounts). Focus then fell to the dialog or the page body. Once the
 * pressed button can no longer hold focus, move it to the nearest enabled button in the toolbar.
 */
/** Distance from the pressed button; on a tie the earlier button wins (Redo hands back to Undo). */
const near = (at: number, index: number) => Math.abs(index - at) + (index > at ? 0.5 : 0);

function keepToolbarFocus(from: HTMLButtonElement) {
  const bar = from.closest<HTMLElement>('[data-slot="editor-toolbar"], .emvb-ie-compact-head');
  const dialog = from.closest<HTMLElement>('[role="dialog"]');
  if (!bar) return;
  const at = [...bar.querySelectorAll<HTMLButtonElement>("button")].indexOf(from);
  const started = Date.now();
  const settle = () => {
    const active = document.activeElement;
    const lost =
      active === document.body ||
      active === dialog ||
      active === null ||
      (active instanceof HTMLButtonElement && active.disabled);
    if (!lost) {
      if (active === from && Date.now() - started < 600) window.setTimeout(settle, 30);
      return;
    }
    // Positions, not elements: a button that gained or lost its tooltip is a new element.
    const all = [...bar.querySelectorAll<HTMLButtonElement>("button")];
    const open = all
      .map((button, index) => ({ button, index }))
      .filter(({ button }) => !button.disabled && button.getAttribute("aria-disabled") !== "true");
    open.toSorted((a, b) => near(at, a.index) - near(at, b.index))[0]?.button.focus();
  };
  window.setTimeout(settle, 0);
}

/** A ghost or outline button; icon-only ones get a tooltip below (photocn EditorActionButton). */
export function IconButton({
  label,
  icon,
  showLabel = false,
  variant = "ghost",
  className,
  ...rest
}: IconButtonProps) {
  const { onClick } = rest;
  const props = {
    ...rest,
    onClick: onClick
      ? (event: React.MouseEvent<HTMLButtonElement>) => {
          const from = event.currentTarget;
          onClick();
          keepToolbarFocus(from);
        }
      : undefined,
  };
  const classes = `emvb-ie-btn${showLabel ? "" : " emvb-ie-btn-icon"}${className ? ` ${className}` : ""}`;
  const button = showLabel ? (
    <Button type="button" variant={variant} size="sm" className={classes} icon={icon} {...props}>
      {label}
    </Button>
  ) : (
    <Button
      type="button"
      variant={variant}
      size="sm"
      shape="square"
      aria-label={label}
      className={classes}
      icon={icon}
      {...props}
    />
  );
  if (showLabel || props.disabled) return button;
  return (
    <Tooltip content={label} side="bottom" asChild>
      {button}
    </Tooltip>
  );
}

export function UndoButton(props: { className?: string }) {
  const editor = useImageEditor();
  return (
    <IconButton
      label="Undo"
      icon={<ArrowUUpLeftIcon aria-hidden="true" />}
      disabled={editor.disabled || !editor.history.canUndo}
      onClick={() => editor.history.undo()}
      data-emvb-image-undo=""
      {...props}
    />
  );
}

export function RedoButton(props: { className?: string }) {
  const editor = useImageEditor();
  return (
    <IconButton
      label="Redo"
      icon={<ArrowUUpRightIcon aria-hidden="true" />}
      disabled={editor.disabled || !editor.history.canRedo}
      onClick={() => editor.history.redo()}
      data-emvb-image-redo=""
      {...props}
    />
  );
}

export function ResetAllButton() {
  const editor = useImageEditor();
  return (
    <IconButton
      label="Reset"
      showLabel
      variant="outline"
      icon={<ArrowCounterClockwiseIcon aria-hidden="true" />}
      disabled={editor.disabled || !editor.hasImage || editor.recipes.current === null}
      onClick={() => editor.resetAll()}
      data-emvb-image-reset=""
    />
  );
}

/** Press and hold to see the original (geometry is kept). */
export function CompareButton({ showLabel = true }: { showLabel?: boolean }) {
  const editor = useImageEditor();
  const release = () => editor.compare.setActive(false);
  return (
    <IconButton
      label="Original"
      showLabel={showLabel}
      variant={showLabel ? "outline" : "ghost"}
      icon={<EyeIcon aria-hidden="true" />}
      aria-pressed={editor.compare.active}
      disabled={editor.disabled || !editor.hasImage}
      data-emvb-image-compare=""
      onBlur={release}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") editor.compare.setActive(true);
      }}
      onKeyUp={release}
      onPointerCancel={release}
      onPointerDown={() => editor.compare.setActive(true)}
      onPointerLeave={release}
      onPointerUp={release}
    />
  );
}

/** The sidebar's tool switcher: one icon per tool, the active one filled (photocn ToggleGroup). */
export function ToolSwitcher() {
  const editor = useImageEditor();
  const disabled = editor.disabled || editor.isLoading;
  const buttons = React.useRef<(HTMLButtonElement | null)[]>([]);
  const index = IMAGE_EDITOR_TOOLS.findIndex((t) => t.id === editor.tool);
  const onKeyDown = (event: React.KeyboardEvent) => {
    // W-680: Alt+Left is the browser's Back; Ctrl/Cmd keys are shortcuts.
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const count = IMAGE_EDITOR_TOOLS.length;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % count
        : event.key === "ArrowLeft"
          ? (index - 1 + count) % count
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? count - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    const target = IMAGE_EDITOR_TOOLS[next];
    if (target) editor.setTool(target.id);
    buttons.current[next]?.focus();
  };
  return (
    <div
      className="emvb-ie-switcher"
      role="toolbar"
      aria-label="Editor tools"
      onKeyDown={onKeyDown}
      data-slot="editor-toolbar"
    >
      {IMAGE_EDITOR_TOOLS.map((tool, i) => {
        const ToolIcon = TOOL_ICONS[tool.id];
        const active = tool.id === editor.tool;
        return (
          <button
            key={tool.id}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            className="emvb-ie-switch"
            aria-label={tool.label}
            aria-pressed={active}
            title={tool.label}
            tabIndex={active || (index < 0 && i === 0) ? 0 : -1}
            disabled={disabled}
            data-emvb-image-tool={tool.id}
            onClick={() => editor.setTool(tool.id)}
          >
            <ToolIcon aria-hidden="true" weight={active ? "bold" : "regular"} />
          </button>
        );
      })}
    </div>
  );
}

/** Phone tool bar: labelled, horizontally scrolling, 44 px targets (photocn CompactToolBar). */
export function CompactToolBar({
  onSelect,
  disabled,
  className,
}: {
  onSelect: (tool: ImageEditorToolId) => void;
  disabled?: boolean;
  className?: string;
}) {
  const editor = useImageEditor();
  return (
    <nav
      className={`emvb-ie-compact-tools${className ? ` ${className}` : ""}`}
      aria-label="Editor tools"
    >
      {IMAGE_EDITOR_TOOLS.map((tool) => {
        const ToolIcon = TOOL_ICONS[tool.id];
        const active = tool.id === editor.tool;
        return (
          <button
            key={tool.id}
            type="button"
            className="emvb-ie-compact-tool"
            aria-pressed={active}
            disabled={disabled}
            data-emvb-image-tool={tool.id}
            onClick={() => onSelect(tool.id)}
          >
            <ToolIcon aria-hidden="true" />
            {tool.label}
          </button>
        );
      })}
    </nav>
  );
}

/** Title and description on the left, Reset on the right, a rule below (photocn PanelResetHeader). */
export function PanelHeader({
  title,
  description,
  onReset,
  resetDisabled = false,
}: {
  title: string;
  description?: string;
  onReset?: () => void;
  resetDisabled?: boolean;
}) {
  return (
    <div className="emvb-ie-panel-head">
      <div className="emvb-ie-panel-titles">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      <IconButton
        label="Reset"
        showLabel
        variant="outline"
        icon={<ArrowCounterClockwiseIcon aria-hidden="true" />}
        disabled={resetDisabled || !onReset}
        onClick={onReset}
        data-emvb-image-panel-reset=""
      />
    </div>
  );
}

/**
 * A slider whose zero is the middle, with its value as a click-to-reset button (photocn
 * CenteredSlider).
 * A native range input styled with EmVB tokens: Kumo has no slider. `onCommit` fires on release.
 */
export function CenteredSlider({
  label,
  value,
  min,
  max,
  step,
  disabled,
  format,
  onChange,
  onCommit,
  name,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  format: (value: number) => string;
  onChange: (value: number) => void;
  onCommit?: () => void;
  name: string;
}) {
  const id = React.useId();
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className="emvb-ie-slider" data-disabled={disabled || undefined}>
      <div className="emvb-ie-slider-head">
        <label htmlFor={id}>{label}</label>
        <button
          type="button"
          className="emvb-ie-slider-value"
          disabled={disabled || value === 0}
          title="Reset"
          onClick={() => {
            onChange(0);
            onCommit?.();
          }}
        >
          {format(value)}
        </button>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        data-emvb-image-slider={name}
        style={
          {
            "--emvb-ie-from": "0%",
            "--emvb-ie-to": `${fill}%`,
          } as React.CSSProperties
        }
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        onPointerUp={() => onCommit?.()}
        onKeyUp={() => onCommit?.()}
        onBlur={() => onCommit?.()}
      />
    </div>
  );
}

const roundTo = (v: number, step: number) => {
  const places = Math.max(0, -Math.floor(Math.log10(step)));
  return Number(v.toFixed(places));
};

/**
 * A labelled slider with a typed value (W-484; photocn's adjustment, blur and filter sliders,
 * whose value is a read-only output). The value field takes a number in the shown unit: Enter or
 * leaving the field applies it, Escape puts the old one back, ↑/↓ step it. Values are in the
 * units shown (−1 to 1, or 0 to 100 for percentages); `onCommit` ends one undo step.
 */
export function ValueSlider({
  label,
  name,
  value,
  min,
  max,
  step,
  disabled,
  format,
  onChange,
  onCommit,
}: {
  label: string;
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  format: (value: number) => string;
  onChange: (value: number) => void;
  onCommit?: () => void;
}) {
  const id = React.useId();
  const labelId = `${id}-label`;
  const [draft, setDraft] = React.useState<string | null>(null);
  const fill = ((value - min) / (max - min)) * 100;
  const apply = (raw: string) => {
    setDraft(null);
    const parsed = Number.parseFloat(raw.replace(/[^\d.+-]/g, ""));
    if (!Number.isFinite(parsed)) return;
    const next = roundTo(Math.min(max, Math.max(min, parsed)), step);
    if (next !== value) onChange(next);
    onCommit?.();
  };
  return (
    <div className="emvb-ie-slider" data-disabled={disabled || undefined}>
      <div className="emvb-ie-slider-head">
        <label id={labelId} htmlFor={id}>
          {label}
        </label>
        <input
          type="text"
          inputMode="decimal"
          className="emvb-ie-number"
          aria-label={`${label} value`}
          disabled={disabled}
          data-emvb-image-number={name}
          value={draft ?? format(value)}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={(event) => {
            if (draft !== null) apply(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (isCommitEnter(event)) {
              event.preventDefault();
              apply(event.currentTarget.value);
            } else if (event.key === "Escape") {
              // Put the old value back, and keep Esc from closing the editor.
              event.preventDefault();
              event.stopPropagation();
              setDraft(null);
            } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              const delta = (event.key === "ArrowUp" ? 1 : -1) * step * (event.shiftKey ? 10 : 1);
              const next = roundTo(Math.min(max, Math.max(min, value + delta)), step);
              setDraft(null);
              onChange(next);
              onCommit?.();
            }
          }}
        />
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-valuetext={format(value)}
        data-emvb-image-slider={name}
        style={{ "--emvb-ie-from": "0%", "--emvb-ie-to": `${fill}%` } as React.CSSProperties}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        onPointerUp={() => onCommit?.()}
        onKeyUp={() => onCommit?.()}
        onBlur={() => onCommit?.()}
      />
    </div>
  );
}

/** Underlined or segmented section tabs (photocn's TabsList, here Kumo Tabs). */
export function SectionTabs<T extends string>({
  label,
  value,
  items,
  onChange,
  variant = "underline",
  name,
}: {
  label: string;
  value: T;
  items: readonly { value: T; label: React.ReactNode }[];
  onChange: (value: T) => void;
  variant?: "underline" | "segmented";
  name: string;
}) {
  return (
    <div
      className="emvb-ie-tabs"
      data-variant={variant}
      data-emvb-image-tabs={name}
      role="group"
      aria-label={label}
    >
      <Tabs
        variant={variant}
        size="sm"
        value={value}
        tabs={items.map((item) => ({ value: item.value, label: item.label }))}
        onValueChange={(next) => {
          const match = items.find((item) => item.value === next);
          if (match) onChange(match.value);
        }}
      />
    </div>
  );
}

/** Live RGB histogram of the rendered image (photocn ImageEditorHistogram). */
export function Histogram() {
  const editor = useImageEditor();
  const pixels = editor.histogram.data?.pixels;
  return (
    <div className="emvb-ie-histogram" data-slot="image-editor-histogram">
      <div className="emvb-ie-histogram-head">
        <span>Histogram</span>
        <span className="emvb-ie-mono">{pixels ? pixels.toLocaleString() : "—"}</span>
      </div>
      <canvas aria-hidden="true" height={64} width={256} ref={editor.histogram.canvasRef} />
    </div>
  );
}

/** Perspective "adjust corners" icon (photocn icon-skew.tsx, from xdadda/mini-photo-editor). */
export function SkewIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
    >
      <path d="M7 5 L21 8 L17 19 L3 16 Z" />
      <circle cx="7" cy="5" r="0.7" fill="currentColor" />
      <circle cx="21" cy="8" r="0.7" fill="currentColor" />
      <circle cx="17" cy="19" r="0.7" fill="currentColor" />
      <circle cx="3" cy="16" r="0.7" fill="currentColor" />
    </svg>
  );
}

/** Quarter-turn icons, as in photocn's crop panel (Lucide rotate-ccw/cw-square, ISC). */
export function RotateSquareIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
    >
      {direction === "left" ? (
        <>
          <path d="M20 9V7a2 2 0 0 0-2-2h-6" />
          <path d="m15 2-3 3 3 3" />
          <path d="M20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
        </>
      ) : (
        <>
          <path d="M12 5H6a2 2 0 0 0-2 2v3" />
          <path d="m9 8 3-3-3-3" />
          <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        </>
      )}
    </svg>
  );
}
