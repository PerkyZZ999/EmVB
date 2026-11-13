/**
 * S-12 (W-1001): element ids that would replace a browser global a host script reads (DOM
 * clobbering: `<div id="location">` makes `window.location` checks in old scripts see the
 * element). The renderer leaves such an id out and the editor refuses it; stored layouts keep
 * it, so no page saved by an older EmVB is refused. `top` stays allowed: `#top` links are common.
 */
const SHADOWING = new Set([
  "anchors",
  "body",
  "closed",
  "cookie",
  "defaultView",
  "document",
  "documentElement",
  "domain",
  "embeds",
  "forms",
  "frameElement",
  "frames",
  "globalThis",
  "head",
  "history",
  "images",
  "length",
  "links",
  "localStorage",
  "location",
  "name",
  "navigator",
  "opener",
  "origin",
  "parent",
  "plugins",
  "scripts",
  "self",
  "sessionStorage",
  "status",
  "window",
]);

export const isShadowingId = (id: string): boolean => SHADOWING.has(id);
