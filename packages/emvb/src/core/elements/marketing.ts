/**
 * The 1.3 marketing widgets (PLAN_1.3 part D): new elements from plain markup and CSS. Each one
 * renders without script; a count-up or a ticking clock is an opt-in runtime.
 */
import type {
  CountdownNode,
  CounterNode,
  CtaNode,
  FlipBoxNode,
  HeadlineNode,
  HotspotNode,
  HotspotsNode,
  MapNode,
  PriceListItemNode,
  PriceListNode,
  PriceTableNode,
  ProgressNode,
  ShareButtonsNode,
  ShareLinkNode,
} from "../schema/layout.ts";
import {
  SHARE_NETWORKS,
  COUNTDOWN_TARGET,
  COUNTER_SEPARATORS,
  MAX_COUNTER,
  MAX_PROGRESS,
} from "../schema/layout.ts";
import { sanitizeHref } from "../sanitize/href.ts";
import { SOCIAL_COLORS, SOCIAL_NAMES, socialSvg } from "./widgets.ts";
import { sanitizeMediaUrl } from "../sanitize/media-url.ts";
import type { VNode } from "../render/vnode.ts";
import { formatCounter } from "./counter-format.ts";
import type { ElementDefinition } from "./definition.ts";

/** Hidden from sight, still read by screen readers. */
const SR_ONLY =
  "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0";

const SEPARATOR_LABELS: Record<(typeof COUNTER_SEPARATORS)[number], string> = {
  ",": "1,000",
  ".": "1.000",
  " ": "1 000",
  "'": "1'000",
};

export const counter: ElementDefinition<CounterNode> = {
  baseCss: `.emvb-counter-number{margin:0;font-size:2.5em;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}.emvb-counter-title{margin:0.25em 0 0}.emvb-counter-sr{${SR_ONLY}}`,
  defaults: () => ({
    type: "counter",
    props: { value: 1200, separator: ",", suffix: "+", title: "Happy clients" },
  }),
  descriptor: {
    type: "counter",
    name: "Counter",
    group: "content",
    defaultTab: "content",
    fields: [
      {
        key: "value",
        kind: "decimal",
        label: "Number",
        min: -MAX_COUNTER,
        max: MAX_COUNTER,
        message: "Enter a number, such as 1200 or 98.5.",
      },
      { key: "prefix", kind: "text", label: "Before the number", optional: true },
      { key: "suffix", kind: "text", label: "After the number", optional: true },
      { key: "title", kind: "text", label: "Title", optional: true },
      {
        key: "decimals",
        kind: "select",
        label: "Decimals",
        optional: true,
        options: [0, 1, 2, 3].map((value) => ({ value, label: String(value) })),
      },
      {
        key: "separator",
        kind: "select",
        label: "Thousands separator",
        optional: true,
        options: COUNTER_SEPARATORS.map((value) => ({ value, label: SEPARATOR_LABELS[value] })),
      },
      {
        key: "countUp",
        kind: "boolean",
        label: "Count up when scrolled into view",
        optional: true,
      },
      {
        key: "start",
        kind: "decimal",
        label: "Count from",
        optional: true,
        min: -MAX_COUNTER,
        max: MAX_COUNTER,
        message: "Enter the number the count-up starts at, such as 0.",
      },
      {
        key: "duration",
        kind: "int",
        label: "Count-up time (ms)",
        optional: true,
        min: 300,
        max: 5000,
        message: "From 300 to 5000 ms (5 seconds at most).",
      },
    ],
  },
  build: (node, attrs) => {
    const { value, start, decimals, separator, prefix, suffix, title, countUp, duration } =
      node.props;
    const valueAttrs: Record<string, string> = { class: "emvb-counter-value" };
    if (countUp) {
      valueAttrs["data-emvb-counter"] = "";
      valueAttrs["data-from"] = String(start ?? 0);
      valueAttrs["data-to"] = String(value);
      if (decimals) valueAttrs["data-decimals"] = String(decimals);
      if (separator) valueAttrs["data-separator"] = separator;
      valueAttrs["data-duration"] = String(duration ?? 2000);
    }
    const number: (VNode | string)[] = [];
    if (prefix)
      number.push({ tag: "span", attrs: { class: "emvb-counter-prefix" }, children: [prefix] });
    number.push({
      tag: "span",
      attrs: valueAttrs,
      children: [formatCounter(value, decimals, separator)],
    });
    if (suffix)
      number.push({ tag: "span", attrs: { class: "emvb-counter-suffix" }, children: [suffix] });
    const children: VNode[] = [
      { tag: "p", attrs: { class: "emvb-counter-number" }, children: number },
    ];
    if (title?.trim())
      children.push({ tag: "p", attrs: { class: "emvb-counter-title" }, children: [title] });
    return { tag: "div", attrs, children };
  },
};

/** A number with at most two decimals, as people write it. */
const short = (value: number) => String(Math.round(value * 100) / 100);

/** W-1039: how far a Progress bar is filled, from 0 to 100. */
function progressPercent(props: ProgressNode["props"]): number {
  const max = props.max ?? 100;
  return Math.min(100, Math.max(0, (props.value / max) * 100));
}

export const progress: ElementDefinition<ProgressNode> = {
  baseCss:
    ".emvb-progress-head{display:flex;justify-content:space-between;gap:1em;margin:0 0 0.375em}.emvb-progress-svg{display:block;width:100%;overflow:visible}[dir=rtl] .emvb-progress-svg,.emvb-progress[dir=rtl] .emvb-progress-svg{transform:scaleX(-1)}@keyframes emvb-progress-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}@media (prefers-reduced-motion:no-preference){@supports (animation-timeline:view()){.emvb-progress-grow .emvb-progress-fill{transform-box:fill-box;transform-origin:left center;animation:emvb-progress-grow linear both;animation-timeline:view();animation-range:entry 10% cover 40%}}}",
  defaults: () => ({
    type: "progress",
    props: { value: 75, label: "Design", showValue: true },
  }),
  descriptor: {
    type: "progress",
    name: "Progress bar",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "label", kind: "text", label: "Title", optional: true },
      {
        key: "value",
        kind: "decimal",
        label: "Value",
        max: MAX_PROGRESS,
        maxProp: "max",
        message: "Enter a number from 0 up to the maximum, such as 75.",
      },
      {
        key: "max",
        kind: "decimal",
        label: "Maximum",
        optional: true,
        min: 0.01,
        max: MAX_PROGRESS,
        message: "Enter a number above 0, such as 100.",
      },
      { key: "showValue", kind: "boolean", label: "Show the percentage", optional: true },
      {
        key: "kind",
        kind: "select",
        label: "Meaning",
        optional: true,
        options: [
          { value: "meter", label: "A measurement, such as a skill" },
          { value: "progressbar", label: "How far a task has got" },
        ],
      },
      { key: "thickness", kind: "int", label: "Bar height (px)", optional: true, min: 2, max: 48 },
      { key: "grow", kind: "boolean", label: "Grow in when scrolled into view", optional: true },
    ],
  },
  build: (node, attrs) => {
    const { value, label, showValue, kind, thickness, grow } = node.props;
    const max = node.props.max ?? 100;
    const percent = progressPercent(node.props);
    const shown = `${Math.round(percent)}%`;
    const height = thickness ?? 8;
    const radius = String(height / 2);
    const children: VNode[] = [];
    const title = label?.trim();
    if (title || showValue) {
      const head: VNode[] = [];
      head.push({
        tag: "span",
        attrs: { class: "emvb-progress-label" },
        children: title ? [title] : [],
      });
      if (showValue)
        head.push({
          tag: "span",
          attrs: { class: "emvb-progress-value", "aria-hidden": "true" },
          children: [shown],
        });
      children.push({ tag: "div", attrs: { class: "emvb-progress-head" }, children: head });
    }
    const rect = (className: string, width: string, extra: Record<string, string>): VNode => ({
      tag: "rect",
      attrs: {
        class: className,
        width,
        height: "100%",
        rx: radius,
        fill: "currentColor",
        ...extra,
      },
      children: [],
    });
    children.push({
      tag: "div",
      attrs: {
        class: "emvb-progress-bar",
        role: kind ?? "meter",
        ...(title ? { "aria-label": title } : {}),
        "aria-valuemin": "0",
        "aria-valuemax": short(max),
        "aria-valuenow": short(Math.min(value, max)),
        "aria-valuetext": shown,
      },
      children: [
        {
          tag: "svg",
          attrs: {
            xmlns: "http://www.w3.org/2000/svg",
            class: "emvb-progress-svg",
            width: "100%",
            height: String(height),
            "aria-hidden": "true",
            focusable: "false",
          },
          children: [
            rect("emvb-progress-track", "100%", { "fill-opacity": "0.2" }),
            ...(percent > 0 ? [rect("emvb-progress-fill", `${short(percent)}%`, {})] : []),
          ],
        },
      ],
    });
    return {
      tag: "div",
      attrs: grow
        ? { ...attrs, class: `${attrs["class"] ?? ""} emvb-progress-grow`.trim() }
        : attrs,
      children,
    };
  },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * W-1040: a Countdown's target as people read it, in the time zone it was written in:
 * "1 Dec 2026, 09:00 UTC−5". The page doesn't know the visitor's zone, so it names its own.
 */
