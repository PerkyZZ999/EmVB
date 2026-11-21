# Making EmVB pages look designed

A page should read like a real site, not a document: one system of colour, type and spacing,
clear hierarchy, and bands that alternate in rhythm. Decide the system once in the site styles,
then build every page from it.

## 1. Set up the site styles (once per site)

Recipes and `get_site_styles` `tokens` find variables by these names, so use them:

| Kind       | Ids / names                                                                                                                                              | Notes                                                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Colours    | Brand (`brand`), a second brand hue, Ink (`ink`), Muted text (`muted`), Surface (`surface`), Card (`card`), a Border line, On brand (`on-brand`), a tint | Brand is the one action colour. Ink on Surface and Muted on Card must reach 4.5:1.                                                                                       |
| Fonts      | `display` (headings) and `body`                                                                                                                          | Pair a characterful display face with a plain sans, for example a serif display with a geometric sans. EmVB loads no web fonts: write full stacks with system fallbacks. |
| Font sizes | `fs-4xl` display, `fs-3xl`, `fs-2xl` heading, `fs-xl` subheading, `fs-l` lead, `fs-m` body, `fs-s` small                                                 | A 1.25–1.33 ratio. Give the big ones a `fluid` min and max so they shrink on phones. Body 16–18 px.                                                                      |
| Spacings   | `space-xs` 8, `space-s` 16, `space-m` 24, `space-l` 40, `space-2xl` 64, `space-3xl` 96–120                                                               | Multiples of 8 only. `space-3xl` is the vertical padding of a band.                                                                                                      |
| Classes    | Button (`btn`), a ghost button, Card (`card`), Eyebrow                                                                                                   | Recipes put Button and Card on their buttons and cards.                                                                                                                  |

A colour may also have a `dark` hex: visitors whose device prefers dark mode see it instead (and a
Theme toggle element lets them choose). Give Surface, Card, Ink and Muted dark values together, and
check the same contrast pairs in both. A font that has `faces` was given font files by a person in
Site styles; agents can't add font files. `update_site_styles` keeps the keys you don't send, so
change only its `value` (the stack, with the family first) and leave `family`, `faces` and `source`.

Tag defaults (`defaults.h1…h3, p, a`) set the display font, ink colour and line heights
(headings 1.1–1.3, body 1.5–1.7) once, so elements need fewer local styles.

## 2. Page structure

- **Hero:** the h1 in `fs-4xl` (one per page), a lead line in `fs-l`, one primary and one
  secondary button, and a strong visual: a large image with a radius and soft shadow, or a
  brand gradient or photo with an `overlay` for contrast. 2 columns on desktop, 1 on tablet.
- **Bands:** each `layout-section` gets `space-3xl` top and bottom padding and a contentWidth
  around 1100–1200 px. Alternate Surface, Card and an occasional dark or tinted band so sections
  separate without lines. Keep the root container's gap at 0.
- **Section header:** a small uppercase eyebrow (Eyebrow class), an h2 in `fs-2xl`/`fs-3xl`, and
  a short intro capped at about 36em, centred or left-aligned consistently.
- **Grids:** 3 columns for features (2 on tablet, 1 on mobile), 2 for split image/text, 4 for
  stats (2 on mobile). Gap `space-m` inside a group, `space-2xl` between groups (proximity).
- **Cards:** the Card class (one radius, 12–16 px for most brands; a soft shadow tinted with the
  brand's darkest colour, never pure black). Put an icon in a 48–56 px rounded tile with the
  brand gradient on top of each feature card.
- **Calls to action:** one primary style everywhere. Never two solid primary buttons side by
  side: pair the primary with a ghost or outline button. Repeat the main action in a closing
  band with a gradient.

## 3. Images and icons

- Use real photographs that match the copy (the person's media, or royalty-free URLs such as
  images.unsplash.com with `w=` and `fit=crop`). Set `width`/`height`, an `aspectRatio` style
  and `objectFit: "cover"`, a radius matching the cards, and alt text that says what is in the
  picture. If the photo doesn't match the words, change the alt text or the photo.
- Icons: the bundled icon ids from `list_element_types` (type "icon"), coloured with the brand
  or `on-brand`, 20–28 px, `decorative: true` next to a text label.

## 4. Before you hand over

- Contrast: text on gradients and photos needs an overlay or a dark enough stop; run
  `get_accessibility_findings` and fix every error.
- Hierarchy: one h1, then h2 per band, h3 inside cards; siblings at the same level.
- Rhythm: no arbitrary values (13 px, 27 px); every gap and padding is a spacing variable.
- Responsive: check that grids set `columnsTablet` and `columnsMobile` and that hero type uses
  fluid sizes.
- Copy: real, specific words. No "Lorem ipsum", "Learn more" or `#` links left behind.
