# Leaving EmVB

You can stop using EmVB at any time and keep your content. This guide lists what EmVB stores, the
ways to take your pages with you, and how to remove the plugin cleanly.

## What EmVB stores, and where

Everything lives in your own EmDash database. Nothing is stored on an EmVB server.

| What | Where |
| --- | --- |
| Visual pages | The hidden `emvb_pages` collection: title, slug, SEO fields and the page's layout as JSON. |
| Headers, footers, popups, floats, synced sections, loop items, page templates | The hidden `emvb_theme_parts` collection, with their display conditions and triggers. |
| Layouts on your own collections | The `canvas` JSON field you added to them (Edit with EmVB). The entry's other fields are yours as before. |
| Site styles (colours, fonts, sizes, classes) | EmVB's plugin storage, with its history. |
| Saved sections, uploaded SVG icons, AI agent requests and proposals | EmVB's plugin storage. |
| Images | EmDash's media library. EmVB only links to them. |

Layouts are typed JSON with a documented format, frozen for every 1.x release:
[SCHEMA.md](../SCHEMA.md).

## Take your pages with you

Pick what fits where you are going. You can use more than one.

### As HTML and CSS files (any host)

1. Open **Pages VisualBuilder** and click **Export pages**.
2. Choose **HTML and CSS files**, then all published pages or one.
3. Leave **Copy this site's images and files into the export** on to put your images in the zip.
4. Click **Export**. A zip downloads.

Each page is a folder with `index.html` and `style.css`: the same markup your site served, with the
header, footer, popups and floats that page showed. The small scripts for popups, floats, tabs and
menu dropdowns are included only where a page uses them. `EXPORT-REPORT.md` in the zip lists every
page, every image, and what only works on the live site:

- **Loops and post fields** need your site's content, so lists of posts are empty.
- **Bound fields** (text bound to site settings, posts or the URL) show their fallback.
- **Audience rules and A/B tests** keep every variant in the HTML, with nothing to choose between
  them.
- **Forms** keep their HTML, but sending needs a server.

Links between pages keep the paths they had on your site, so host the folders at the same paths
or update the links.

### As rich text in EmDash (keep EmDash, drop EmVB)

For EmVB pages:

1. Click **Export pages** and choose **Rich text in a collection**.
2. Pick the pages and a collection with a rich-text field (for example `pages`).
3. Click **Copy pages**. Each page becomes a **draft** entry there with the same title and address,
   holding its words, headings, lists, links and images.

For entries in your own collections that have an EmVB layout:

1. Open the entry and click **Convert to rich text** on the Canvas card.
2. Check what the confirm says: how many blocks go in, what is left out, and whether it replaces
   what the rich-text field holds now. Save other changes to the entry first: it reloads afterwards.
3. Confirm. Only the rich-text field changes; the layout stays.
4. To show the rich text on your site, clear the layout (Edit with EmVB, delete the elements,
   Apply) and save the entry. Your site's own template takes over again.

The design (colours, columns, spacing) doesn't come across as rich text. Forms, icons, dividers,
embeds and similar elements are left out and named, never guessed at.

### As JSON

- Layouts are in the content API like any other field:
  `GET /_emdash/api/content/emvb_pages` and `GET /_emdash/api/content/emvb_theme_parts`.
- **Site styles → Export** downloads your colours, fonts, sizes and classes as JSON.
- The layout format is described in [SCHEMA.md](../SCHEMA.md), with JSON Schemas in
  [docs/schema/](../schema/).

## Remove the plugin

1. Export what you need (above), and publish the rich-text drafts you want to keep.
2. Remove EmVB from your site's code:
   - the `resolveEmVBPage` / `EmVBPage` route and any `resolveThemeParts` calls in your layout;
   - the runtime components (`EmVBTabsRuntime`, `EmVBMenuRuntime`, `EmVBPopupsRuntime`,
     `EmVBFloatsRuntime`, `EmVBFormsRuntime`);
   - `emvb()` from `plugins` in `astro.config`.
3. Uninstall the package: `bun remove @perkyzz/emvb` (or `npm uninstall @perkyzz/emvb`), then
   rebuild and deploy.

After that, EmVB pages no longer render and the EmVB admin pages are gone. Your database still holds
`emvb_pages`, `emvb_theme_parts`, the `canvas` fields and EmVB's plugin storage, untouched, so
reinstalling EmVB brings everything back. To remove them for good, delete the `canvas` fields and
the two collections with EmDash's schema tools once you're sure you don't need them.
