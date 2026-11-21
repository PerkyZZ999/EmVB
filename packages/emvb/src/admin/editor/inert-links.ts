/**
 * W-752: a preview picture is not a page to browse. A link in it took keyboard focus and Enter
 * loaded the site (or the admin, for an in-page anchor) inside the picture. Inside a tag, core
 * escapes `"` and `>` in attribute values, so the tag and its href are found exactly; text is
 * left alone. Used by the version timeline and the template previews (W-1068).
 */
export const inertLinks = (html: string) =>
  html.replaceAll(/<a\b[^>]*>/g, (tag) => tag.replace(/ href="[^"]*"/, ""));
