# The icon library

The Icon element's **Icon** field opens a library of about 14,400 open-source icons, in the style
of the icon libraries other page builders have, with EmVB's own look.

## Picking an icon

1. Select an Icon element. The **Icon** field in the Content tab shows the current icon, its name
   and the set it comes from (for example *Rocket · Font Awesome · Solid*).
2. Click **Choose…** (or the icon preview). The library opens on the current icon's set and style,
   with the icon selected and scrolled into view. A new Icon element opens on Lucide.
3. Pick a set in the sidebar, or stay on **All icons**:
   - **Lucide**: outline icons.
   - **Font Awesome**: Free icons in **Solid**, **Regular** and **Brands**.
   - **Tabler**: **Outline** and **Filled**.
   - **Remix**: **Line** and **Fill**.
4. Type in the search box. Every word has to match, in any order, ignoring case and accents:
   "right arrow" finds *Arrow right*. Icons whose name matches come first, then icons that only
   have the word as a tag (for example *Activity* for "heart"). The sidebar shows how many results
   each set and style has.
5. Click an icon to select it. The footer shows it larger, with its set and stored id. Click
   **Insert**, or double-click the icon. **Close** or Escape leaves the icon as it was.

If the element's **Title** is still the old icon's name (or empty, or "Icon"), it changes to the
new icon's name. A title you wrote yourself is kept.

## Keyboard

| Key | Where | Does |
| --- | --- | --- |
| Type | Search (focused when the library opens) | Filters the icons |
| ↓ or Enter | Search | Moves into the grid |
| ← → ↑ ↓ | Grid | Moves through the icons and selects them |
| Home / End | Grid | First / last icon |
| Page Up / Page Down | Grid | One screen up / down |
| Enter | Grid | Inserts the selected icon |
| Tab | Anywhere | Search → sets → grid → Close → Insert (focus stays inside the library) |
| Escape | Anywhere | Closes without changing the icon |

Screen readers hear each icon with its set and style ("Rocket, Font Awesome Solid") and its place
in the list, and the result count is announced as you type. When the library closes, focus goes
back to **Choose…**.

## What is saved, and what visitors load

The element stores the icon's id (`fa-solid:rocket`, so the library can reopen on it) and the
icon's SVG. The published page contains that SVG inline: visitors never download an icon font or
an icon set. The SVG is checked against EmVB's SVG allowlist when pasted or rendered (no scripts,
event handlers, styles or external links), and is limited to 16 KB.

The icon sets themselves load only in the editor, each as its own file, the first time you open
it in the library (Lucide about 130 KB compressed; All icons loads all four, about 1.6 MB
compressed). The grid only draws the icons on screen, so scrolling thousands of icons stays fast.

Icon elements made before the library (ids such as `star`) keep working unchanged. The library
shows them as Lucide icons, and they switch to the new storage only when you insert a new icon.

## Licenses and attribution

| Set | Version | License |
| --- | --- | --- |
| Lucide (`lucide-static`) | 1.52.0 | ISC |
| Font Awesome Free (`@fortawesome/fontawesome-free`) | 7.3.1 | Icons CC BY 4.0 |
| Tabler Icons (`@tabler/icons`) | 3.49.0 | MIT |
| Remix Icon (`remixicon`) | 4.8.0 | Apache-2.0 |

The notices and license texts ship with the package in `THIRD_PARTY_NOTICES.md` and `licenses/`.
Font Awesome's icons are CC BY 4.0, so a site that uses them should credit Font Awesome
somewhere, for example in the footer or a credits page: "Icons by Font Awesome
(fontawesome.com), CC BY 4.0". Brand icons are trademarks of their owners; use them only to refer
to those brands.

Remix Icon is pinned to 4.8.0: from 4.9.0 on it uses its own "Remix Icon License v1.0", which
doesn't allow redistributing the icons as part of another icon library.
