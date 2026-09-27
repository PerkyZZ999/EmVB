/** Bundled Lucide icons as path geometry (A-04 / W-025). No remote fetch. */

export type IconPrimitive = {
  tag: "path" | "circle" | "line" | "polyline" | "polygon" | "rect";
  attrs: Record<string, string>;
};

export type BundledIcon = {
  id: string;
  label: string;
  /** Inner SVG primitives only — the renderer wraps them in a fixed <svg>. */
  children: readonly IconPrimitive[];
};

export const BUNDLED_ICONS: readonly BundledIcon[] = [
  {
    id: "arrow-left",
    label: "Arrow Left",
    children: [
      { tag: "path", attrs: { d: "m12 19-7-7 7-7" } },
      { tag: "path", attrs: { d: "M19 12H5" } },
    ],
  },
  {
    id: "arrow-right",
    label: "Arrow Right",
    children: [
      { tag: "path", attrs: { d: "M5 12h14" } },
      { tag: "path", attrs: { d: "m12 5 7 7-7 7" } },
    ],
  },
  {
    id: "calendar",
    label: "Calendar",
    children: [
      { tag: "path", attrs: { d: "M8 2v3" } },
      { tag: "path", attrs: { d: "M16 2v3" } },
      { tag: "rect", attrs: { x: "3", y: "3", width: "18", height: "18", rx: "2" } },
      { tag: "path", attrs: { d: "M3 9h18" } },
    ],
  },
  {
    id: "camera",
    label: "Camera",
    children: [
      {
        tag: "path",
        attrs: {
          d: "M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z",
        },
      },
      { tag: "circle", attrs: { cx: "12", cy: "13", r: "3" } },
    ],
  },
  {
    id: "check",
    label: "Check",
    children: [{ tag: "path", attrs: { d: "M20 6 9 17l-5-5" } }],
  },
  {
    id: "circle-alert",
    label: "Circle Alert",
    children: [
      { tag: "circle", attrs: { cx: "12", cy: "12", r: "10" } },
      { tag: "line", attrs: {} },
      { tag: "line", attrs: {} },
    ],
  },
  {
    id: "circle-check",
    label: "Circle Check",
    children: [
      { tag: "circle", attrs: { cx: "12", cy: "12", r: "10" } },
      { tag: "path", attrs: { d: "m16 9-5.5 5.5L8 12" } },
    ],
  },
  {
    id: "clock",
    label: "Clock",
    children: [
      { tag: "circle", attrs: { cx: "12", cy: "12", r: "10" } },
      { tag: "path", attrs: { d: "M12 6v6l4 2" } },
    ],
  },
  {
    id: "download",
    label: "Download",
    children: [
      { tag: "path", attrs: { d: "M12 15V3" } },
      { tag: "path", attrs: { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" } },
      { tag: "path", attrs: { d: "m7 10 5 5 5-5" } },
    ],
  },
  {
    id: "external-link",
    label: "External Link",
    children: [
      { tag: "path", attrs: { d: "M15 3h6v6" } },
      { tag: "path", attrs: { d: "M10 14 21 3" } },
      { tag: "path", attrs: { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" } },
    ],
  },
  {
    id: "globe",
    label: "Globe",
    children: [
      { tag: "circle", attrs: { cx: "12", cy: "12", r: "10" } },
      { tag: "path", attrs: { d: "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" } },
      { tag: "path", attrs: { d: "M2 12h20" } },
    ],
  },
  {
    id: "heart",
    label: "Heart",
    children: [
      {
        tag: "path",
        attrs: {
          d: "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5",
        },
      },
    ],
  },
  {
    id: "house",
    label: "House",
    children: [
      { tag: "path", attrs: { d: "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" } },
      {
        tag: "path",
        attrs: {
          d: "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
        },
      },
    ],
  },
  {
    id: "info",
    label: "Info",
    children: [
      { tag: "circle", attrs: { cx: "12", cy: "12", r: "10" } },
      { tag: "path", attrs: { d: "M12 16v-4" } },
      { tag: "path", attrs: { d: "M12 8h.01" } },
    ],
  },
  {
    id: "mail",
    label: "Mail",
    children: [
      { tag: "path", attrs: { d: "m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" } },
      { tag: "rect", attrs: { x: "2", y: "4", width: "20", height: "16", rx: "2" } },
    ],
  },
  {
    id: "menu",
    label: "Menu",
    children: [
      { tag: "path", attrs: { d: "M4 5h16" } },
      { tag: "path", attrs: { d: "M4 12h16" } },
      { tag: "path", attrs: { d: "M4 19h16" } },
    ],
  },
  {
    id: "minus",
    label: "Minus",
    children: [{ tag: "path", attrs: { d: "M5 12h14" } }],
  },
  {
    id: "phone",
    label: "Phone",
    children: [
      {
        tag: "path",
        attrs: {
          d: "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384",
        },
      },
    ],
  },
  {
    id: "play",
    label: "Play",
    children: [
      {
        tag: "path",
        attrs: {
          d: "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z",
        },
      },
    ],
  },
  {
    id: "plus",
    label: "Plus",
    children: [
      { tag: "path", attrs: { d: "M5 12h14" } },
      { tag: "path", attrs: { d: "M12 5v14" } },
    ],
  },
  {
    id: "search",
    label: "Search",
    children: [
      { tag: "path", attrs: { d: "m21 21-4.34-4.34" } },
      { tag: "circle", attrs: { cx: "11", cy: "11", r: "8" } },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    children: [
      {
        tag: "path",
        attrs: {
          d: "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",
        },
      },
      { tag: "circle", attrs: { cx: "12", cy: "12", r: "3" } },
    ],
  },
  {
    id: "shopping-cart",
    label: "Shopping Cart",
    children: [
      {
        tag: "path",
        attrs: { d: "m2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18" },
      },
      {
        tag: "path",
        attrs: { d: "M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25" },
      },
      { tag: "circle", attrs: { cx: "18", cy: "20", r: "2" } },
      { tag: "circle", attrs: { cx: "8", cy: "20", r: "2" } },
    ],
  },
  {
    id: "star",
    label: "Star",
    children: [
      {
        tag: "path",
        attrs: {
          d: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
        },
      },
    ],
  },
  {
    id: "user",
    label: "User",
    children: [
      { tag: "path", attrs: { d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" } },
      { tag: "circle", attrs: { cx: "12", cy: "7", r: "4" } },
    ],
  },
  {
    id: "x",
    label: "X",
    children: [
      { tag: "path", attrs: { d: "M18 6 6 18" } },
      { tag: "path", attrs: { d: "m6 6 12 12" } },
    ],
  },
];

export const BUNDLED_ICON_IDS = BUNDLED_ICONS.map((icon) => icon.id);

const byId = new Map(BUNDLED_ICONS.map((icon) => [icon.id, icon]));

export function getBundledIcon(id: string): BundledIcon | undefined {
  return byId.get(id);
}
