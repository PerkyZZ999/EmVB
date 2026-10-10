# Changelog

All notable changes to EmVB are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Each entry names its work item (W-number). "Breaking" lists layout and design schema changes: a page saved by a newer EmVB can't be opened by an older one.

## [Unreleased]

## [0.3.0] - 2026-10-09

A large feature release: live data, personalization on the server, a command palette, version history, design tokens, an accessibility co-pilot and scroll motion (W-307–W-321).

### Breaking

- **Layout and design schema 13.** Layouts and the design document move from schema 12 to 13 (W-307). Schema 13 only adds optional fields, so older documents upgrade unchanged when they load. EmVB 0.2.x refuses a page saved at schema 13 as "saved by a newer EmVB", so update every site that shares a database together.

### Added

- **Live data binding (W-307).** In the Content tab, **Dynamic data** binds a heading, text, label, button, link, image, icon or menu item to:
  - a post field (title, excerpt, permalink, slug, date, author, featured image, or any plain field of the entry by name, such as a team member's `role`);
  - a site setting (title, tagline, URL, social links…);
  - or a URL parameter (`?plan=pro`).
    The typed value stays as the fallback, so a page never shows an empty heading. The canvas shows live values while you edit, with a preview box for URL parameters.
- **Collection Loops with an Empty state (W-308).** A Loop can list any collection (team, projects, …) with a limit (1–50) and an order (newest, oldest, title), shown as a list, a grid or cards with 1–6 columns (one column on phones). Design the item once. The new **Empty state** element, which only goes inside a Loop, is what visitors see when there are no entries. The canvas shows the collection's real entries.
- **Page N of M (W-309).** Pagination can show a page count with your own wording ("Page {page} of {total}"). EmDash 1.2's public collection query reports no total, so there the count reads "Page N" and never shows a guessed total; a host that passes `totalPages` gets "Page N of M" and a last-page link.
- **Page weight meter (W-310).** A gauge button in the top bar shows the page's HTML, CSS, JavaScript and image weight against a budget. It warns about oversized images, video embeds and a hero image not marked Priority, and lists the heaviest sections (click one to select it).
- **Zero-JS badges (W-311).** The few elements that add a script (a connected Form, Tabs, a Menu item with a dropdown) carry a **JS** badge in Layers and the Add panel, and the page weight meter names each script the page loads.
- **Edge A/B tests (W-312).** **Create variant B** in the Content tab makes the element arm A of a test and adds a copy as arm B, with an optional split. The site picks an arm per visitor on the server and keeps it in a 30-day cookie, so there is no flicker and no script. The canvas shows both arms outlined, Layers badges them A/B, and **Keep this variant and end the test** removes the other. Works on Node and Cloudflare with no route changes, including inside synced sections and Loop items.
- **Visitor-aware elements (W-313).** **Visitors** in the Content tab shows or hides an element by country, device (phone, tablet, desktop), first or returning visit, and hours and days in a chosen time zone. The server decides on each request; a rule the host can't check doesn't match.
- **Command palette (W-314).** **Ctrl/Cmd+K** opens EmVB's own palette instead of the EmDash admin's. Insert any element or section recipe, jump to any layer (by name or text), apply a site class, or run an action (save, publish, preview, undo, redo, duplicate, delete, Site styles, page weight, device view, share). Fuzzy search; `>` narrows to actions, `+` to elements, `@` to layers and `.` to classes.
- **Version timeline (W-315).** A clock button lists every saved version of the page from EmDash's revisions, shows one side by side with the current page with added, removed and changed sections outlined, and restores one section or the whole version. Restoring is an ordinary, undoable edit that isn't saved until you save. The emvb.dev playground keeps the last eight versions too.
- **Design tokens and fluid sizes (W-316).** Site styles has **Scales**: a type scale (Text XS to Display) from a body size and a ratio, and a spacing scale (3XS to 3XL) from one gap. Tick **Fluid** and give a small-screen size, and each token grows smoothly between screen sizes with CSS `clamp()`, no breakpoints. Tokens are ordinary Font size and Spacing variables, so anything using them picks up changes; applying again updates them in place.
- **Accessibility co-pilot (W-317).** A live accessibility score in the top bar. Its panel lists each issue with its element (click to select it) and, where safe, a one-click fix or **Fix all**: missing or file-name alt text, skipped heading levels and a second H1, text contrast below 4.5:1 (3:1 for large text), links with no name or vague text, new-tab links that don't say so, and aria-hidden on focusable elements. A/B variants count as alternatives, not duplicates.
- **Style inheritance inspector (W-318).** The Style tab opens with **Where styles come from**: every property that applies on this screen and state, whether it comes from the tag's default, a class or the element itself, what it overrides (struck through), and variables by name. Every control shows the value from classes and defaults as its placeholder.
- **Scroll motion (W-319).** Style → Effects has **Scroll motion**: presets (Fade in, Rise in, Slide in, Zoom in, Parallax, Turn, Sharpen in, Fade out on leave) or your own mix of opacity, move, scale, rotate and blur, playing as the element enters, crosses or leaves the screen, or over the whole page scroll. Pure CSS scroll-driven animations, no JavaScript. Works per screen size and on classes, combines with an entrance animation, and **Turn off here** stops it on smaller screens.
- **Section recipes (W-320).** The Add panel (and the palette) has **Section recipes**: Hero, Features, Call to action, Testimonial, Stats and FAQ. Each is built from your Site styles (brand, text and surface colours, scale tokens, Button and Card classes) with plain values where you have none, picks readable text on the accent colour, and passes the accessibility co-pilot. The hero is the page's H1 only when the page has none.
- **Shareable playground links (W-321).** **Share** (top bar or palette) packs this page, unsaved changes included, and optionally your Site styles into an emvb.dev/playground link. The page travels compressed in the link's `#` part, so nothing is uploaded or logged. Opening a link asks first, then adds the page to the visitor's playground. The dialog warns about very long links and images that only exist on your site.

### Changed

- **Changelog page on emvb.dev (W-322).** [emvb.dev/changelog](https://emvb.dev/changelog/) shows this file, built from it with each release, with a version list; the site header and footer link to it, and so do the home page's version label and a **See what's new** link (W-323).
- **Node demo dev server runs on Node** (thanks @masonjames). `bun run demo:node` no longer forces Bun, which could crash on startup on macOS.

### Accessibility

- The Dynamic data controls read "Text source" and "Text parameter name", so they never share a name with the field they bind (W-307).
- The accessibility co-pilot's fixes are ordinary, undoable edits (W-317), and section recipes start accessible (W-320).
- Scroll motion and entrance animations stay still for visitors who prefer reduced motion and in browsers without scroll-driven animations (W-319).

### Performance

- Pages stay plain HTML and CSS: A/B tests and visitor rules are decided on the server, and scroll motion is CSS only (W-311, W-312, W-313, W-319).
- Fluid type and spacing need no media queries (W-316).

### Security

- **URL-parameter links stay on your site (W-307).** A link or image bound to a URL parameter only takes same-site URLs (relative, or the page's own address); others show the typed value. **Allow outside sites** turns this off for one field and warns that anyone could then share a link to your page that points at any site (phishing).
- Bound values are capped at 500 characters, stripped of control characters, escaped, and pass the same link and image checks as typed values; a refused value keeps the typed one (W-307).
- **Personalized pages are never shared between visitors (W-312, W-313).** Pages with an A/B test or a visitor rule are sent with `Cache-Control: private, no-store` and `Vary: Cookie`, and opt out of Astro's route cache. The A/B and returning-visitor cookies are first-party and HttpOnly.
- Shared playground links are size-capped and checked like a saved page before anything is added (W-321).

## [0.2.1] - 2026-10-08

EmVB now supports EmDash CMS 1.2. This release is built and tested on EmDash 1.2.0 (unit tests and the end-to-end suite on the Node and Cloudflare demos). The peer range stays `emdash` ^1.0.0, so sites on EmDash 1.0 and 1.1 can update too. Nothing in EmDash 1.2 broke EmVB; checking against it turned up a few bugs that affected every 1.x version, fixed here.

### Changed

- **EmDash 1.2.** The package and both demo sites are built and tested on EmDash 1.2.0. The demos link posts by `entry.data.slug`, as EmDash 1.2 recommends for multilingual sites, and their seeds keep widget options under `props`.
- **emvb.dev** has a redesigned home page (W-301), and its FAQ and hero say EmVB supports EmDash 1.0 to 1.2.

### Fixed

- **Theme Builder:** when two parts match a page equally, the one saved most recently wins again. Before, the day of the week it was saved on decided (W-302).
- **Post Date** shows the post's EmDash publish date. It was empty on real posts (W-303).
- **Post Author** falls back to the post's EmDash byline. It was empty unless the post had its own author field (W-304).
- **Odd URLs:** a category, tag or post address with a broken percent-escape (for example `/tag/50%`) no longer causes a server error in a theme-aware layout (W-305).
- **Box shadow:** the Position menu reads "Outset" or "Inset" instead of the stored keyword (W-306).

## [0.2.0] - 2026-10-08

A big update since 0.1.0: an icon library, icon styling and SVG uploads, new layout and theme elements, a try-it-now playground, and a long sweep of fixes from hands-on testing (W-124–W-300).

### Breaking

- **Layout and design schema 12.** Layouts and the design document move from schema 9 to 12: schema 10 for the linked box control (W-138), 11 for the Section element (W-156) and 12 for multi-stop gradients and the regrouped shadow (W-160). Older documents upgrade automatically when they load. Once a page is saved with 0.2.0, EmVB 0.1.0 can't open it and refuses it as "saved by a newer EmVB", so update every site that shares a database together.

### Added

- **Icon library (W-234–W-236).** The Icon element opens a searchable picker over four bundled sets: Lucide, Font Awesome Free, Tabler and Remix (4.8.0). A set and style sidebar, word search in any order, and a keyboard-friendly grid that reopens on the current icon. Pages store just the chosen SVG, sanitized on every render. License notices ship in the package.
- **Icon styling (W-237, W-238).** The Style tab starts with an Icon section: colour, rotate, flip, scale, stroke width, drop shadow, spin or pulse, and transitions, per state (Hover, Focus, Active) and per device, as plain CSS. Multi-colour SVGs keep their colours unless **Force single color** is on. Shape presets add a circle, rounded or square background.
- **Upload SVG (W-239, W-241, W-243).** Your own icons go under **My uploads** (listed first in All icons). Uploads are sanitized, deduplicated (uploading the same file again picks the earlier one), and files that would draw nothing are refused or fixed; pt, mm, cm and in sizes convert to px.
- **Try it in your browser.** [emvb.dev/playground](https://emvb.dev/playground/) runs the real editor in the browser against an in-browser stand-in for EmDash, with starter content, Visitor view, Export and Reset. Nothing to install.
- **Project site.** [emvb.dev](https://emvb.dev) is the new home for EmVB, with screenshots, guides and the playground.
- **Elements:**
  - a layout **Section** element (W-156);
  - a **Menu** element with dropdowns and a wide panel; Escape closes a dropdown and returns focus (W-162, W-197);
  - **floating elements** and a **Float** theme part for bars and corners (W-161);
  - **Pagination** with Previous, page number and Next links for paged archives (W-222).
- **Editing:**
  - edit Accordion and Tabs items from their Content tab; new accordion items are "Question n" with the title focused (W-130, W-154);
  - **Save local styles as class** (W-134);
  - colour fields show variable swatches and take a custom hex (W-136);
  - common style sections open by default and remember your choices (W-137);
  - one linked four-box control for padding, margin, border and radius (W-138);
  - grid columns per device (W-139);
  - links on Headings and Icons (W-141);
  - unit fields say what they take, and Margin offers `auto` (W-151);
  - exclusive fills, multi-stop gradients and a regrouped shadow (W-160);
  - layout icon rows for direction, wrap, justify and align (W-163);
  - Add falls back to just after the nearest container that accepts the element (W-175);
  - a box link is checked as a URL with an inline error (W-176);
  - font weights 100–900, negative letter spacing and unitless line height (W-213);
  - editor-only element names, renamed in Layers (W-157);
  - **Revert to published**, with a confirmation (W-193);
  - search in the Visual pages and Theme Builder lists (W-207).
- **Posts and archives:**
  - Post Date format and Post Excerpt length (W-177);
  - archive pages: posts per page, `/page/N` URLs, 404 past the last page and canonical URLs (W-221, W-224);
  - paged archive titles read "Posts – page 2", and category and tag archives use the term's label (W-229, W-263).
- **Page settings:** site text direction (LTR, RTL, auto) on EmVB pages and the host's `<html>` (W-230); SEO **Canonical URL**, **Hide from search engines** (noindex, nofollow) and a **Social image** (W-284, W-286, W-287).
- **Canvas and preview:** a scaled 1280 px Desktop canvas and device-sized Preview (W-158). The Publish button shows when site styles are unpublished (W-153), and a published page says when it waits on unpublished site styles (W-126).
- **Media:** Image **Load right away** renders eagerly with high fetch priority (W-226); video embeds keep the link's start time (W-227); unlisted Vimeo videos, Vimeo channels and YouTube live links work (W-215).
- **Forms:** a warning when two fields in one form share a name (W-194).

### Changed

- The theme-part embed is called **Theme section** (W-155).
- A page's first Heading is its H1 (W-147), and floats, headers, footers and other shared parts start on an H2, with a note on an H1 there (W-179, W-208).
- An unstyled Button looks like a button (W-148).
- A new Menu's dropdown starts with "Projects" (W-178).
- Line height defaults to `em`, so a bare number is a multiple (W-125).
- The device switcher hugs its options and shows device icons (W-127).
- Scheduled entries show **Scheduled** instead of Draft (W-201), and a published entry with a saved draft shows **Changes not published** (W-190).

### Accessibility

- Full keyboard use of Layers: arrow keys move one row and focus follows the selection, Alt+arrows move the focused row's element, Enter presses row and toolbar buttons, and the row menu opens on its first item, takes arrow, Home and End keys, and closes with Escape (W-211, W-233, W-256–W-260).
- Choice rows (direction, wrap, justify, align, icon shape) are one Tab stop with radio keys (W-247).
- While the editor is open, the admin behind it is inert, so Tab starts in the editor (W-300).
- Segmented controls and the icon library count meet 4.5:1 contrast (W-244).
- Header and footer theme parts are banner and contentinfo landmarks (W-216); an empty Menu is a plain box, not an empty nav landmark (W-198); empty Tabs drop the tablist role (W-275).
- A linked Heading or Icon shows its Focus state when its link has keyboard focus (W-242).
- Popups trap focus correctly, skip hidden inputs, lock page scroll and take their name from their first heading (W-279, W-282).
- Settings fields follow their text's direction (W-272); multi-line content fields are named by their label (W-124).
- Notes when a box link has nothing that names it (W-261) and when image alt text is missing, a placeholder or a file name (W-265).
- The playground's starter pages have main landmarks and an unbroken heading order (W-293).

### Performance

- Icon sets load only in the editor, when the picker opens (W-235).
- Long pages stay responsive: the canvas page tree is memoized and Layers rows re-render only when they change (W-268).

### Security

- SVG images only come from the media library or embedded raster data, with notices on paste and in the panel (W-231).
- Uploaded SVG icons are sanitized before they're stored and on every render (W-239).
- Form attribute names the forms script uses are reserved like `data-emvb-*` (W-191).
- Saves refuse elements inside a parent the editor never allows (W-225).
- A save started during another save waits for it instead of racing with stale data (W-199).

### Fixed

- **Drag and drop:** reliable drag-to-nest with edge zones, placeholders and a named target (W-128, W-129); Enter on an Add tile adds once (W-167); element shortcuts act only from the canvas, Layers or nothing focused (W-132).
- **Canvas:** the selected element's toolbar sits inside its outline (W-131); no inner scrollbar in Mobile and Tablet (W-140); a user min-height beats the empty-box floor (W-145).
- **Styles:** duplicating keeps CSS ids on the original (W-133) and a class keeps its tablet and mobile styles (W-135); gradient stops are written in order (W-172); pasted `oklch()` lightness reads as 0–1 or a percent (W-173); clearer RGB and OKLCH errors, including out-of-gamut clipping (W-174, W-181, W-183); emptied gradient stops fall back to automatic (W-180); background types remember their last fill (W-184); device background layers keep the layers they inherit (W-210); Div Block hides flex controls that do nothing (W-144); Container has a Typography section (W-159).
- **Icons:** icon polish from live use (W-240); a device can stop an inherited icon animation (W-248); multi-colour icons say when they ignore the colour (W-296); Paste style doesn't carry icon-only settings to other elements (W-292); colour variables in the icon shadow count as usages (W-245); Layers previews icon titles (W-246).
- **Layers:** previews the text of Text, Button, Link, accordion items and tab panels (W-143); long names ellipsize with full tooltips (W-168).
- **Site styles:** a variable's usage label counts its classes (W-150); class and variable names stay unique and within limits on New, Rename and Duplicate (W-218–W-220, W-277, W-278); the delete dialog says other pages aren't checked, and undo puts the item back where it was (W-251, W-252); a refused save or publish loads the latest styles (W-212); Import asks before replacing styles and renames repeated names (W-214, W-283).
- **Saving and publishing:** in the playground, a save from a second tab on an older copy is refused instead of overwriting (W-290); a signed-out save and a page moved to Trash each get a clear message with Retry, and publishing a trashed page says so (W-205, W-206, W-298); an edit after undo never reads as saved (W-255); Advanced CSS id, attributes, Field name and required text never block Save (W-189, W-192, W-202); Visual pages and Theme Builder list every entry, not only the newest 50 (W-204); long titles wrap (W-209).
- **Forms:** fields take the definition's label, type (email, phone, URL, number, date), required state and limits, so the forms script checks them before sending (W-166, W-297); ids stay unique when a form appears twice (W-187, W-249); the Submit button keeps its label after a submit (W-203).
- **Synced sections and loop items:** render inside floats and popups (W-200); keep their own styles when an id repeats (W-250); load the forms, Tabs and Menu scripts they need (W-253).
- **Public output:** long words wrap on phones (W-299); blank canvas pages print robots, canonical and Open Graph tags (W-274); Text line breaks show (W-264); video players are 16:9 and dividers full width with a single line (W-266, W-270); images keep their natural size (W-269); blank list items render no bullets (W-275); menu dropdowns open on hover and close when focus leaves (W-254, W-267); public Tabs radios leave the Tab order once enhanced (W-195); pasted SVG entities decode once (W-186); Post Date only reads ISO dates (W-196).
- **Theme Builder and popups:** condition labels match the editor (W-294); a popup trigger link to `#` doesn't jump the page (W-285); inactivity opens once (W-279); Add trigger stops at the 8 a popup can save (W-280); floats rise above others on hover or focus and get a readable surface (W-165, W-171, W-185).
- **Loops and pagination:** a Loop or Pagination outside an archive template says it shows nothing on the live page (W-164, W-271); Pagination inside a loop item renders nothing and says where it goes (W-228); posts per page is a whole number from 1 to 50 (W-223).
- **Links and buttons:** a Button or Link with no usable URL says so, and a Link without one doesn't open a new tab (W-273, W-276); links in helper text are underlined (W-169); a full Tabs refuses a 13th panel by drop, move, paste or duplicate (W-188).
- **Playground:** panels don't link to admin screens emvb.dev doesn't have (W-289); narrow windows explain how to make room (W-291); emvb.dev has a real 404 page (W-288).
- **Lists and settings:** length fields explain units, comma decimals and a leading `+` (W-262); the settings panel keeps each tab's scroll position (W-152); the variable create row marks only the field at fault (W-281).

## [0.1.0] - 2026-10-04

The first release, published on npm as [`@perkyzz/emvb`](https://www.npmjs.com/package/@perkyzz/emvb): a visual page builder for EmDash CMS 1.0.x on Node (SQLite) and Cloudflare Workers (D1).

### Breaking

- Nothing to break yet. Layouts and the design document are stored at schema 9, and documents from earlier development builds (schema 1–8) upgrade automatically when they load. A newer schema than this version knows is refused as "saved by a newer EmVB" rather than misread.

### Added

- **Package (W-044, W-123).** Install with `npm i @perkyzz/emvb` and register `emvb()` in `astro.config`. It ships TypeScript source (no build step) and needs EmDash ^1.0.0, Astro ^7, React ^19 and Kumo 2.6.0 (EmDash 1.0.1's version, W-085). MIT licensed.
- **Setup and pages (W-006–W-008, W-010).** A setup action creates EmVB's collections; EmVB pages live in **Visual pages** in their own admin sidebar section, with create, page settings, save draft and publish. Only editors and admins can open the editor or save pages.
- **Host integration (W-011, W-057).** `resolveEmVBPage` and `<EmVBPage>` render a page in any Astro route; the Node and Cloudflare demo sites show the full setup, including theme parts and search.
- **Editor (W-009, W-014–W-021).** A full-screen editor inside the EmDash admin with a sandboxed canvas: the Add panel, a Layers tree, drag and drop into and within the canvas with valid and invalid drop feedback, keyboard arrange, duplicate and delete, and a settings panel for each element.
- **Editing tools:** copy and paste of elements and styles (W-093), undo and redo (W-095), editing plain text right on the canvas (W-097), and desktop, tablet and mobile previews.
- **Elements:**
  - layout: Container (flexbox or CSS Grid, W-099), Div Block and Flexbox (W-072);
  - content: Heading, Text, Button, Link, List and Divider (W-016);
  - media: Image with the EmDash media picker and uploads (W-024), Lucide icons (W-025), video embeds (W-026), inline SVG (W-073, W-079) and background videos (W-110);
  - interactive: CSS-only Tabs (W-074, W-078), an Accordion built on `<details>` (W-106), and Forms through the EmDash forms plugin (W-034–W-037);
  - a box can be a link unless it holds one (W-111);
  - elements of types this version doesn't know are kept on save, not dropped (W-022).
- **Styling:**
  - layout, spacing, typography, border and background properties (W-017);
  - Size, Position and Effects sections (max height, overflow, aspect ratio, object fit, offsets, z-index, opacity, box shadow, filters, cursor) and a unit selector for lengths (W-088);
  - **Hover, Focus and Active** states on elements and classes, with a state switcher and canvas preview (W-089);
  - transitions (W-089);
  - backgrounds with images, gradients and overlays (W-094);
  - per-device styles and **hide on device** (W-096);
  - one-shot **entrance animations** with delay, slide, scale and an in-view start (W-101, W-107);
  - text decoration (W-113) and custom `data-*` and `aria-*` attributes (W-105).
- **Site styles (W-028–W-032, W-071, W-087, W-100–W-104).** Colour, font, size and spacing variables with usage counts; classes in a clear priority order, applied as chips you can edit in place; tag defaults for headings, paragraphs, links and buttons; changes staged until **Publish styles**; import and export as JSON.
- **Synced sections and page templates (W-098).** Reuse one section on many pages and start pages from templates.
- **Theme Builder (W-046–W-067, W-077, W-081, W-108).** Headers, footers, Error 404, Search Results, Single Page, Single Post, Archive, Loop Item and Popups, each with display conditions. Dynamic elements (Post Title, Excerpt, Content, Featured Image, Date, Author, Link and a Loop) fill in from the post or archive. Popups open on page load, click, scroll, exit intent or inactivity.

### Accessibility

- Published EmVB pages are checked with axe for WCAG issues in a real browser (W-041).
- Keyboard focus styles use `:focus-visible`, so Focus styles show for keyboard users without flashing on clicks (W-089).
- Transitions and entrance animations are turned off for visitors who prefer reduced motion (W-089, W-101).
- Tabs and popups have full keyboard support with the right ARIA roles, focus trapping and focus return (W-078, W-091); the Theme Builder filter tabs use roving focus (W-087).
- Left and right styles are written as logical properties, so right-to-left pages lay out correctly (W-109).

### Performance

- Public pages are plain HTML and CSS. The only EmVB scripts are the optional popups, tabs and forms scripts, which load only on pages that use them.
- Render time and CSS size are kept within budgets checked in the test suite (W-040).
- Each public render is scoped, so a theme part's styles and the page's never override each other (W-112).

### Security

- Layouts and the design document are validated on every save, and invalid ones are refused (W-004, W-006).
- Text, attributes, CSS values, links and media URLs are sanitized on render; `javascript:`, `data:` and other unsafe schemes, `//host` and `/\host` links are refused (W-005, W-016, W-024, W-084).
- SVG is limited to an allowlist of safe tags and attributes (W-073, W-079).
- Video embeds use privacy-friendly domains and never autoplay (W-026).
- The editor canvas is a sandboxed iframe (W-009), and an XSS test corpus runs against the editor and published pages in a real browser (W-042).

[Unreleased]: https://github.com/PerkyZZ999/EmVB/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/PerkyZZ999/EmVB/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/PerkyZZ999/EmVB/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/PerkyZZ999/EmVB/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/PerkyZZ999/EmVB/releases/tag/v0.1.0
