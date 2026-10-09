import * as React from "react";
import { AUDIENCE_DEVICES, type Audience, type LayoutNode } from "../../../../core/index.ts";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COUNTRY = /^[A-Z]{2}$/;

type Mode = "everyone" | "only" | "except";

/** "ca, us fr" → ["CA", "US", "FR"]; anything else is left out. */
export function parseCountries(text: string): string[] {
  const codes = text
    .toUpperCase()
    .split(/[\s,;]+/)
    .filter((code) => COUNTRY.test(code));
  return [...new Set(codes)].slice(0, 50);
}

/** Drops empty rules so the stored audience stays valid (W-313). */
function tidy(audience: Audience): Audience | undefined {
  const next: Audience = { ...audience };
  if (next.countries?.length === 0) delete next.countries;
  if (next.devices?.length === 0) delete next.devices;
  if (next.days?.length === 0) delete next.days;
  if (!next.timeZone) delete next.timeZone;
  if (!next.hide) delete next.hide;
  return next;
}

const ruleCount = (a: Audience) =>
  [a.countries, a.devices, a.visitor, a.hours, a.days].filter((r) => r !== undefined).length;

/**
 * Visitors (W-313): show or hide this element by country, device, new or returning visitor,
 * and time. The server decides, so it costs no script; the canvas shows it outlined.
 */
export function AudienceEditor({
  node,
  isRoot,
  onChange,
}: {
  node: LayoutNode;
  isRoot: boolean;
  onChange: (node: LayoutNode) => void;
}) {
  const [countryText, setCountryText] = React.useState(node.audience?.countries?.join(", ") ?? "");
  React.useEffect(() => {
    setCountryText(node.audience?.countries?.join(", ") ?? "");
  }, [node.id]);
  if (isRoot) return null;
  const audience = node.audience;
  const mode: Mode = !audience ? "everyone" : audience.hide ? "except" : "only";
  const set = (next: Audience | undefined) => {
    const { audience: _old, ...rest } = node;
    const clean = next ? tidy(next) : undefined;
    onChange((clean ? { ...rest, audience: clean } : rest) as LayoutNode);
  };
  const base: Audience = audience ?? {};
  const id = `emvb-aud-${node.id}`;
  return (
    <section className="emvb-bind" data-emvb-audience-editor="" aria-labelledby={`${id}-title`}>
      <h3 className="emvb-bind-title" id={`${id}-title`}>
        Visitors
      </h3>
      <label className="emvb-bind-row">
        <span className="emvb-bind-label">Show to</span>
        <select
          className="emvb-native-select"
          value={mode}
          data-emvb-audience-mode=""
          onChange={(event) => {
            const value = event.currentTarget.value as Mode;
            if (value === "everyone") set(undefined);
            else set({ ...base, hide: value === "except" });
          }}
        >
          <option value="everyone">Everyone</option>
          <option value="only">Only visitors who match</option>
          <option value="except">Everyone except visitors who match</option>
        </select>
      </label>
      {audience && (
        <>
          <label className="emvb-bind-row">
            <span className="emvb-bind-label">Countries (two-letter codes)</span>
            <input
              className="emvb-native-input"
              value={countryText}
              placeholder="CA, US"
              data-emvb-audience-countries=""
              onChange={(event) => setCountryText(event.currentTarget.value)}
              onBlur={() => {
                const countries = parseCountries(countryText);
                setCountryText(countries.join(", "));
                set({ ...base, countries });
              }}
            />
          </label>
          <fieldset className="emvb-aud-checks">
            <legend className="emvb-bind-label">Devices</legend>
            {AUDIENCE_DEVICES.map((device) => (
              <label key={device}>
                <input
                  type="checkbox"
                  checked={base.devices?.includes(device) ?? false}
                  data-emvb-audience-device={device}
                  onChange={(event) => {
                    const now = new Set(base.devices ?? []);
                    if (event.currentTarget.checked) now.add(device);
                    else now.delete(device);
                    set({ ...base, devices: AUDIENCE_DEVICES.filter((d) => now.has(d)) });
                  }}
                />{" "}
                {device[0]?.toUpperCase()}
                {device.slice(1)}
              </label>
            ))}
          </fieldset>
          <label className="emvb-bind-row">
            <span className="emvb-bind-label">Visit</span>
            <select
              className="emvb-native-select"
              value={base.visitor ?? "any"}
              data-emvb-audience-visitor=""
              onChange={(event) => {
                const value = event.currentTarget.value;
                const { visitor: _v, ...rest } = base;
                set(value === "new" || value === "returning" ? { ...rest, visitor: value } : rest);
              }}
            >
              <option value="any">New or returning</option>
              <option value="new">First visit</option>
              <option value="returning">Returning visitor</option>
            </select>
          </label>
          <div className="emvb-bind-row">
            <span className="emvb-bind-label">Hours (24 h, empty = all day)</span>
            <input
              className="emvb-native-input"
              type="number"
              min={0}
              max={23}
              aria-label="From hour"
              data-emvb-audience-from=""
              value={base.hours?.from ?? ""}
              onChange={(event) => {
                const raw = event.currentTarget.value;
                const { hours: _h, ...rest } = base;
                if (raw === "") return set(rest);
                const from = Math.min(23, Math.max(0, Math.round(Number(raw))));
                set({ ...rest, hours: { from, to: base.hours?.to ?? 24 } });
              }}
            />
            <input
              className="emvb-native-input"
              type="number"
              min={0}
              max={24}
              aria-label="To hour"
              data-emvb-audience-to=""
              value={base.hours?.to ?? ""}
              onChange={(event) => {
                const raw = event.currentTarget.value;
                const { hours: _h, ...rest } = base;
                if (raw === "") return set(rest);
                const to = Math.min(24, Math.max(0, Math.round(Number(raw))));
                set({ ...rest, hours: { from: base.hours?.from ?? 0, to } });
              }}
            />
          </div>
          <fieldset className="emvb-aud-checks">
            <legend className="emvb-bind-label">Days (none = every day)</legend>
            {DAYS.map((day, index) => (
              <label key={day}>
                <input
                  type="checkbox"
                  checked={base.days?.includes(index) ?? false}
                  data-emvb-audience-day={index}
                  onChange={(event) => {
                    const now = new Set(base.days ?? []);
                    if (event.currentTarget.checked) now.add(index);
                    else now.delete(index);
                    set({ ...base, days: DAYS.map((_d, i) => i).filter((i) => now.has(i)) });
                  }}
                />{" "}
                {day}
              </label>
            ))}
          </fieldset>
          {(base.hours || base.days) && (
            <label className="emvb-bind-row">
              <span className="emvb-bind-label">Time zone</span>
              <input
                className="emvb-native-input"
                value={base.timeZone ?? ""}
                placeholder="UTC"
                data-emvb-audience-zone=""
                onChange={(event) => {
                  const value = event.currentTarget.value.trim();
                  if (value && !/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/.test(value))
                    return;
                  set({ ...base, timeZone: value });
                }}
              />
            </label>
          )}
          <p className="emvb-helper" data-emvb-audience-help="">
            {ruleCount(base) === 0
              ? "Add a rule: with none, every visitor matches."
              : "The server checks these on each visit, with no script. A rule it can't check (no country from the host) doesn't match. The canvas shows this element to you either way."}
          </p>
        </>
      )}
    </section>
  );
}
