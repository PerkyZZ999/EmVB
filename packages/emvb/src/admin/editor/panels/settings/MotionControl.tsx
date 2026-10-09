import { Button } from "@cloudflare/kumo";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import type * as React from "react";
import {
  MOTION_EFFECTS,
  MOTION_LIMITS,
  type MotionEffect,
  type StyleProps,
} from "../../../../core/index.ts";
import { BUTTON } from "../../../ui.ts";
import { TransitionSelect } from "./EffectsControls.tsx";
import { NumberField, type NumberSpec } from "./NumberRow.tsx";

type Motion = NonNullable<StyleProps["scrollMotion"]>;
type Playing = Extract<Motion, { effects: unknown }>;
type Effect = Playing["effects"][number];

const EFFECT_LABELS: Record<MotionEffect, { label: string; unit: string; neutral: number }> = {
  fade: { label: "Opacity", unit: "%", neutral: 100 },
  "move-x": { label: "Move sideways", unit: "px", neutral: 0 },
  "move-y": { label: "Move up/down", unit: "px", neutral: 0 },
  scale: { label: "Scale", unit: "%", neutral: 100 },
  rotate: { label: "Rotate", unit: "°", neutral: 0 },
  blur: { label: "Blur", unit: "px", neutral: 0 },
};

const RANGES: { value: Playing["range"]; label: string }[] = [
  { value: "enter", label: "As it comes into view" },
  { value: "cross", label: "While it crosses the screen" },
  { value: "exit", label: "As it leaves the screen" },
  { value: "page", label: "Over the whole page scroll" },
];

/** Ready-made motions (W-319). Each is a plain value: pick one, then tune it. */
export const MOTION_PRESETS: { id: string; label: string; value: Playing }[] = [
  {
    id: "fade-in",
    label: "Fade in",
    value: { range: "enter", effects: [{ type: "fade", from: 0, to: 100 }] },
  },
  {
    id: "rise",
    label: "Rise in",
    value: {
      range: "enter",
      effects: [
        { type: "fade", from: 0, to: 100 },
        { type: "move-y", from: 60, to: 0 },
      ],
    },
  },
  {
    id: "slide-left",
    label: "Slide in from the side",
    value: {
      range: "enter",
      effects: [
        { type: "fade", from: 0, to: 100 },
        { type: "move-x", from: -80, to: 0 },
      ],
    },
  },
  {
    id: "zoom",
    label: "Zoom in",
    value: { range: "enter", effects: [{ type: "scale", from: 80, to: 100 }] },
  },
  {
    id: "parallax",
    label: "Parallax",
    value: { range: "cross", effects: [{ type: "move-y", from: 80, to: -80 }] },
  },
  {
    id: "spin",
    label: "Turn while scrolling",
    value: { range: "cross", effects: [{ type: "rotate", from: -10, to: 10 }] },
  },
  {
    id: "blur-in",
    label: "Sharpen in",
    value: { range: "enter", effects: [{ type: "blur", from: 12, to: 0 }] },
  },
  {
    id: "fade-out",
    label: "Fade out on leave",
    value: { range: "exit", effects: [{ type: "fade", from: 100, to: 0 }] },
  },
];

const specFor = (type: MotionEffect): NumberSpec => {
  const [min, max] = MOTION_LIMITS[type];
  return {
    min,
    max,
    integer: true,
    example: String(EFFECT_LABELS[type].neutral),
    suffix: EFFECT_LABELS[type].unit,
  };
};

/** The preset a value matches exactly, or "custom". */
export function presetOf(value: Playing): string {
  const key = JSON.stringify(value);
  return MOTION_PRESETS.find((p) => JSON.stringify(p.value) === key)?.id ?? "custom";
}

/**
 * Scroll motion (W-319, Normal only): a preset, when it plays and each effect's start and end.
 * Plays with CSS scroll-driven animations; never for visitors who prefer reduced motion.
 */
