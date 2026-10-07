/**
 * The Icon library set files (W-234): one JSON per set in ./sets, built by
 * `scripts/build-icon-sets.ts` from the pinned icon packages and loaded lazily by the editor.
 */
export type IconSetStyle = {
  /** Sidebar sub-item id inside the set ("solid", "outline"…). */
  id: string;
  label: string;
  /** The stored icon id is `${prefix}:${name}` ("fa-solid:rocket", "lucide:rocket"). */
  prefix: string;
  /** viewBox used when an icon doesn't carry its own. */
  viewBox: string;
  /** Root `<svg>` presentation attributes (stroke or fill style). */
  attrs: Record<string, string>;
};

/** `[name, style index, label, inner SVG markup, search tags, viewBox?]` */
export type IconEntry =
  | [string, number, string, string, string]
  | [string, number, string, string, string, string];

export type IconSetFile = {
  id: string;
  label: string;
  version: string;
  license: string;
  styles: IconSetStyle[];
  icons: IconEntry[];
};
