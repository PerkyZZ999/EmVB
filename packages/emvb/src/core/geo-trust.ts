/**
 * S-10 (W-999): whether country headers are the edge's or could be the visitor's own. Set from
 * `emvb({ trustGeoHeaders })` when the plugin starts; read when a page with Visitors rules
 * renders. Kept on globalThis because the plugin and the page renderer can load this module
 * twice (EmDash's runtime and Astro's SSR graph).
 */
const KEY = Symbol.for("emvb.trustGeoHeaders");

type Holder = { [KEY]?: boolean };

/** `true` trusts every country header, `false` none; anything else means "detect the edge". */
export function setGeoTrust(value: unknown): void {
  (globalThis as Holder)[KEY] = typeof value === "boolean" ? value : undefined;
}

export function geoTrust(): boolean | undefined {
  return (globalThis as Holder)[KEY];
}