function countdownDate(target: string): string {
  const m = COUNTDOWN_TARGET.exec(target);
  if (!m) return target;
  const [, year, month, day, hour, minute, , zone = "Z"] = m;
  let offset = "";
  if (zone !== "Z") {
    const [h = "00", min = "00"] = zone.slice(1).split(":");
    const hours = String(Number(h));
    offset = `${zone[0] === "-" ? "\u2212" : "+"}${hours}${min === "00" ? "" : `:${min}`}`;
    if (h === "00" && min === "00") offset = "";
  }
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}, ${hour}:${minute} UTC${offset}`;
}

const COUNTDOWN_UNITS = [
  ["days", "Days"],
  ["hours", "Hours"],
  ["minutes", "Minutes"],
  ["seconds", "Seconds"],
] as const;

export const countdown: ElementDefinition<CountdownNode> = {
  baseCss:
    ".emvb-countdown-title{margin:0 0 0.25em;font-weight:600}.emvb-countdown-target{margin:0}.emvb-countdown-clock{display:flex;flex-wrap:wrap;align-items:center;gap:0.75em;margin:0.5em 0 0}.emvb-countdown:not([data-emvb-ready]) .emvb-countdown-clock,.emvb-countdown-expired:not([data-emvb-shown]),.emvb-countdown[hidden],.emvb-countdown-clock[hidden]{display:none}.emvb-countdown-units{display:flex;gap:0.75em}.emvb-countdown-unit{display:flex;flex-direction:column;align-items:center;min-width:3.5em}.emvb-countdown-num{font-size:2em;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}.emvb-countdown-name{font-size:0.75em;text-transform:uppercase;letter-spacing:0.05em}.emvb-countdown-pause{padding:0.25em 0.75em;border:1px solid currentColor;border-radius:4px;background:none;color:inherit;font:inherit;cursor:pointer}.emvb-countdown-pause:focus-visible{outline:2px solid currentColor;outline-offset:2px}.emvb-countdown-expired{margin:0.5em 0 0}",
  defaults: () => ({
    type: "countdown",
    props: { target: "2027-01-01T00:00Z", title: "Offer ends soon", ticking: true },
  }),
  descriptor: {
    type: "countdown",
    name: "Countdown",
    group: "content",
    defaultTab: "content",
    fields: [
      {
        key: "target",
        kind: "text",
        label: "Ends at",
        message: "Date, time and UTC offset, such as 2026-12-01T09:00-05:00 (or Z for UTC).",
      },
      { key: "title", kind: "text", label: "Title", optional: true },
      {
        key: "label",
        kind: "text",
        label: "Words before the date",
        optional: true,
        message: "Leave it empty for Ends.",
      },
      { key: "ticking", kind: "boolean", label: "Show a live countdown", optional: true },
      { key: "hideSeconds", kind: "boolean", label: "Hide seconds", optional: true },
      {
        key: "expired",
        kind: "select",
        label: "When time is up",
        optional: true,
        options: [
          { value: "text", label: "Show the ended text" },
          { value: "hide", label: "Hide the countdown" },
          { value: "link", label: "Show the ended text as a link" },
        ],
      },
      {
        key: "expiredText",
        kind: "text",
        label: "Ended text",
        optional: true,
        message:
          "Shown by the live countdown once time is up. Leave it empty for This offer has ended.",
      },
      {
        key: "expiredHref",
        kind: "href",
        label: "Ended link",
        optional: true,
        message: "Use a full URL such as https://example.com or a path such as /offers.",
      },
    ],
  },
  build: (node, attrs) => {
    const { target, title, label, ticking, hideSeconds, expired, expiredText, expiredHref } =
      node.props;
    const children: VNode[] = [];
    if (title?.trim())
      children.push({ tag: "p", attrs: { class: "emvb-countdown-title" }, children: [title] });
    children.push({
      tag: "p",
      attrs: { class: "emvb-countdown-target" },
      children: [
        `${label?.trim() || "Ends"} `,
        { tag: "time", attrs: { datetime: target }, children: [countdownDate(target)] },
      ],
    });
    if (!ticking) return { tag: "div", attrs, children };
    const units = COUNTDOWN_UNITS.filter(([unit]) => !(hideSeconds && unit === "seconds"));
    children.push({
      tag: "div",
      attrs: { class: "emvb-countdown-clock" },
      children: [
        {
          tag: "div",
          attrs: { class: "emvb-countdown-units", "aria-hidden": "true" },
          children: units.map(([unit, name]): VNode => ({
            tag: "span",
            attrs: { class: "emvb-countdown-unit" },
            children: [
              {
                tag: "span",
                attrs: { class: "emvb-countdown-num", "data-unit": unit },
                children: ["00"],
              },
              { tag: "span", attrs: { class: "emvb-countdown-name" }, children: [name] },
            ],
          })),
        },
        {
          tag: "button",
          attrs: { type: "button", class: "emvb-countdown-pause", "aria-pressed": "false" },
          children: ["Pause"],
        },
      ],
    });
    const action = expired ?? "text";
    if (action !== "hide") {
      const words = expiredText?.trim() || "This offer has ended.";
      const href = action === "link" && expiredHref ? sanitizeHref(expiredHref) : undefined;
      children.push({
        tag: "p",
        attrs: { class: "emvb-countdown-expired" },
        children: [href ? { tag: "a", attrs: { href }, children: [words] } : words],
      });
    }
    return {
      tag: "div",
      attrs: {
        ...attrs,
        "data-emvb-countdown": "",
        "data-target": target,
        "data-expired": action,
      },
      children,
    };
  },
};

const MAP_NAMES = { osm: "OpenStreetMap", google: "Google Maps" } as const;

/** A coordinate with at most 6 decimals (about 10 cm). */
const coord = (value: number) => String(Math.round(value * 1e6) / 1e6);

/** W-1041: where a Map's link goes and what its embed loads (undefined: it can't be embedded). */
function mapUrls(props: MapNode["props"]): { link: string; embed?: string } {
  const { address, lat, lng } = props;
  const zoom = props.zoom ?? 15;
  const at = lat !== undefined && lng !== undefined ? [coord(lat), coord(lng)] : undefined;
  const query = encodeURIComponent(address.trim());
  if ((props.provider ?? "osm") === "google") {
    const q = at ? `${at[0]},${at[1]}` : query;
    return {
      link: `https://www.google.com/maps/search/?api=1&query=${q}`,
      embed: `https://www.google.com/maps?q=${q}&z=${zoom}&output=embed`,
    };
  }
  if (!at) return { link: `https://www.openstreetmap.org/search?query=${query}` };
  const [la, lo] = at;
  // A box around the place, about as wide as the zoom level shows.
  const span = 360 / 2 ** zoom;
  const box = [
    Number(lo) - span,
    Number(la) - span / 2,
    Number(lo) + span,
    Number(la) + span / 2,
  ].map(coord);
  return {
    link: `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=${zoom}/${la}/${lo}`,
    embed: `https://www.openstreetmap.org/export/embed.html?bbox=${box.join("%2C")}&layer=mapnik&marker=${la}%2C${lo}`,
  };
}

