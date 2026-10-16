import * as React from "react";
import {
  AUDIENCE_DEVICES,
  AUDIENCE_SEGMENT,
  type Audience,
  type LayoutNode,
} from "../../../../core/index.ts";
import { PanelSelect } from "./PanelSelect.tsx";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COUNTRY = /^[A-Z]{2}$/;

type Mode = "everyone" | "only" | "except";

/** "ca, us fr" → ["CA", "US", "FR"]; anything else is left out. */
export function parseCountries(text: string): string[] {
  const codes = text
    .toUpperCase()
    .split(/[\s,;]+/)
    .filter((code) => COUNTRY.test(code))
    // W-544: visitors' country codes are ISO ones, where the United Kingdom is GB; a "UK" rule
    // never matched anyone.
    .map((code) => (code === "UK" ? "GB" : code));
  return [...new Set(codes)].slice(0, 50);
}

/** "Member, pro  vip" → ["member", "pro", "vip"]; names that aren't segments are left out (W-329). */
export function parseSegments(text: string): string[] {
  const names = text
    .toLowerCase()
    .split(/[\s,;]+/)
    .filter((name) => AUDIENCE_SEGMENT.test(name));
  return [...new Set(names)].slice(0, 20);
}

const ZONE = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/;

/**
 * W-438: the time zone as stored ("" for UTC), or null when it isn't a zone this server knows.
 * "america/toronto" becomes "America/Toronto". An unknown zone used to be saved and silently
 * read as UTC.
 */
export function readTimeZone(text: string): string | null {
  const value = text.trim();
  if (value === "") return "";
  if (!ZONE.test(value)) return null;
  try {
    const zone = new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
    return ZONE.test(zone) ? zone : null;
  } catch {
    return null;
  }
}

/** Drops empty rules so the stored audience stays valid (W-313). */
function tidy(audience: Audience): Audience | undefined {
  const next: Audience = { ...audience };
  if (next.countries?.length === 0) delete next.countries;
  if (next.devices?.length === 0) delete next.devices;
  if (next.segments?.length === 0) delete next.segments;
  if (next.days?.length === 0) delete next.days;
  if (!next.timeZone) delete next.timeZone;
  if (!next.hide) delete next.hide;
  return next;
}