export function MotionControl({
  value,
  onChange,
  reset,
}: {
  value: Motion | undefined;
  onChange: (next: Motion | undefined) => void;
  reset: React.ReactNode;
}) {
  const playing = value && "effects" in value ? value : undefined;
  const setEffects = (effects: Effect[]) => {
    if (!playing) return;
    onChange(effects.length > 0 ? { ...playing, effects } : undefined);
  };
  const unused = MOTION_EFFECTS.filter((t) => !playing?.effects.some((e) => e.type === t));
  const presetOptions = [
    ...MOTION_PRESETS.map((p) => ({ value: p.id, label: p.label })),
    ...(playing && presetOf(playing) === "custom" ? [{ value: "custom", label: "Custom" }] : []),
  ];
  return (
    <div
      className="emvb-style-row"
      data-emvb-style="scrollMotion"
      data-set={value ? "true" : undefined}
    >
      <div className="emvb-field-group emvb-transition emvb-motion">
        <span className="emvb-var-field-label">Scroll motion</span>
        {value && !playing && (
          <p className="emvb-helper" data-emvb-motion-off="">
            Off on this screen.
          </p>
        )}
        {playing && (
          <>
            <TransitionSelect
              label="Motion"
              value={presetOf(playing)}
              options={presetOptions}
              onChange={(id) => {
                const preset = MOTION_PRESETS.find((p) => p.id === id);
                if (preset) onChange(structuredClone(preset.value));
              }}
            />
            <TransitionSelect
              label="Plays"
              value={playing.range}
              options={RANGES}
              onChange={(range) => onChange({ ...playing, range })}
            />
            {playing.effects.map((effect, index) => (
              <div className="emvb-motion-effect" key={effect.type} data-emvb-motion={effect.type}>
                <span className="emvb-motion-name">{EFFECT_LABELS[effect.type].label}</span>
                <NumberField
                  fieldKey={`scrollMotion.${effect.type}.from`}
                  label="From"
                  value={effect.from}
                  spec={specFor(effect.type)}
                  onCommit={(n) =>
                    setEffects(
                      playing.effects.with(index, {
                        ...effect,
                        from: n ?? EFFECT_LABELS[effect.type].neutral,
                      }),
                    )
                  }
                />
                <NumberField
                  fieldKey={`scrollMotion.${effect.type}.to`}
                  label="To"
                  value={effect.to}
                  spec={specFor(effect.type)}
                  onCommit={(n) =>
                    setEffects(
                      playing.effects.with(index, {
                        ...effect,
                        to: n ?? EFFECT_LABELS[effect.type].neutral,
                      }),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  shape="square"
                  className={BUTTON}
                  aria-label={`Remove ${EFFECT_LABELS[effect.type].label}`}
                  icon={<XIcon aria-hidden="true" />}
                  onClick={() => setEffects(playing.effects.filter((_, i) => i !== index))}
                />
              </div>
            ))}
            {unused.length > 0 && (
              <TransitionSelect
                label="Add effect"
                value={"" as MotionEffect | ""}
                options={[
                  { value: "" as const, label: "Choose…" },
                  ...unused.map((t) => ({ value: t, label: EFFECT_LABELS[t].label })),
                ]}
                onChange={(type) => {
                  if (!type) return;
                  const n = EFFECT_LABELS[type].neutral;
                  setEffects([...playing.effects, { type, from: n, to: n }]);
                }}
              />
            )}
            <p className="emvb-helper">
              Plays as visitors scroll, in browsers that support scroll-driven animations. Visitors
              who ask for reduced motion see it still.
            </p>
          </>
        )}
        {!value && (
          <Button
            type="button"
            variant="secondary"
            className={`${BUTTON} emvb-add-shadow`}
            icon={<PlusIcon aria-hidden="true" />}
            onClick={() =>
              onChange(
                structuredClone((MOTION_PRESETS[1] as (typeof MOTION_PRESETS)[number]).value),
              )
            }
          >
            Add scroll motion
          </Button>
        )}
        {playing && (
          <Button
            type="button"
            variant="ghost"
            className={BUTTON}
            onClick={() => onChange({ type: "none" })}
          >
            Turn off here
          </Button>
        )}
      </div>
      {reset}
    </div>
  );
}
