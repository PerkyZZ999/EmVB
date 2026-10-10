# Theme parts (Headers, Footers, site templates & Popups)

Post-MVP slices **S7a** (Headers/Footers), **S7c** (Error 404, Search Results, Single Page), **S7d** (Single Post, Archive, Loop Item), and **S7b** (Popups). Stored in hidden collection `emvb_theme_parts`.

## Fields

| Field | Type | Notes |
|---|---|---|
| `title` | string | Required |
| `layout` | json + `emvb:layout` | Same layout schema as Visual pages |
| `part_type` | select | `header` \| `footer` \| `error_404` \| `search_results` \| `single_page` \| `single_post` \| `archive` \| `loop_item` \| `section` \| `page_template` \| `popup` \| `float` |
| `conditions` | json | Conditions doc v1 (see below) |
| `triggers` | json | Triggers doc v1 — meaningful for `popup` (see below) |
| `float` | json | Float settings v1 — meaningful for `float` (edge and close button) |

No SEO. No public `urlPattern` (parts are not catch-all pages).

## Part types

| Type | Role | Location gate (public) |
|---|---|---|
| `header` | Replaces host header | Always competes; conditions decide |
| `footer` | Inserts after `<main>` | Always competes; conditions decide |
| `error_404` | Replaces `<main>` on 404 | Only when `is404` |
| `search_results` | Replaces `<main>` on search | Only when `isSearch` (demo `/search`) |
| `single_page` | Replaces `<main>` on EmDash `pages` singular | `kind=singular`, `collection=pages`, not front; **not** posts or `emvb_pages` |
| `single_post` | Replaces `<main>` on EmDash `posts` singular | `kind=singular`, `collection=posts` (e.g. `/posts/welcome`) |
| `archive` | Replaces `<main>` on posts archive / category / tag | `kind=archive` and not search |
| `loop_item` | Reusable item template for Loop elements | **Never** a page location; referenced by `loop.itemPartId` |
| `section` | Reusable synced block | **Never** a page location; referenced by `section.partId`. Pages render the part's children live |
| `page_template` | Starting layout for a new page | **Never** a page location. New page copies the layout with fresh ids |
| `popup` | Overlay dialog at body end | Always competes; conditions decide; **not** a content replace |
| `float` | Bar or corner pinned to the viewport | Always competes; every match shows; **not** a dialog |

Default Include on create: Entire Site (header/footer/loop_item/section/page_template/popup); 404 page (`error_404`); Search results (`search_results`); Pages all (`single_page`); Posts all (`single_post`); All archives (`archive` — posts index + category/tag; search excluded by location gate).

## Conditions (schemaVersion 1)

```json
{
  "schemaVersion": 1,
  "rules": [
    { "id": "r1", "op": "include", "group": "general", "name": "entire_site", "args": {} }
  ]
}
```

A part matches when **any include** matches and **no exclude** matches. Among matching published parts of one type, **highest specificity** wins; ties use `updatedAt` descending. Content types are also gated by location (above). **Popups** use the same Include/Exclude rules but `listMatchingThemeParts` returns **every** matching popup (not a single winner).

MVP vocabulary: `general/entire_site`, `singular/{all,front,not_found,collection,entry}`, `archive/{all,collection,taxonomy,search}`.

## Triggers (schemaVersion 1, S7b)

```json
{
  "schemaVersion": 1,
  "open": [
    { "type": "page_load" },
    { "type": "delay", "ms": 3000 },
    { "type": "scroll", "percent": 50 },
    { "type": "click", "selector": ".open-promo" }
  ],
  "advanced": {
    "showTimes": 1,
    "devices": ["desktop", "tablet"]
  }
}
```

| Open trigger | Behaviour |
|---|---|
| `page_load` | Opens immediately after the optional runtime inits |
| `delay` | Opens after `ms` (0–120000) |
| `scroll` | Opens when scroll depth ≥ `percent` (0–100) |
| `click` | Opens when an element matching `selector` is clicked (safe CSS selectors only) |

**Advanced (MVP-thin):** `showTimes` caps opens per browser via `localStorage`; `devices` filters by viewport (`mobile` &lt;768, `tablet` &lt;1025, else `desktop`). Null/omitted = unlimited / all devices.

**Gaps vs Elementor (deferred):** URL/query rules, scheduling, A/B, per-session vs per-user distinctions beyond localStorage. Exit-intent and inactivity shipped in W-081.

Default on create: `{ open: [{ type: "page_load" }], advanced: {} }`.

## Dynamic bindings (S7d)

Public HTML stays JS-free (R-031) except in two cases: a matching popup loads `emvb/astro/popups` (`EmVBPopupsRuntime`), and a matching float loads `emvb/astro/floats` (`EmVBFloatsRuntime`). Same optional pattern as Forms. When resolving a winning `single_post` or `archive` part, `resolveThemeParts` loads EmDash posts and passes `ThemeDynamicData` into `renderPage`:

| Element | Public output |
|---|---|
| `post-title` | Escaped title as `h1`–`h6` |
| `post-excerpt` | Escaped excerpt paragraph (omitted if empty), cut to `maxWords` words with "…" when set |
| `post-content` | Portable Text / string → safe blocks: paragraphs, headings, lists, quotes, links, bold, italic, code, underline, strike-through and line breaks. Images, embeds, custom blocks and raw HTML are left out; text is escaped (W-328) |
| `post-image` | `<img>` when a media `src`/`url` exists (sanitized) |
| `post-link` | Permalink `<a>`; blank text uses the title |
| `loop` | Repeats item template for each archive post; `perPage` (1–50, empty = 20) sets the archive page size (W-221) |
| `pagination` | `nav aria-label="Pagination"` with plain Previous / page numbers / Next links (`rel` prev/next, `aria-current="page"`). Nothing when there is one page or no archive data; nothing inside a Loop item (W-222, W-228) |

**Loop Item:** set `loop.itemPartId` to a published `loop_item` theme-part id, or nest post-* elements under Loop as an inline template. Editor canvas shows sample placeholders when no live post is bound.

**Archive pages (W-221–W-224):** `/posts/page/N`, `/category/<slug>/page/N` and `/tag/<slug>/page/N` are page N of that archive. `themeContextFrom` sets `ctx.page` and keeps `ctx.path` as the archive's own path, so conditions match every page. Posts load by offset with the first Loop's `perPage`. EmDash gives `hasMore` but no total, so the links run to one page past the current one. Page 1 is always the bare URL.

**Section:** set `section.partId` to a published `section` theme-part id. The part's children render in place of the section's own children, on pages and in theme parts. A missing part renders empty (it does not fall back to local children). Leave `partId` blank to use the nested elements as an inline section.

**Page template:** a `page_template` part is a starting layout. The new-page dialog copies it onto the page with fresh ids, so later edits stay on that page.

## Public render

Hosts call `resolveThemeParts(Astro, ctx, options)` from `emvb/astro`. `options.visitor` is the same object `resolveEmVBPage` takes (segments, and country, device or returning when the site knows better, W-329). Return value:

- `header` / `footer` — chrome (S7a)
- `content` — body template when Error 404 / Search / Single Page / Single Post / Archive wins
- `popups` — array of matching popup HTML (dialog chrome + body) + trigger config (S7b)
- `floats` — array of matching float HTML (pinned bar or corner). Not a dialog
- `css` — concatenated CSS for all winners (includes popup chrome CSS when popups match, and float chrome when floats match)
- `needsPopupsRuntime` — when true, host renders `<EmVBPopupsRuntime />` from `emvb/astro/popups`
- `needsFloatsRuntime` — when true, host renders `<EmVBFloatsRuntime />` from `emvb/astro/floats`
- `notFound` — an archive page past the last one (`/posts/page/9` with no posts there); answer 404. Page 1 with no posts is not a 404 (W-221)
- `canonicalPath` — the archive page's canonical path: the bare archive path for page 1 (redirect `/page/1` there, 301), else `<archive>/page/N`
- `archiveTitle` / `archivePage` — the winning Archive part's title (e.g. "Posts", the category name) and the page number; build the paged `<title>` with `archivePageTitle(title, page)` from `@perkyzz/emvb/astro` ("Posts – page 2", W-229)
- `dir` — the site text direction from Site styles (`ltr`, `rtl` or `auto`; unset means ltr); put it on the host's `<html dir>`. EmVB roots carry it already. `renderStored` and `resolveEmVBPage` return it too (W-230)

Numbered archive routes (demos: `pages/**/page/[n].astro` + `utils/archive-page.ts`, W-224) resolve the theme in the route, 301 when the path isn't `canonicalPath`, 404 on `notFound` or when no Archive part wins, and pass `theme` to `Base.astro`, which uses `canonicalPath` as the canonical URL. The header and footer parts render as `<header>`/`<footer>` landmarks (W-216); don't wrap them again.

Demos' `Base.astro` **replace** the starter `<header>` when a header wins, insert footer HTML after `<main>` when a footer wins, replace `<main>` slot content when `content` wins, append popup markup before `EmDashBodyEnd` when popups match, and append float markup the same way when floats match. Pages without popups load **no** popup JS. Pages without floats load **no** float JS. Headers/footers/content templates are unchanged. Helpers: `themeContext404`, `themeContextSearch`, `themeContextFront`, `themeContextFrom`.

### Floats (D-048)

A `float` part is a bar or a corner pinned to the viewport. It is not a dialog: no backdrop, no focus trap, `role="region"`. Settings (`float` JSON, schema 1): `edge` (`top`, `bottom`, `start-top`, `end-top`, `start-bottom`, `end-bottom`) and `dismiss` (close button). Start and end follow writing direction. Every matching float shows. Bars on one edge stack and reserve their height (`--emvb-float-top`, `--emvb-float-bottom`). Corners sit 1rem in and do not reserve space. Closing writes `sessionStorage` (`emvb-float-closed:<id>`) for this visit only. Invalid settings skip that part. An existing site needs **Upgrade EmVB** before the field and the type exist.

### Popup a11y (runtime)

Dialog: `role="dialog"`, `aria-modal="true"`, focus moves into the dialog on open, Tab cycles focusables, Escape and backdrop/close button dismiss and restore focus.