export const map: ElementDefinition<MapNode> = {
  baseCss:
    ".emvb-map-address{margin:0 0 0.25em;white-space:pre-line}.emvb-map-frame{margin:0.75em 0 0}.emvb-map:not([data-emvb-ready]) .emvb-map-frame{display:none}.emvb-map-load{padding:0.5em 1em;border:1px solid currentColor;border-radius:4px;background:none;color:inherit;font:inherit;cursor:pointer}.emvb-map-load:focus-visible{outline:2px solid currentColor;outline-offset:2px}.emvb-map-note{margin:0.25em 0 0;font-size:0.875em}.emvb-map iframe{display:block;width:100%;border:0}",
  defaults: () => ({
    type: "map",
    props: { address: "Tour Eiffel, Paris", lat: 48.8584, lng: 2.2945 },
  }),
  descriptor: {
    type: "map",
    name: "Map",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "address", kind: "textarea", label: "Address" },
      {
        key: "provider",
        kind: "select",
        label: "Map service",
        optional: true,
        options: [
          { value: "osm", label: "OpenStreetMap" },
          { value: "google", label: "Google Maps" },
        ],
      },
      {
        key: "lat",
        kind: "decimal",
        label: "Latitude",
        optional: true,
        min: -90,
        max: 90,
        message: "From -90 to 90, such as 48.8584.",
      },
      {
        key: "lng",
        kind: "decimal",
        label: "Longitude",
        optional: true,
        min: -180,
        max: 180,
        message: "From -180 to 180, such as 2.2945.",
      },
      { key: "zoom", kind: "int", label: "Zoom", optional: true, min: 1, max: 19 },
      { key: "linkText", kind: "text", label: "Link text", optional: true },
      {
        key: "embed",
        kind: "boolean",
        label: "Visitors can load the map on the page",
        optional: true,
      },
      { key: "height", kind: "int", label: "Map height (px)", optional: true, min: 150, max: 800 },
    ],
  },
  build: (node, attrs) => {
    const { address, provider, linkText, embed, height } = node.props;
    const service = MAP_NAMES[provider ?? "osm"];
    const urls = mapUrls(node.props);
    const children: VNode[] = [
      { tag: "p", attrs: { class: "emvb-map-address" }, children: [address] },
      {
        tag: "a",
        attrs: { class: "emvb-map-link", href: urls.link, rel: "noopener" },
        children: [linkText?.trim() || `Open in ${service}`],
      },
    ];
    if (!embed || !urls.embed) return { tag: "div", attrs, children };
    children.push({
      tag: "div",
      attrs: {
        class: "emvb-map-frame",
        "data-src": urls.embed,
        "data-title": `Map of ${address.split("\n")[0]?.trim() ?? address}`,
        "data-height": String(height ?? 360),
      },
      children: [
        {
          tag: "button",
          attrs: { type: "button", class: "emvb-map-load" },
          children: ["Show the map"],
        },
        {
          tag: "p",
          attrs: { class: "emvb-map-note" },
          children: [`Loads a map from ${service}.`],
        },
      ],
    });
    return { tag: "div", attrs: { ...attrs, "data-emvb-map": "" }, children };
  },
};

/** A small stroke icon on a 24 × 24 grid, hidden from screen readers. */
const mark = (className: string, d: string): VNode => ({
  tag: "svg",
  attrs: {
    xmlns: "http://www.w3.org/2000/svg",
    class: className,
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2.5",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
  },
  children: [{ tag: "path", attrs: { d }, children: [] }],
});

/** Words screen readers hear that the eye doesn't need. */
const srText = (className: string, text: string): VNode => ({
  tag: "span",
  attrs: { class: className },
  children: [text],
});

/** W-1042: a link the visitor can follow: sanitised, opening a new tab safely when asked. */
function linkAttrs(href: string | undefined, newTab?: boolean): Record<string, string> | undefined {
  const safe = href ? sanitizeHref(href) : undefined;
  if (!safe) return undefined;
  return newTab ? { href: safe, target: "_blank", rel: "noopener noreferrer" } : { href: safe };
}

