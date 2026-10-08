# The icon library

The Icon element's **Icon** field opens a library of about 14,400 open-source icons, in the style
of the icon libraries other page builders have, with EmVB's own look. More about EmVB: <https://emvb.dev>.

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

## Uploading your own SVG

**My uploads**, at the bottom of the sidebar, lists the SVGs your site's editors have uploaded,
newest first.

1. Open the library and click **My uploads**, then **Upload SVG**, and choose an `.svg` file.
2. EmVB cleans the file and checks it. If it passes, it goes to the top of the list, selected,
   and **Insert** adds it to the page. If it fails, a message in red says why, and nothing is
   stored.

What EmVB does with the file:

- **Cleans editor leftovers.** Exports from Illustrator, Inkscape, Figma and similar tools work:
  the XML prolog, comments, `<metadata>`, `<title>`/`<desc>` and editor-only attributes are
  removed, and inline `style="fill:…"` paint becomes plain attributes.
- **Refuses anything unsafe.** A file with scripts, event handlers (`onload`…), embedded HTML,
  a `<style>` block or links is refused as a whole, with the reason. Images that point outside
  the file are left out, and the message says how many.
- **Keeps the shape.** The viewBox is kept (or made from the file's px width and height), so the
  icon scales to the Size you set. A file with neither can't be scaled and is refused.
- **Limits the size.** Files up to 256 KB are accepted; after cleaning, the icon can be up to
  **32 KB**. A bigger one is refused with its size: simplify it, for example with
  [SVGO](https://svgo.dev), and try again.

An uploaded SVG keeps its own colours. To paint it in the icon colour instead, turn on **Force
single color** (see below). Uploads are stored by EmVB, not in the EmDash media library: EmDash
doesn't accept SVG uploads, because an SVG opened from its URL could run a script. The page stores
the cleaned SVG itself (with the id `upload:<id>`), so it keeps working even if the upload list
changes. Uploads can't be renamed or deleted yet.

## Styling an icon

Select an Icon element and open the **Style** tab. The **Icon** section comes first:

| Control | Does |
| --- | --- |
| **Color** | The icon colour; pick a global colour variable or any colour. Single-colour icons follow it. |
| **Force single color** | Only for SVGs with their own colours (usually uploads). Paints every part in the icon colour. Details drawn over filled shapes can disappear. |
| **Shape** | None, Circle, Rounded or Square: a background behind the icon. Its colour, padding and border are the **Background**, **Spacing** and **Border** sections below. |
| **Rotate (°)** | −360 to 360, with a slider. |
| **Flip** | Horizontal and/or vertical. |
| **Scale (×)** | Grows or shrinks the icon and its shape, 0.1 to 4. Size (in the Content tab) stays as it is. |
| **Stroke width** | Only for outline icons (Lucide, Tabler Outline, and so on): line thickness, 0.25 to 6. |
| **Drop shadow** | **Add drop shadow** gives a soft shadow that follows the icon's outline; set its colour, offsets and blur. |
| **Animation** | None, **Spin** or **Pulse**, with a duration. Off for visitors whose device asks for reduced motion. |
| **Transition** | How long hover and focus changes take to animate. |

**Hover, focus and pressed.** Pick **Hover** (or Focus, Active) above the sections to style that
state: colour, rotate, flip, scale, stroke width, drop shadow, and the background in the
Background section. For example, Color white, Background your brand colour and Scale 1.15, with a
300 ms transition on Normal. Animation, Transition and Shape are set on Normal only.

**Tablet and mobile.** Switch the device at the top of the canvas to set different values for
tablet and mobile, as for any other style: for example a smaller Scale on mobile. Icon size is
the same on every device for now.

All of this is CSS in the published page; nothing runs in the visitor's browser. It also works in
classes, so you can style many icons the same way.

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
event handlers, styles or external links), and is limited to 32 KB.

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
