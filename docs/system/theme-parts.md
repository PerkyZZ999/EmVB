# Theme parts (Headers, Footers, site templates & Popups)

Post-MVP slices **S7a** (Headers/Footers), **S7c** (Error 404, Search Results, Single Page), **S7d** (Single Post, Archive, Loop Item), and **S7b** (Popups). Stored in hidden collection `emvb_theme_parts`.

## Fields

| Field | Type | Notes |
|---|---|---|
| `title` | string | Required |
| `layout` | json + `emvb:layout` | Same layout schema as Visual pages |
| `part_type` | select | `header` \| `footer` \| `error_404` \| `search_results` \| `single_page` \| `single_post` \| `archive` \| `loop_item` \| `section` \| `page_template` \| `popup` |
| `conditions` | json | Conditions doc v1 (see below) |
| `triggers` | json | Triggers doc v1 — meaningful for `popup` (see below) |

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

Public HTML stays JS-free (R-031) **except** when a matching popup is present — then hosts load `emvb/astro/popups` (`EmVBPopupsRuntime`), the same optional pattern as Forms. When resolving a winning `single_post` or `archive` part, `resolveThemeParts` loads EmDash posts and passes `ThemeDynamicData` into `renderPage`:

| Element | Public output |
|---|---|
| `post-title` | Escaped title as `h1`–`h6` |
| `post-excerpt` | Escaped excerpt paragraph (omitted if empty) |
| `post-content` | Portable Text / string → safe VNodes (`p`/`h*`), escaped text |
| `post-image` | `<img>` when a media `src`/`url` exists (sanitized) |
| `post-link` | Permalink `<a>`; blank text uses the title |
| `loop` | Repeats item template for each archive post |

**Loop Item:** set `loop.itemPartId` to a published `loop_item` theme-part id, or nest post-* elements under Loop as an inline template. Editor canvas shows sample placeholders when no live post is bound.

**Section:** set `section.partId` to a published `section` theme-part id. The part's children render in place of the section's own children, on pages and in theme parts. A missing part renders empty (it does not fall back to local children). Leave `partId` blank to use the nested elements as an inline section.

**Page template:** a `page_template` part is a starting layout. The new-page dialog copies it onto the page with fresh ids, so later edits stay on that page.

## Public render

Hosts call `resolveThemeParts(Astro, ctx)` from `emvb/astro`. Return value:

- `header` / `footer` — chrome (S7a)
- `content` — body template when Error 404 / Search / Single Page / Single Post / Archive wins
- `popups` — array of matching popup HTML (dialog chrome + body) + trigger config (S7b)
- `css` — concatenated CSS for all winners (includes popup chrome CSS when popups match)
- `needsPopupsRuntime` — when true, host renders `<EmVBPopupsRuntime />` from `emvb/astro/popups`

Demos' `Base.astro` **replace** the starter `<header>` when a header wins, insert footer HTML after `<main>` when a footer wins, replace `<main>` slot content when `content` wins, and append popup markup before `EmDashBodyEnd` when popups match. Pages without popups load **no** popup JS. Headers/footers/content templates are unchanged by S7b. Helpers: `themeContext404`, `themeContextSearch`, `themeContextFront`, `themeContextFrom`.

### Popup a11y (runtime)

Dialog: `role="dialog"`, `aria-modal="true"`, focus moves into the dialog on open, Tab cycles focusables, Escape and backdrop/close button dismiss and restore focus.