export const priceTable: ElementDefinition<PriceTableNode> = {
  baseCss: `.emvb-price-table{position:relative;display:flex;flex-direction:column;gap:0.75em;padding:1.5em;border:1px solid rgb(0 0 0 / 0.15);border-radius:8px}.emvb-price-table-featured{border-width:2px;border-color:currentColor}.emvb-price-table-ribbon{position:absolute;top:0;right:1.5em;transform:translateY(-50%);margin:0;padding:0.125em 0.75em;border-radius:999px;background:#1f2937;color:#fff;font-size:0.75em;font-weight:600;text-transform:uppercase;letter-spacing:0.05em}.emvb-price-table-title{margin:0}.emvb-price-table-desc{margin:0}.emvb-price-table-price{display:flex;flex-wrap:wrap;align-items:baseline;gap:0.25em 0.5em;margin:0}.emvb-price-table-amount{font-size:2.5em;font-weight:700;line-height:1}.emvb-price-table-currency{font-size:0.5em;vertical-align:super}.emvb-price-table-regular{opacity:0.7}.emvb-price-table-features{display:flex;flex-direction:column;gap:0.5em;margin:0;padding:0;list-style:none}.emvb-price-table-features li{display:flex;gap:0.5em;align-items:baseline}.emvb-price-table-features svg{flex:none;align-self:center}.emvb-price-table-no{opacity:0.6}.emvb-price-table-no .emvb-price-table-text{text-decoration:line-through}.emvb-price-table-button{display:inline-flex;align-items:center;justify-content:center;margin-top:auto;padding:0.625em 1.25em;border:1px solid currentColor;border-radius:6px;color:inherit;font:inherit;text-decoration:none;text-align:center}.emvb-price-table-button:focus-visible{outline:2px solid currentColor;outline-offset:2px}.emvb-price-table-sr{${SR_ONLY}}`,
  defaults: () => ({
    type: "price-table",
    props: {
      title: "Pro",
      description: "For growing teams.",
      price: "29",
      currency: "$",
      period: "per month",
      features: ["Unlimited pages", "Priority support"],
      excluded: ["Custom domain"],
      buttonText: "Choose Pro",
      buttonHref: "/signup",
      featured: true,
    },
  }),
  descriptor: {
    type: "price-table",
    name: "Price table",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "title", kind: "text", label: "Title" },
      {
        key: "titleLevel",
        kind: "select",
        label: "Title level",
        optional: true,
        options: [2, 3, 4, 5, 6].map((level) => ({ value: level, label: `H${level}` })),
      },
      { key: "description", kind: "textarea", label: "Description", optional: true },
      { key: "currency", kind: "text", label: "Currency", optional: true },
      { key: "price", kind: "text", label: "Price", message: "Such as 29, 29.99 or Free." },
      {
        key: "period",
        kind: "text",
        label: "Period",
        optional: true,
        message: "Such as per month.",
      },
      {
        key: "regularPrice",
        kind: "text",
        label: "Regular price (on sale)",
        optional: true,
        message: "Shown struck through before the price.",
      },
      { key: "features", kind: "list-items", label: "Included", optional: true },
      { key: "excluded", kind: "list-items", label: "Not included", optional: true },
      { key: "buttonText", kind: "text", label: "Button text", optional: true },
      {
        key: "buttonHref",
        kind: "href",
        label: "Button link",
        optional: true,
        message: "Use a full URL such as https://example.com or a path such as /signup.",
      },
      { key: "newTab", kind: "boolean", label: "Open in a new tab", optional: true },
      { key: "featured", kind: "boolean", label: "Featured", optional: true },
      { key: "ribbon", kind: "text", label: "Ribbon text", optional: true },
    ],
  },
  build: (node, attrs) => {
    const p = node.props;
    const children: VNode[] = [];
    if (p.featured)
      children.push({
        tag: "p",
        attrs: { class: "emvb-price-table-ribbon" },
        children: [p.ribbon?.trim() || "Featured"],
      });
    children.push({
      tag: `h${p.titleLevel ?? 3}`,
      attrs: { class: "emvb-price-table-title" },
      children: [p.title],
    });
    if (p.description?.trim())
      children.push({
        tag: "p",
        attrs: { class: "emvb-price-table-desc" },
        children: [p.description],
      });
    const currency = p.currency?.trim();
    const regular = p.regularPrice?.trim();
    const price: VNode[] = [];
    if (regular)
      price.push({
        tag: "s",
        attrs: { class: "emvb-price-table-regular" },
        children: [srText("emvb-price-table-sr", "Regular price: "), `${currency ?? ""}${regular}`],
      });
    price.push({
      tag: "span",
      attrs: { class: "emvb-price-table-amount" },
      children: [
        ...(regular ? [srText("emvb-price-table-sr", "Sale price: ")] : []),
        ...(currency
          ? [{ tag: "span", attrs: { class: "emvb-price-table-currency" }, children: [currency] }]
          : []),
        p.price,
      ],
    });
    if (p.period?.trim())
      price.push({
        tag: "span",
        attrs: { class: "emvb-price-table-period" },
        children: [p.period],
      });
    children.push({ tag: "p", attrs: { class: "emvb-price-table-price" }, children: price });
    const items: VNode[] = [];
    for (const feature of p.features ?? []) {
      if (!feature.trim()) continue;
      items.push({
        tag: "li",
        attrs: { class: "emvb-price-table-yes" },
        children: [
          mark("emvb-price-table-check", "M20 6 9 17l-5-5"),
          { tag: "span", attrs: { class: "emvb-price-table-text" }, children: [feature] },
        ],
      });
    }
    for (const feature of p.excluded ?? []) {
      if (!feature.trim()) continue;
      items.push({
        tag: "li",
        attrs: { class: "emvb-price-table-no" },
        children: [
          mark("emvb-price-table-cross", "M18 6 6 18M6 6l12 12"),
          srText("emvb-price-table-sr", "Not included: "),
          { tag: "span", attrs: { class: "emvb-price-table-text" }, children: [feature] },
        ],
      });
    }
    if (items.length > 0)
      children.push({ tag: "ul", attrs: { class: "emvb-price-table-features" }, children: items });
    const link = linkAttrs(p.buttonHref, p.newTab);
    if (p.buttonText?.trim() && link)
      children.push({
        tag: "a",
        attrs: { class: "emvb-price-table-button", ...link },
        children: [p.buttonText],
      });
    return {
      tag: "div",
      attrs: p.featured
        ? { ...attrs, class: `${attrs["class"] ?? ""} emvb-price-table-featured`.trim() }
        : attrs,
      children,
    };
  },
};

export const priceList: ElementDefinition<PriceListNode> = {
  baseCss:
    ".emvb-price-list{display:flex;flex-direction:column;gap:1em;margin:0;padding:0;list-style:none}.emvb-price-list-item{display:flex;gap:1em;align-items:flex-start}.emvb-price-list-image{flex:none;width:4em;height:4em;object-fit:cover;border-radius:6px}.emvb-price-list-body{flex:1;min-width:0}.emvb-price-list-head{display:flex;align-items:baseline;gap:0.5em;margin:0;font-weight:600}.emvb-price-list-title a{color:inherit}.emvb-price-list-leader{flex:1;min-width:1em;border-bottom:2px dotted currentColor;opacity:0.5}.emvb-price-list-price{flex:none}.emvb-price-list-desc{margin:0.25em 0 0;opacity:0.8}",
  defaults: () => ({ type: "price-list", props: {}, children: [] }),
  descriptor: {
    type: "price-list",
    name: "Price list",
    group: "content",
    defaultTab: "content",
    fields: [
      {
        key: "label",
        kind: "text",
        label: "List name",
        optional: true,
        message: "What screen readers call the list, such as Drinks. Leave it empty for none.",
      },
    ],
  },
  build: (node, attrs, children) => ({
    tag: "ul",
    attrs: node.props.label?.trim() ? { ...attrs, "aria-label": node.props.label } : attrs,
    children,
  }),
};