const ruleCount = (a: Audience) =>
  [a.countries, a.devices, a.visitor, a.segments, a.hours, a.days].filter((r) => r !== undefined)
    .length;

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
  const [segmentText, setSegmentText] = React.useState(node.audience?.segments?.join(", ") ?? "");
  const [segmentError, setSegmentError] = React.useState<string | null>(null);
  // W-438: the zone is typed in full before it's checked; checking each keystroke refused the "/".
  const [zoneText, setZoneText] = React.useState(node.audience?.timeZone ?? "");
  const [zoneError, setZoneError] = React.useState<string | null>(null);
  React.useEffect(() => {
    setCountryText(node.audience?.countries?.join(", ") ?? "");
    setSegmentText(node.audience?.segments?.join(", ") ?? "");
    setZoneText(node.audience?.timeZone ?? "");
    setZoneError(null);
    // W-608: another element's rejected segment name isn't this one's error.
    setSegmentError(null);
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
      <div className="emvb-bind-row">
        <span className="emvb-bind-label" id={`${id}-show`}>
          Show to
        </span>
        <PanelSelect
          labelledBy={`${id}-show`}
          value={mode}
          data={{ "data-emvb-audience-mode": "" }}
          options={[
            { value: "everyone", label: "Everyone" },
            { value: "only", label: "Only visitors who match" },
            { value: "except", label: "Everyone except visitors who match" },
          ]}
          onChange={(value) => {
            if (value === "everyone") set(undefined);
            else set({ ...base, hide: value === "except" });
          }}
        />
      </div>
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
          <div className="emvb-bind-row">
            <span className="emvb-bind-label" id={`${id}-visit`}>
              Visit
            </span>
            <PanelSelect
              labelledBy={`${id}-visit`}
              value={base.visitor ?? "any"}
              data={{ "data-emvb-audience-visitor": "" }}
              options={[
                { value: "any", label: "New or returning" },
                { value: "new", label: "First visit" },
                { value: "returning", label: "Returning visitor" },
              ]}
              onChange={(value) => {
                const { visitor: _v, ...rest } = base;
                set(value === "new" || value === "returning" ? { ...rest, visitor: value } : rest);
              }}
            />
          </div>
          <label className="emvb-bind-row">
            <span className="emvb-bind-label">Segments (from your site)</span>
            <input
              className="emvb-native-input"
              value={segmentText}
              placeholder="member, plan:pro"
              data-emvb-audience-segments=""
              aria-invalid={segmentError ? true : undefined}
              aria-describedby={segmentError ? `${id}-segment-error` : undefined}
              onChange={(event) => {
                setSegmentText(event.currentTarget.value);
                setSegmentError(null);
              }}
              onBlur={() => {
                const raw = segmentText.trim();
                if (raw === "") {
                  setSegmentText("");
                  setSegmentError(null);
                  set({ ...base, segments: [] });
                  return;
                }
                const tokens = raw
                  .toLowerCase()
                  .split(/[\s,;]+/)
                  .filter((name) => name.length > 0);
                const bad = tokens.find((name) => !AUDIENCE_SEGMENT.test(name));
                if (bad) {
                  setSegmentError(`${bad} isn't a segment name. Use letters, numbers, and : _ -`);
                  return;
                }
                const segments = parseSegments(segmentText);
                setSegmentError(null);
                setSegmentText(segments.join(", "));
                set({ ...base, segments });
              }}
            />
            {segmentError && (
              <span
                className="emvb-helper"
                id={`${id}-segment-error`}
                data-emvb-audience-segment-error=""
              >
                {segmentError}
              </span>
            )}
          </label>
          {ruleCount(base) === 0 && (
            <p className="emvb-helper" data-emvb-audience-empty="">
              {mode === "only"
                ? "Add a country, device, segment, or time. Until then, everyone sees this."
                : // W-608: with no rule every visitor matches, so "except" hides it from all.
                  "Add a country, device, segment, or time. Until then, this is hidden from every visitor."}
            </p>
          )}
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
                const to = base.hours?.to ?? 24;
                // W-615: clearing one end keeps the other; only all-day (0–24) drops the rule.
                const from = raw === "" ? 0 : Math.min(23, Math.max(0, Math.round(Number(raw))));
                if (from === 0 && to === 24) return set(rest);
                set({ ...rest, hours: { from, to } });
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
                const from = base.hours?.from ?? 0;
                const to = raw === "" ? 24 : Math.min(24, Math.max(0, Math.round(Number(raw))));
                if (from === 0 && to === 24) return set(rest);
                set({ ...rest, hours: { from, to } });
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
                value={zoneText}
                placeholder="UTC"
                data-emvb-audience-zone=""
                aria-invalid={zoneError ? true : undefined}
                aria-describedby={zoneError ? `${id}-zone-error` : undefined}
                onChange={(event) => {
                  setZoneText(event.currentTarget.value);
                  setZoneError(null);
                }}
                onBlur={() => {
                  const zone = readTimeZone(zoneText);
                  if (zone === null) {
                    setZoneError("Unknown time zone. Use a name such as America/Toronto.");
                    return;
                  }
                  setZoneText(zone);
                  if (zone !== (base.timeZone ?? "")) set({ ...base, timeZone: zone });
                }}
              />
            </label>
          )}
          {(base.hours || base.days) && zoneError && (
            <span className="emvb-helper" id={`${id}-zone-error`} data-emvb-audience-zone-error="">
              {zoneError}
            </span>
          )}
          <p className="emvb-helper" data-emvb-audience-help="">
            {ruleCount(base) === 0
              ? "Add a rule: with none, every visitor matches."
              : "The server checks these on each visit, with no script. A rule it can't check (no country from the host, or segments your site doesn't pass) doesn't match. The canvas shows this element to you either way."}
          </p>
        </>
      )}
    </section>
  );
}
