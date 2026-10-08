# Changelog

## 0.2.1 — 2026-10-08

EmVB now supports EmDash CMS 1.2. This release is built and tested on EmDash 1.2.0 (unit tests, and the end-to-end suite on the Node and Cloudflare demos). The peer range stays `emdash` ^1.0.0, so sites on EmDash 1.0 and 1.1 can update too. Nothing in EmDash 1.2 broke EmVB. Checking against it turned up a few bugs that affected every 1.x version, and they're fixed here:

- **Theme Builder:** when two parts match a page equally, the one saved most recently wins again. Before, the day of the week it was saved on decided (W-302).
- **Post Date** shows the post's EmDash publish date. It was empty on real posts (W-303).
- **Post Author** shows the post's EmDash byline. It was empty unless the post had its own author field (W-304).
- **Odd URLs:** a category, tag or post address with a broken percent-escape (for example `/tag/50%`) no longer causes a server error in a theme-aware layout (W-305).
- **Box shadow:** the Position menu reads "Outset" or "Inset" instead of the stored keyword (W-306).
- **Demos:** both demo sites run on EmDash 1.2.0. They link posts by `entry.data.slug`, as EmDash 1.2 recommends for multilingual sites, and their seeds put widget options under `props`.

## 0.2.0 — 2026-10-08

A big update since 0.1.0: an icon library, icon styling and SVG uploads, new layout and theme elements, a try-it-now playground, and a long sweep of fixes from hands-on testing (W-124–W-300).

**Upgrading:** layouts and the design document move to schema 12 (0.1.0 used schema 9). Older documents upgrade automatically when they load. Once a page is saved with 0.2.0, EmVB 0.1.0 refuses it as "saved by a newer EmVB", so update every site that shares a database together.

- **Icon library:** the Icon element opens a searchable picker over four bundled sets: Lucide, Font Awesome Free, Tabler and Remix (4.8.0). It has a set and style sidebar, word search in any order and a keyboard-friendly grid. Sets load only in the editor, when the picker opens; pages store just the chosen SVG. License notices ship in the package.
- **Icon styling and Upload SVG:** the Style tab starts with an Icon section: colour, rotate, flip, scale, stroke width, drop shadow, spin or pulse, and transitions. All of it works per state (Hover, Focus, Active) and per device, with plain CSS. Multi-colour SVGs keep their own colours unless you turn on Force single color. Shape presets add a circle, rounded or square background. Upload SVG adds your own icons under My uploads; uploads are sanitized, deduplicated and listed in All icons too.
- **Try it in your browser:** [emvb.dev/playground](https://emvb.dev/playground/) runs the real editor in the browser against an in-browser stand-in for EmDash, with starter content, Visitor view, Export and Reset. Nothing to install.
- **Project site:** [emvb.dev](https://emvb.dev) is the new home for EmVB, with screenshots, guides and the playground.
- **New elements and editor features:**
  - **Elements:** a layout Section element; a Menu element with dropdowns and a wide panel; floating elements and a Float theme part for bars and corners; Pagination for paged archives.
  - **Editing:** grid columns per device; one linked control for padding, margin, border and radius; multi-stop gradients; font weights 100–900; links on Headings and Icons; Save local styles as class; editor-only names for elements in Layers; Revert to published; search in the Visual pages and Theme Builder lists.
  - **Page settings and preview:** site text direction (LTR, RTL, auto); SEO settings for canonical URL, hide from search engines and a social image; a scaled 1280 px Desktop canvas and device-sized Preview.
- **Fixes, grouped:**
  - **Accessibility:** one H1 and no skipped heading levels on starter content; page landmarks; 4.5:1 contrast on controls; full keyboard use of Layers, menus, tabs, popups and dialogs. While the editor is open, the admin behind it is inert, so Tab stays in the editor.
  - **Forms:** fields take the form's input type (email, phone, URL, number, date), required state and limits, so the forms script checks them before sending and shows messages next to each field. Duplicate field names get a warning. Ids stay unique when a form appears twice.
  - **Saving and publishing:** a page changed in another tab or window raises a conflict instead of being overwritten. A page moved to Trash, a signed-out session and a dropped connection each get their own clear message. Undo never leaves edits looking saved.
  - **Public output:** long words such as pasted URLs wrap on phones instead of widening the page. Pages print robots, canonical and Open Graph tags. Empty Tabs and Lists render nothing stray. Images keep their natural size and alt text. Archive pages have numbered URLs and correct titles.
  - **Theme Builder and popups:** condition labels match the editor. Popups trap focus correctly, lock page scroll while open, open once per visit and are named by their first heading.
  - **Names, classes and import:** class and variable names stay unique on rename, New and Duplicate. Import renames names a file repeats and lists the renames. Pasting a style onto another element type no longer carries icon-only settings.

## 0.1.0 — 2026-10-04

The first release, published on npm as [`@perkyzz/emvb`](https://www.npmjs.com/package/@perkyzz/emvb): a visual page builder for EmDash CMS 1.0.x on Node (SQLite) and Cloudflare Workers (D1).

- **Package:** install with `npm i @perkyzz/emvb` and register `emvb()` in `astro.config`. It ships TypeScript source (no build step) and needs EmDash ^1.0.0, Astro ^7 and React ^19.

- **Editor:** a full-screen editor inside the EmDash admin. Drag, drop and nest elements, edit text on the canvas, copy and paste, undo and redo, and preview desktop, tablet and mobile.
- **Elements:** containers with flexbox or CSS Grid, headings, text, buttons, images, video, icons, tabs, accordions, popups and forms (through the EmDash forms plugin).
- **Styling:** Hover, Focus and Active states with transitions, per-device styles and hide on device, backgrounds with gradients and overlays, entrance animations, custom attributes and text decoration.
- **Site styles:** colour, font, size and spacing variables; classes in a clear priority order; tag defaults; changes staged until Publish styles; import and export as JSON.
- **Theme Builder:** headers, footers, Error 404, Search Results, Single Page, Single Post, Archive, Loop Item and popups, with display conditions and dynamic data.
- **Public pages:** plain HTML and CSS. The only EmVB scripts are the optional popups and tabs scripts, which load only on pages that use them.
- **Storage:** layouts and the design document are validated on save and versioned at schema 9. Older documents upgrade automatically.