export const priceListItem: ElementDefinition<PriceListItemNode> = {
  baseCss: "",
  defaults: () => ({
    type: "price-list-item",
    props: { title: "Item", price: "$10" },
  }),
  descriptor: {
    type: "price-list-item",
    name: "Price list item",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "title", kind: "text", label: "Title" },
      { key: "price", kind: "text", label: "Price", message: "Such as $12 or 12 €." },
      { key: "description", kind: "textarea", label: "Description", optional: true },
      { key: "src", kind: "media", label: "Picture", optional: true },
      {
        key: "alt",
        kind: "text",
        label: "Alt text",
        optional: true,
        message: "Leave it empty when the picture only decorates the row.",
      },
      {
        key: "href",
        kind: "href",
        label: "Link",
        optional: true,
        message: "Use a full URL such as https://example.com or a path such as /menu.",
      },
      { key: "newTab", kind: "boolean", label: "Open in a new tab", optional: true },
    ],
  },
  build: (node, attrs) => {
    const p = node.props;
    const src = p.src?.trim() ? sanitizeMediaUrl(p.src.trim()) : undefined;
    const link = linkAttrs(p.href, p.newTab);
    const children: VNode[] = [];
    if (src)
      children.push({
        tag: "img",
        attrs: {
          class: "emvb-price-list-image",
          src,
          alt: p.alt?.trim() ?? "",
          ...(p.width ? { width: String(p.width) } : {}),
          ...(p.height ? { height: String(p.height) } : {}),
          loading: "lazy",
          decoding: "async",
        },
        children: [],
      });
    const body: VNode[] = [
      {
        tag: "p",
        attrs: { class: "emvb-price-list-head" },
        children: [
          {
            tag: "span",
            attrs: { class: "emvb-price-list-title" },
            children: [link ? { tag: "a", attrs: link, children: [p.title] } : p.title],
          },
          {
            tag: "span",
            attrs: { class: "emvb-price-list-leader", "aria-hidden": "true" },
            children: [],
          },
          { tag: "span", attrs: { class: "emvb-price-list-price" }, children: [p.price] },
        ],
      },
    ];
    if (p.description?.trim())
      body.push({ tag: "p", attrs: { class: "emvb-price-list-desc" }, children: [p.description] });
    children.push({ tag: "div", attrs: { class: "emvb-price-list-body" }, children: body });
    return { tag: "li", attrs, children };
  },
};

export const cta: ElementDefinition<CtaNode> = {
  baseCss:
    '.emvb-cta{position:relative;display:flex;flex-direction:column;gap:1em;overflow:hidden;border-radius:8px;min-width:0}.emvb-cta-left{flex-direction:row;align-items:center}.emvb-cta-right{flex-direction:row-reverse;align-items:center}.emvb-cta-media{flex:none;line-height:0}.emvb-cta-media img{display:block;width:100%;height:100%;object-fit:cover}.emvb-cta:is(.emvb-cta-left,.emvb-cta-right) .emvb-cta-media{flex-basis:40%;max-width:40%;align-self:stretch}.emvb-cta-body{position:relative;flex:1;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:0.75em;padding:1.5em}.emvb-cta-behind{justify-content:center;min-height:16em;color:#fff}.emvb-cta-behind .emvb-cta-media{position:absolute;inset:0}.emvb-cta-behind .emvb-cta-media::after{content:"";position:absolute;inset:0;background:rgb(0 0 0 / 0.55)}.emvb-cta-title{margin:0;font-size:1.5em}.emvb-cta-text{margin:0;white-space:pre-line}.emvb-cta-link{color:inherit;text-decoration:none}.emvb-cta-link::after{content:"";position:absolute;inset:0;z-index:1}.emvb-cta-linked .emvb-cta-body{position:static}.emvb-cta-linked:has(.emvb-cta-link:focus-visible){outline:2px solid currentColor;outline-offset:4px}.emvb-cta-link:focus-visible{outline:none}.emvb-cta-button{display:inline-flex;padding:0.625em 1.25em;border:1px solid currentColor;border-radius:6px}.emvb-cta-ribbon{position:absolute;top:0.75em;right:0.75em;z-index:2;margin:0;padding:0.125em 0.75em;border-radius:999px;background:#1f2937;color:#fff;font-size:0.75em;font-weight:600;text-transform:uppercase;letter-spacing:0.05em}',
  defaults: () => ({
    type: "cta",
    props: {
      title: "Ready to start?",
      text: "Create your first page in minutes.",
      buttonText: "Get started",
      href: "/signup",
      layout: "top",
    },
  }),
  descriptor: {
    type: "cta",
    name: "Call to action",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "title", kind: "text", label: "Title" },
      {
        key: "titleLevel",
        kind: "select",
        label: "Title level",
        optional: true,
        options: [2, 3, 4, 5, 6].map((level) => ({ value: level, label: `H${level}` })),
      },
      { key: "text", kind: "textarea", label: "Text", optional: true },
      { key: "src", kind: "media", label: "Picture", optional: true },
      {
        key: "alt",
        kind: "text",
        label: "Alt text",
        optional: true,
        message: "Leave it empty when the picture only sets the mood.",
      },
      {
        key: "layout",
        kind: "select",
        label: "Picture",
        optional: true,
        options: [
          { value: "behind", label: "Behind the text" },
          { value: "top", label: "Above" },
          { value: "left", label: "Before" },
          { value: "right", label: "After" },
        ],
      },
      { key: "buttonText", kind: "text", label: "Button text", optional: true },
      {
        key: "href",
        kind: "href",
        label: "Link",
        optional: true,
        message: "The whole box opens it. Use a full URL or a path such as /signup.",
      },
      { key: "newTab", kind: "boolean", label: "Open in a new tab", optional: true },
      { key: "ribbon", kind: "text", label: "Ribbon text", optional: true },
    ],
  },
  build: (node, attrs) => {
    const p = node.props;
    const layout = p.layout ?? "behind";
    const src = p.src?.trim() ? sanitizeMediaUrl(p.src.trim()) : undefined;
    const link = linkAttrs(p.href, p.newTab);
    const children: VNode[] = [];
    if (p.ribbon?.trim())
      children.push({ tag: "p", attrs: { class: "emvb-cta-ribbon" }, children: [p.ribbon] });
    if (src)
      children.push({
        tag: "div",
        attrs: { class: "emvb-cta-media" },
        children: [
          {
            tag: "img",
            attrs: {
              src,
              alt: p.alt?.trim() ?? "",
              ...(p.width ? { width: String(p.width) } : {}),
              ...(p.height ? { height: String(p.height) } : {}),
              loading: "lazy",
              decoding: "async",
            },
            children: [],
          },
        ],
      });
    const body: VNode[] = [
      {
        tag: `h${p.titleLevel ?? 3}`,
        attrs: { class: "emvb-cta-title" },
        children: [
          link
            ? { tag: "a", attrs: { class: "emvb-cta-link", ...link }, children: [p.title] }
            : p.title,
        ],
      },
    ];
    if (p.text?.trim())
      body.push({ tag: "p", attrs: { class: "emvb-cta-text" }, children: [p.text] });
    // The title is the link; the button shows where the box leads, for the eye only.
    if (link && p.buttonText?.trim())
      body.push({
        tag: "span",
        attrs: { class: "emvb-cta-button", "aria-hidden": "true" },
        children: [p.buttonText],
      });
    children.push({ tag: "div", attrs: { class: "emvb-cta-body" }, children: body });
    const classes = [attrs["class"] ?? "", `emvb-cta-${src ? layout : "top"}`];
    if (link) classes.push("emvb-cta-linked");
    return { tag: "div", attrs: { ...attrs, class: classes.join(" ").trim() }, children };
  },
};

const FLIP_TURNS = {
  left: "rotateY(-180deg)",
  right: "rotateY(180deg)",
  up: "rotateX(180deg)",
  down: "rotateX(-180deg)",
} as const;

