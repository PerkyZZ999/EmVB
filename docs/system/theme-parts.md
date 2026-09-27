# Theme parts (Headers, Footers & site templates)

Post-MVP slices **S7a** (Headers/Footers), **S7c** (Error 404, Search Results, Single Page), and **S7d** (Single Post, Archive, Loop Item). Stored in hidden collection `emvb_theme_parts`.

## Fields

| Field | Type | Notes |
|---|---|---|
| `title` | string | Required |
| `layout` | json + `emvb:layout` | Same layout schema as Visual pages |
| `part_type` | select | `header` \| `footer` \| `error_404` \| `search_results` \| `single_page` \| `single_post` \| `archive` \| `loop_item` (popups deferred) |
| `conditions` | json | Conditions doc v1 (see below) |

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

Default Include on create: Entire Site (header/footer/loop_item); 404 page (`error_404`); Search results (`search_results`); Pages all (`single_page`); Posts all (`single_post`); Posts archive (`archive`).

## Conditions (schemaVersion 1)

```json
{
  "schemaVersion": 1,
  "rules": [
    { "id": "r1", "op": "include", "group": "general", "name": "entire_site", "args": {} }
  ]
}
```

A part matches when **any include** matches and **no exclude** matches. Among matching published parts of one type, **highest specificity** wins; ties use `updatedAt` descending. Content types are also gated by location (above).

MVP vocabulary: `general/entire_site`, `singular/{all,front,not_found,collection,entry}`, `archive/{all,collection,taxonomy,search}`.

## Dynamic bindings (S7d)

Public HTML stays JS-free (R-031). When resolving a winning `single_post` or `archive` part, `resolveThemeParts` loads EmDash posts and passes `ThemeDynamicData` into `renderPage`:

| Element | Public output |
|---|---|
| `post-title` | Escaped title as `h1`–`h6` |
| `post-excerpt` | Escaped excerpt paragraph (omitted if empty) |
| `post-content` | Portable Text / string → safe VNodes (`p`/`h*`), escaped text |
| `post-image` | `<img>` when a media `src`/`url` exists (sanitized) |
| `post-link` | Permalink `<a>`; blank text uses the title |
| `loop` | Repeats item template for each archive post |

**Loop Item:** set `loop.itemPartId` to a published `loop_item` theme-part id, or nest post-* elements under Loop as an inline template. Editor canvas shows sample placeholders when no live post is bound.

## Public render

Hosts call `resolveThemeParts(Astro, ctx)` from `emvb/astro`. Return value:

- `header` / `footer` — chrome (S7a)
- `content` — body template when Error 404 / Search / Single Page / Single Post / Archive wins
- `css` — concatenated CSS for all winners

Demos' `Base.astro` **replace** the starter `<header>` when a header wins, insert footer HTML after `<main>` when a footer wins, and replace `<main>` slot content when `content` wins. Posts singular (`/posts/[slug]`), posts index, category, and tag routes already pass enough context for S7d; resolve auto-fetches entry/list data. Helpers: `themeContext404`, `themeContextSearch`, `themeContextFront`, `themeContextFrom`.
