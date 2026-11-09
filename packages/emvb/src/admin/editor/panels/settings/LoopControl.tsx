import { Button, DropdownMenu } from "@cloudflare/kumo";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import type * as React from "react";
import { MOTION_EFFECTS, type FlatStyleProps } from "../../../../core/index.ts";
import { BUTTON } from "../../../ui.ts";
import { TransitionSelect } from "./EffectsControls.tsx";
import { HintedSwitch } from "./HintedSwitch.tsx";
import { EFFECT_LABELS, specFor } from "./MotionControl.tsx";
import { NumberField, type NumberSpec } from "./NumberRow.tsx";

type Loop = NonNullable<FlatStyleProps["loopMotion"]>;
type Playing = Extract<Loop, { effects: unknown }>;
type Effect = Playing["effects"][number];
type Easing = NonNullable<Playing["easing"]>;

const DURATION: NumberSpec = {
  min: 200,
  max: 20_000,
  integer: true,
  example: "1600",
  suffix: "ms",
};

const EASINGS: { value: Easing; label: string }[] = [
  { value: "ease-in-out", label: "Smooth" },
  { value: "ease", label: "Ease" },
  { value: "ease-in", label: "Speed up" },
  { value: "ease-out", label: "Slow down" },
  { value: "linear", label: "Steady" },
];

/**
 * Ready-made loops (W-939). Each is a plain value: pick one, then tune it. They play back and
 * forth, except Spin, which turns all the way round.
 */
export const LOOP_PRESETS: { id: string; label: string; value: Playing }[] = [
  {
    id: "float",
    label: "Float",
    value: { duration: 1600, effects: [{ type: "move-y", from: 0, to: -8 }] },
  },
  {
    id: "pulse",
    label: "Pulse",
    value: { duration: 900, effects: [{ type: "scale", from: 100, to: 106 }] },
  },
  {
    id: "breathe",
    label: "Breathe",
    value: { duration: 1800, effects: [{ type: "fade", from: 100, to: 60 }] },
  },
  {
    id: "wiggle",
    label: "Wiggle",
    value: { duration: 300, effects: [{ type: "rotate", from: -3, to: 3 }] },
  },
  {
    id: "drift",
    label: "Drift sideways",
    value: { duration: 2400, effects: [{ type: "move-x", from: -6, to: 6 }] },
  },
  {
    id: "spin",
    label: "Spin",
    value: {
      duration: 2000,
      easing: "linear",
      alternate: false,
      effects: [{ type: "rotate", from: 0, to: 360 }],
    },
  },
];

const presetOf = (value: Playing): string => {
  const { loop: _loop, ...rest } = value;
  const key = JSON.stringify(rest);
  return LOOP_PRESETS.find((p) => JSON.stringify(p.value) === key)?.id ?? "custom";
};

/**
 * A looping animation (W-938, W-939, Normal only): a preset, its speed and each effect's two ends.
 * Plays back and forth unless turned off; stops after about 5 seconds unless it loops forever
 * (D-057, D-059); never for visitors who prefer reduced motion. Plays live on the canvas.
 */
export function LoopControl({
  value,
  onChange,
  reset,
}: {
  value: Loop | undefined;
  onChange: (next: Loop | undefined) => void;
  reset: React.ReactNode;
}) {
  const playing = value && "effects" in value ? value : undefined;
  const update = (patch: Partial<Playing>) => playing && onChange({ ...playing, ...patch });
  const setEffects = (effects: Effect[]) => {
    if (!playing) return;
    onChange(effects.length > 0 ? { ...playing, effects } : undefined);
  };
  const unused = MOTION_EFFECTS.filter((t) => !playing?.effects.some((e) => e.type === t));
  const presetOptions = [
    ...LOOP_PRESETS.map((p) => ({ value: p.id, label: p.label })),
    ...(playing && presetOf(playing) === "custom" ? [{ value: "custom", label: "Custom" }] : []),
  ];
  return (
    <div
      className="emvb-style-row"
      data-emvb-style="loopMotion"
      data-set={value ? "true" : undefined}
    >
      <div className="emvb-field-group emvb-transition emvb-motion">
        <span className="emvb-var-field-label">Loop</span>
        {value && !playing && (
          <p className="emvb-helper" data-emvb-loop-off="">
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
                const preset = LOOP_PRESETS.find((p) => p.id === id);
                if (preset)
                  onChange({
                    ...structuredClone(preset.value),
                    ...(playing.loop ? { loop: true as const } : {}),
                  });
              }}
            />
            <NumberField
              fieldKey="loopMotion.duration"
              label="Duration"
              value={playing.duration}
              spec={DURATION}
              onCommit={(n) => update({ duration: n ?? 1600 })}
            />
            <TransitionSelect
              label="Easing"
              value={playing.easing ?? "ease-in-out"}
              options={EASINGS}
              onChange={(easing) => update({ easing })}
            />
            <HintedSwitch
              label="Back and forth"
              checked={playing.alternate !== false}
              onCheckedChange={(on) => {
                const { alternate: _a, ...rest } = playing;
                onChange(on ? rest : { ...rest, alternate: false });
              }}
              data={{ "data-emvb-loop-alternate": "" }}
              hint="Off: it jumps back to the start each time, as a spin does."
            />
            {playing.effects.map((effect, index) => (
              <div className="emvb-motion-effect" key={effect.type} data-emvb-loop={effect.type}>
                <span className="emvb-motion-name">{EFFECT_LABELS[effect.type].label}</span>
                <NumberField
                  fieldKey={`loopMotion.${effect.type}.from`}
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
                  fieldKey={`loopMotion.${effect.type}.to`}
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
              <DropdownMenu>
                <DropdownMenu.Trigger>
                  <Button
                    type="button"
                    variant="secondary"
                    className={`${BUTTON} emvb-add-effect`}
                    icon={<PlusIcon aria-hidden="true" />}
                  >
                    Add effect
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content data-emvb-add-loop-effect="">
                  {unused.map((type) => (
                    <DropdownMenu.Item
                      key={type}
                      onClick={() => {
                        const n = EFFECT_LABELS[type].neutral;
                        setEffects([...playing.effects, { type, from: n, to: n }]);
                      }}
                    >
                      {EFFECT_LABELS[type].label}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu>
            )}
            <HintedSwitch
              label="Loop forever"
              checked={playing.loop === true}
              onCheckedChange={(loop) => {
                const { loop: _old, ...rest } = playing;
                onChange(loop ? { ...rest, loop: true } : rest);
              }}
              data={{ "data-emvb-loop-forever": "" }}
              hint={
                playing.loop
                  ? "Keeps going. Moving content that never stops can distract; the accessibility check flags it. Off for visitors who prefer reduced motion."
                  : "Stops on its own after about 5 seconds. Off for visitors who prefer reduced motion."
              }
            />
          </>
        )}
        {!value && (
          <Button
            type="button"
            variant="secondary"
            className={`${BUTTON} emvb-add-shadow`}
            icon={<PlusIcon aria-hidden="true" />}
            data-emvb-add-loop=""
            onClick={() =>
              onChange(structuredClone((LOOP_PRESETS[0] as (typeof LOOP_PRESETS)[number]).value))
            }
          >
            Add loop
          </Button>
        )}
        {playing && (
          <Button
            type="button"
            variant="ghost"
            className={BUTTON}
            onClick={() => onChange({ type: "none" })}
          >
            Turn off loop
          </Button>
        )}
      </div>
      {reset}
    </div>
  );
}