export const flipBox: ElementDefinition<FlipBoxNode> = {
  baseCss:
    ":where(.emvb-flip-box){color:#fff;border-radius:8px}.emvb-flip-box{position:relative;perspective:1200px}.emvb-flip-inner{display:grid;transition:transform 0.6s ease;transform-style:preserve-3d}.emvb-flip-face{grid-area:1/1;display:flex;flex-direction:column;justify-content:center;gap:0.75em;min-height:16em;padding:1.5em 1.5em 3em;border-radius:inherit;background:#1f2937;color:inherit;backface-visibility:hidden;-webkit-backface-visibility:hidden}.emvb-flip-back{background:#374151}.emvb-flip-title{margin:0;font-size:1.25em}.emvb-flip-text{margin:0;white-space:pre-line}.emvb-flip-button{align-self:flex-start;padding:0.625em 1.25em;border:1px solid currentColor;border-radius:6px;color:inherit;text-decoration:none}.emvb-flip-button:focus-visible{outline:2px solid currentColor;outline-offset:2px}.emvb-flip-toggle{position:absolute;right:0.75em;bottom:0.75em;z-index:1;display:inline-flex;gap:0.375em;align-items:center;font-size:0.875em;cursor:pointer}.emvb-flip-check{margin:0;accent-color:currentColor}.emvb-flip-check:focus-visible{outline:2px solid currentColor;outline-offset:2px}" +
    (Object.keys(FLIP_TURNS) as (keyof typeof FLIP_TURNS)[])
      .map((dir) => {
        const turn = FLIP_TURNS[dir];
        const on = `.emvb-flip-${dir}:has(.emvb-flip-check:checked) .emvb-flip-inner,.emvb-flip-${dir}:has(.emvb-flip-back :focus-visible) .emvb-flip-inner`;
        return `.emvb-flip-${dir} .emvb-flip-back{transform:${turn}}${on}{transform:${turn}}@media (hover:hover){.emvb-flip-${dir}:hover .emvb-flip-inner{transform:${turn}}}`;
      })
      .join("") +
    "@media (prefers-reduced-motion:reduce){.emvb-flip-inner{transition:none}}",
  defaults: () => ({
    type: "flip-box",
    props: {
      frontTitle: "Hover or tap to learn more",
      frontText: "A short teaser on the front.",
      backTitle: "Here is the detail",
      backText: "The back says more and can link somewhere.",
      buttonText: "Read more",
      href: "/about",
    },
  }),
  descriptor: {
    type: "flip-box",
    name: "Flip box",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "frontTitle", kind: "text", label: "Front title" },
      { key: "frontText", kind: "textarea", label: "Front text", optional: true },
      { key: "backTitle", kind: "text", label: "Back title", optional: true },
      { key: "backText", kind: "textarea", label: "Back text", optional: true },
      {
        key: "titleLevel",
        kind: "select",
        label: "Title level",
        optional: true,
        options: [2, 3, 4, 5, 6].map((level) => ({ value: level, label: `H${level}` })),
      },
      { key: "buttonText", kind: "text", label: "Button text", optional: true },
      {
        key: "href",
        kind: "href",
        label: "Button link",
        optional: true,
        message: "Use a full URL such as https://example.com or a path such as /about.",
      },
      { key: "newTab", kind: "boolean", label: "Open in a new tab", optional: true },
      {
        key: "direction",
        kind: "select",
        label: "Turns",
        optional: true,
        options: [
          { value: "right", label: "Right" },
          { value: "left", label: "Left" },
          { value: "up", label: "Up" },
          { value: "down", label: "Down" },
        ],
      },
      {
        key: "toggleLabel",
        kind: "text",
        label: "Turn-over control text",
        optional: true,
        message: "The tick box that turns the card on touch screens. Leave it empty for Turn over.",
      },
    ],
  },
  build: (node, attrs) => {
    const p = node.props;
    const heading = `h${p.titleLevel ?? 3}`;
    const face = (
      side: "front" | "back",
      title?: string,
      text?: string,
      extra: VNode[] = [],
    ): VNode => {
      const children: VNode[] = [];
      if (title?.trim())
        children.push({ tag: heading, attrs: { class: "emvb-flip-title" }, children: [title] });
      if (text?.trim())
        children.push({ tag: "p", attrs: { class: "emvb-flip-text" }, children: [text] });
      return {
        tag: "div",
        attrs: { class: `emvb-flip-face emvb-flip-${side}` },
        children: [...children, ...extra],
      };
    };
    const link = linkAttrs(p.href, p.newTab);
    const button: VNode[] =
      link && p.buttonText?.trim()
        ? [{ tag: "a", attrs: { class: "emvb-flip-button", ...link }, children: [p.buttonText] }]
        : [];
    return {
      tag: "div",
      attrs: {
        ...attrs,
        class: `${attrs["class"] ?? ""} emvb-flip-${p.direction ?? "right"}`.trim(),
      },
      children: [
        {
          tag: "div",
          attrs: { class: "emvb-flip-inner" },
          children: [
            face("front", p.frontTitle, p.frontText),
            face("back", p.backTitle, p.backText, button),
          ],
        },
        {
          tag: "label",
          attrs: { class: "emvb-flip-toggle" },
          children: [
            { tag: "input", attrs: { type: "checkbox", class: "emvb-flip-check" }, children: [] },
            { tag: "span", attrs: {}, children: [p.toggleLabel?.trim() || "Turn over"] },
          ],
        },
      ],
    };
  },
};

/** The circle drawn around a highlighted word, on a 100 × 40 grid stretched to the word. */
const HEADLINE_CIRCLE = "M50 3C20 2 3 10 3 20s20 18 48 17 47-8 46-17S78 3 46 4";

