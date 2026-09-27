# Theme parts (Headers & Footers)

Post-MVP slice S7a. Stored in hidden collection `emvb_theme_parts`.

## Fields

| Field | Type | Notes |
|---|---|---|
| `title` | string | Required |
| `layout` | json + `emvb:layout` | Same layout schema as Visual pages |
| `part_type` | select | `header` \| `footer` (popups deferred) |
| `conditions` | json | Conditions doc v1 (see below) |

No SEO. No public `urlPattern` (parts are not catch-all pages).

## Conditions (schemaVersion 1)

```json
{
  "schemaVersion": 1,
  "rules": [
    { "id": "r1", "op": "include", "group": "general", "name": "entire_site", "args": {} }
  ]
}
```

A part matches when **any include** matches and **no exclude** matches. Among matching published parts of one type, **highest specificity** wins; ties use `updatedAt` descending.

MVP vocabulary: `general/entire_site`, `singular/{all,front,not_found,collection,entry}`, `archive/{all,collection,taxonomy,search}`.

## Public render

Hosts call `resolveThemeParts(Astro, ctx)` from `emvb/astro`. Demos' `Base.astro` **replace** the starter `<header>` when a header wins, and insert footer HTML after `<main>` when a footer wins. Output is plain HTML + CSS (R-031).