export const headline: ElementDefinition<HeadlineNode> = {
  baseCss: `.emvb-headline{margin:0}.emvb-headline-mark{position:relative;display:inline-block;white-space:nowrap}.emvb-headline-underline .emvb-headline-mark{background:linear-gradient(var(--emvb-headline-mark,#f59e0b),var(--emvb-headline-mark,#f59e0b)) no-repeat 0 92%/100% 0.12em}.emvb-headline-strike .emvb-headline-mark{background:linear-gradient(var(--emvb-headline-mark,#f59e0b),var(--emvb-headline-mark,#f59e0b)) no-repeat 0 55%/100% 0.1em}.emvb-headline-shape{position:absolute;left:-0.25em;top:-0.15em;width:calc(100% + 0.5em);height:calc(100% + 0.3em);overflow:visible;pointer-events:none;color:var(--emvb-headline-mark,#f59e0b)}.emvb-headline-shape path{stroke-dasharray:300;stroke-dashoffset:0}.emvb-headline-pause{margin:0.5em 0 0;padding:0.25em 0.75em;border:1px solid currentColor;border-radius:4px;background:none;color:inherit;font:inherit;font-size:0.875em;cursor:pointer}.emvb-headline-pause:focus-visible{outline:2px solid currentColor;outline-offset:2px}.emvb-headline-sr{${SR_ONLY}}@keyframes emvb-headline-line{from{background-size:0 0.12em}}@keyframes emvb-headline-strike{from{background-size:0 0.1em}}@keyframes emvb-headline-circle{from{stroke-dashoffset:300}}@media (prefers-reduced-motion:no-preference){.emvb-headline-underline .emvb-headline-mark{animation:emvb-headline-line 0.8s ease-out 0.3s both}.emvb-headline-strike .emvb-headline-mark{animation:emvb-headline-strike 0.8s ease-out 0.3s both}.emvb-headline-shape path{animation:emvb-headline-circle 1s ease-out 0.3s both}}`,
  defaults: () => ({
    type: "headline",
    props: {
      level: 2,
      before: "We build",
      highlight: "fast",
      after: "websites",
      rotate: ["accessible", "beautiful"],
    },
  }),
  descriptor: {
    type: "headline",
    name: "Animated headline",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "before", kind: "text", label: "Before", optional: true },
      { key: "highlight", kind: "text", label: "Highlighted words" },
      { key: "after", kind: "text", label: "After", optional: true },
      {
        key: "level",
        kind: "select",
        label: "Level",
        optional: true,
        options: [1, 2, 3, 4, 5, 6].map((level) => ({ value: level, label: `H${level}` })),
      },
      {
        key: "mark",
        kind: "select",
        label: "Mark",
        optional: true,
        options: [
          { value: "underline", label: "Underline" },
          { value: "circle", label: "Circle" },
          { value: "strike", label: "Strike through" },
          { value: "none", label: "None" },
        ],
      },
      {
        key: "rotate",
        kind: "list-items",
        label: "Other words",
        optional: true,
        message: "One per line. They take turns with the highlighted words.",
      },
      { key: "rotating", kind: "boolean", label: "Rotate the words", optional: true },
      {
        key: "interval",
        kind: "decimal",
        label: "Seconds per word",
        optional: true,
        min: 1.5,
        max: 10,
        message: "From 1.5 to 10 seconds.",
      },
      {
        key: "turns",
        kind: "int",
        label: "Rounds before it stops",
        optional: true,
        min: 1,
        max: 5,
      },
    ],
  },
  build: (node, attrs) => {
    const p = node.props;
    const style = p.mark ?? "underline";
    const words = (p.rotate ?? []).map((w) => w.trim()).filter(Boolean);
    const rotating = Boolean(p.rotating) && words.length > 0;
    const markChildren: (VNode | string)[] = [p.highlight];
    if (style === "circle")
      markChildren.push({
        tag: "svg",
        attrs: {
          xmlns: "http://www.w3.org/2000/svg",
          class: "emvb-headline-shape",
          viewBox: "0 0 100 40",
          preserveAspectRatio: "none",
          fill: "none",
          stroke: "currentColor",
          "stroke-width": "2.5",
          "stroke-linecap": "round",
          "aria-hidden": "true",
          focusable: "false",
        },
        children: [{ tag: "path", attrs: { d: HEADLINE_CIRCLE }, children: [] }],
      });
    const markAttrs: Record<string, string> = { class: "emvb-headline-mark" };
    if (rotating) {
      markAttrs["data-emvb-rotate"] = JSON.stringify([p.highlight, ...words]);
      markAttrs["data-interval"] = String(p.interval ?? 2.5);
      markAttrs["data-turns"] = String(p.turns ?? 2);
    }
    const children: (VNode | string)[] = [];
    if (p.before?.trim()) children.push(`${p.before.trim()} `);
    children.push({ tag: "span", attrs: markAttrs, children: markChildren });
    if (p.after?.trim()) children.push(` ${p.after.trim()}`);
    // The runtime adds its Pause button after the heading, so the heading reads as one sentence.
    return {
      tag: `h${p.level ?? 2}`,
      attrs: { ...attrs, class: `${attrs["class"] ?? ""} emvb-headline-${style}`.trim() },
      children,
    };
  },
};

type ShareNetwork = (typeof SHARE_NETWORKS)[number];

/** W-1047: each service's own share address for `url` (no tracking script, no API key). */
export function shareHref(network: ShareNetwork, url: string): string {
  const u = encodeURIComponent(url);
  switch (network) {
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case "x":
      return `https://x.com/intent/post?url=${u}`;
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
    case "whatsapp":
      return `https://wa.me/?text=${u}`;
    case "telegram":
      return `https://t.me/share/url?url=${u}`;
    case "reddit":
      return `https://www.reddit.com/submit?url=${u}`;
    case "bluesky":
      return `https://bsky.app/intent/compose?text=${u}`;
    case "threads":
      return `https://www.threads.net/intent/post?text=${u}`;
    case "email":
      return `mailto:?body=${u}`;
  }
}

/** What screen readers call a share link: "Share on X", "Share by email". */
const shareName = (network: ShareNetwork) =>
  network === "email" ? "Share by email" : `Share on ${SOCIAL_NAMES[network]}`;

export const shareButtons: ElementDefinition<ShareButtonsNode> = {
  baseCss:
    ".emvb-share-buttons{display:flex;flex-wrap:wrap;align-items:center;gap:0.5em;margin:0;padding:0;list-style:none;font-size:1.5em}.emvb-share-link{display:flex}.emvb-share-link>a,.emvb-share-native{display:inline-flex;align-items:center;justify-content:center;color:inherit;text-decoration:none}.emvb-share-buttons .emvb-social-svg{display:block;width:1em;height:1em}.emvb-share-brand.emvb-share-plain .emvb-share-link>a{color:var(--emvb-social,currentColor)}.emvb-share-buttons:not(.emvb-share-plain) .emvb-share-link>a{width:2em;height:2em;background:var(--emvb-social,currentColor)}.emvb-share-buttons:not(.emvb-share-plain) .emvb-social-svg{width:1.1em;height:1.1em;color:#fff}.emvb-share-circle .emvb-share-link>a{border-radius:50%}.emvb-share-rounded .emvb-share-link>a{border-radius:0.4em}.emvb-share-link>a:focus-visible,.emvb-share-native:focus-visible{outline:2px solid currentColor;outline-offset:2px}.emvb-share-native{gap:0.375em;padding:0.25em 0.75em;border:1px solid currentColor;border-radius:999px;background:none;font:inherit;font-size:0.6em;cursor:pointer}.emvb-share-buttons:not([data-emvb-ready]) .emvb-share-native-item{display:none}" +
    SHARE_NETWORKS.map(
      (network) =>
        `.emvb-share-brand .emvb-share-${network}{--emvb-social:${SOCIAL_COLORS[network]}}`,
    ).join(""),
  defaults: () => ({ type: "share-buttons", props: { shape: "circle" }, children: [] }),
  descriptor: {
    type: "share-buttons",
    name: "Share buttons",
    group: "content",
    defaultTab: "content",
    fields: [
      {
        key: "label",
        kind: "text",
        label: "List name",
        optional: true,
        message: "What screen readers call the list. Leave it empty for Share this page.",
      },
      {
        key: "shape",
        kind: "select",
        label: "Shape",
        optional: true,
        options: [
          { value: "plain", label: "Icon only" },
          { value: "circle", label: "Circle" },
          { value: "rounded", label: "Rounded square" },
          { value: "square", label: "Square" },
        ],
      },
      { key: "brandColors", kind: "boolean", label: "Brand colours", optional: true },
      {
        key: "nativeShare",
        kind: "boolean",
        label: "Add the device's Share button where it has one",
        optional: true,
      },
    ],
  },
  build: (node, attrs, children) => {
    const items: VNode[] = [...children];
    if (node.props.nativeShare)
      items.push({
        tag: "li",
        attrs: { class: "emvb-share-native-item" },
        children: [
          {
            tag: "button",
            attrs: { type: "button", class: "emvb-share-native", "data-emvb-share": "" },
            children: ["Share…"],
          },
        ],
      });
    const classes = [
      attrs["class"] ?? "",
      `emvb-share-${node.props.shape ?? "plain"}`,
      ...(node.props.brandColors ? ["emvb-share-brand"] : []),
    ];
    return {
      tag: "ul",
      attrs: {
        ...attrs,
        class: classes.join(" ").trim(),
        "aria-label": node.props.label?.trim() || "Share this page",
        ...(node.props.nativeShare ? { "data-emvb-share-list": "" } : {}),
      },
      children: items,
    };
  },
};

/** W-1047: a share link for `url`; the renderer passes the page's address. */
export function shareLinkVNode(
  node: ShareLinkNode,
  attrs: Record<string, string>,
  url: string,
): VNode {
  const { network, label } = node.props;
  const icon = socialSvg(network);
  const href = sanitizeHref(shareHref(network, url)) ?? "#";
  return {
    tag: "li",
    attrs: { ...attrs, class: `${attrs["class"] ?? ""} emvb-share-${network}`.trim() },
    children: [
      {
        tag: "a",
        attrs: {
          href,
          "aria-label": label?.trim() || shareName(network),
          ...(network === "email" ? {} : { target: "_blank", rel: "noopener noreferrer" }),
        },
        children: icon ? [icon] : [],
      },
    ],
  };
}

export const shareLink: ElementDefinition<ShareLinkNode> = {
  baseCss: "",
  defaults: () => ({ type: "share-link", props: { network: "facebook" } }),
  descriptor: {
    type: "share-link",
    name: "Share link",
    group: "content",
    defaultTab: "content",
    fields: [
      {
        key: "network",
        kind: "select",
        label: "Share to",
        options: SHARE_NETWORKS.map((value) => ({
          value,
          label: value === "email" ? "Email" : SOCIAL_NAMES[value],
        })),
      },
      {
        key: "label",
        kind: "text",
        label: "Name for screen readers",
        optional: true,
        message: "Leave it empty for Share on and the service's name.",
      },
    ],
  },
  // The editor shows where it would lead from an example page; public pages use their own URL.
  build: (node, attrs) => shareLinkVNode(node, attrs, "https://example.com/"),
};

export const hotspots: ElementDefinition<HotspotsNode> = {
  baseCss:
    ".emvb-hotspots{position:relative;margin:0;line-height:0}.emvb-hotspots-image{display:block;width:100%;height:auto}.emvb-hotspots-list{margin:0;padding:0;list-style:none;counter-reset:emvb-hotspot}.emvb-hotspot{position:absolute;line-height:1.4;counter-increment:emvb-hotspot;transform:translate(-50%,-50%)}.emvb-hotspot-button{display:flex;align-items:center;justify-content:center;width:2em;height:2em;padding:0;border:2px solid #fff;border-radius:50%;background:#1f2937;color:#fff;font:inherit;font-weight:700;box-shadow:0 1px 4px rgb(0 0 0 / 0.4);cursor:pointer}.emvb-hotspot-button::before{content:counter(emvb-hotspot)}.emvb-hotspot-button:focus-visible{outline:3px solid #fff;outline-offset:2px}.emvb-hotspot-note{max-width:min(20em,90vw);margin:auto;padding:0.75em 1em;border:1px solid rgb(0 0 0 / 0.2);border-radius:8px;background:#fff;color:#1f2937;line-height:1.4;box-shadow:0 4px 16px rgb(0 0 0 / 0.2)}.emvb-hotspot-title{margin:0;font-weight:600}.emvb-hotspot-text{margin:0.25em 0 0;white-space:pre-line}@supports (position-area:bottom){.emvb-hotspot-note{margin:0.5em;position-area:bottom;position-try-fallbacks:flip-block,flip-inline}}",
  defaults: () => ({ type: "hotspots", props: { src: "", alt: "Image" }, children: [] }),
  descriptor: {
    type: "hotspots",
    name: "Hotspots",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "src", kind: "media", label: "Picture" },
      { key: "alt", kind: "text", label: "Alt text" },
      { key: "decorative", kind: "boolean", label: "Decorative", optional: true },
      {
        key: "label",
        kind: "text",
        label: "Markers list name",
        optional: true,
        message: "What screen readers call the markers. Leave it empty for Points on the picture.",
      },
    ],
  },
  build: (node, attrs, children) => {
    const p = node.props;
    const src = p.src.trim() ? sanitizeMediaUrl(p.src.trim()) : undefined;
    const image: VNode[] = src
      ? [
          {
            tag: "img",
            attrs: {
              class: "emvb-hotspots-image",
              src,
              alt: p.decorative ? "" : p.alt,
              ...(p.width ? { width: String(p.width) } : {}),
              ...(p.height ? { height: String(p.height) } : {}),
              loading: "lazy",
              decoding: "async",
            },
            children: [],
          },
        ]
      : [];
    return {
      tag: "div",
      attrs,
      children: [
        ...image,
        {
          tag: "ol",
          attrs: {
            class: "emvb-hotspots-list",
            "aria-label": p.label?.trim() || "Points on the picture",
          },
          children,
        },
      ],
    };
  },
};

export const hotspot: ElementDefinition<HotspotNode> = {
  baseCss: "",
  defaults: () => ({ type: "hotspot", props: { title: "Point", x: 50, y: 50 } }),
  descriptor: {
    type: "hotspot",
    name: "Hotspot",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "title", kind: "text", label: "Title" },
      { key: "text", kind: "textarea", label: "Note", optional: true },
      {
        key: "x",
        kind: "decimal",
        label: "Across (%)",
        max: 100,
        message: "From 0 (left edge) to 100 (right edge).",
      },
      {
        key: "y",
        kind: "decimal",
        label: "Down (%)",
        max: 100,
        message: "From 0 (top) to 100 (bottom).",
      },
      { key: "xTablet", kind: "decimal", label: "Across on tablets (%)", optional: true, max: 100 },
      { key: "yTablet", kind: "decimal", label: "Down on tablets (%)", optional: true, max: 100 },
      { key: "xMobile", kind: "decimal", label: "Across on phones (%)", optional: true, max: 100 },
      { key: "yMobile", kind: "decimal", label: "Down on phones (%)", optional: true, max: 100 },
    ],
  },
  build: (node, attrs) => {
    const { title, text } = node.props;
    const noteId = `emvb-hotspot-${node.id}`;
    const note: VNode[] = [{ tag: "p", attrs: { class: "emvb-hotspot-title" }, children: [title] }];
    if (text?.trim())
      note.push({ tag: "p", attrs: { class: "emvb-hotspot-text" }, children: [text] });
    const marker: VNode[] = [
      {
        tag: "button",
        attrs: {
          type: "button",
          class: "emvb-hotspot-button",
          popovertarget: noteId,
          "aria-label": title,
        },
        children: [],
      },
      {
        tag: "div",
        attrs: { id: noteId, class: "emvb-hotspot-note", popover: "auto" },
        children: note,
      },
    ];
    return { tag: "li", attrs, children: marker };
  },
};

/** A percentage with at most two decimals. */
const pct = (n: number) => `${Math.round(n * 100) / 100}%`;

/** W-1048: a marker's place as CSS, desktop first; unset devices follow the wider one. */
export function hotspotPlace(props: HotspotNode["props"]): {
  desktop: string[];
  tablet: string[];
  mobile: string[];
} {
  const tx = props.xTablet ?? props.x;
  const ty = props.yTablet ?? props.y;
  return {
    desktop: [pct(props.x), pct(props.y)],
    tablet: props.xTablet === undefined && props.yTablet === undefined ? [] : [pct(tx), pct(ty)],
    mobile:
      props.xMobile === undefined && props.yMobile === undefined
        ? []
        : [pct(props.xMobile ?? tx), pct(props.yMobile ?? ty)],
  };
}
