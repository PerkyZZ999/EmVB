# Changelog

All notable changes to EmVB are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Each entry names its work item (W-number). "Breaking" lists layout and design schema changes: a page saved by a newer EmVB can't be opened by an older one.

## [Unreleased]

## [1.2.0] - 2026-11-13

The common widgets, the first part of a fuller Elementor import, scheduled publishing, and EmDash 1.5 as the development base. Everything is additive: new element types and options only, so pages saved by 1.1 open and save unchanged (layout schema 18, design schema 17), and an older EmVB keeps the new elements on save without showing them. Public pages still load no script unless an element opts in. It installs on stock EmDash 1.4 with no change to your site and is tested on EmDash 1.4 and 1.5. One optional step: to use dismissible Alerts, lightbox Galleries or Carousel controls inside theme parts, add `<EmVBWidgetRuntimes names={theme.runtimes} />` to your site layout once.

### Added

- **Star rating (W-1023).** A new element in Add → Content: stars filled to a rating such as 4.5 out of 5, in the element's text colour, with half and part-filled stars. Screen readers hear "Rated 4.5 out of 5" (or your own text, with {value} and {max} filled in); the accessibility check warns when custom text doesn't say the rating. No script. Elementor's Star Rating widget now imports as one, title beside it, instead of star characters. Agents can add it over MCP.
- **Alert (W-1025).** A notice in four kinds (information, success, warning, danger) with an optional title, its icon and colours that meet 7:1 contrast. "Visitors can dismiss it" adds a close button; its small script loads only on pages with such an Alert, and until it runs the button stays hidden, so it never does nothing. Closing it moves keyboard focus to what comes next. The accessibility check warns about an empty Alert. Elementor's Alert widget imports as one, dismiss included. Agents can add it over MCP.
- **Icon box (W-1020).** An icon above, before or after a title and text, from the same icon library as the Icon element. Give it a link and the whole box is clickable through one link named by its title; the icon stays silent for screen readers. No script. Elementor's Icon Box imports as one. Agents can add it over MCP. The icon picker offers Remove only where the icon is optional (a Button's).
- **Image box (W-1021).** A picture from the media library above, before or after a title and text, with required alt text (or marked decorative), loaded lazily. Beside the words it takes a quarter, 40 %, 60 % or the full width. A link makes the whole box clickable through its title. No script. Elementor's Image Box imports as one. Agents can add it over MCP; the accessibility check reads its alt text as it does an Image's.
- **Testimonial (W-1022).** A quote as a real `figure` and `blockquote`, with the name, role and an optional photo in its caption and an optional star rating read as "Rated 5 out of 5". No script. Elementor's Testimonial imports as one. Agents can add it over MCP; the accessibility check warns about an empty quote.
- **Social icons (W-1024).** A list of links to your profiles: 19 networks (Facebook, Instagram, X, LinkedIn, YouTube, TikTok, Bluesky, Mastodon, Threads, GitHub and more) plus email, RSS and a website, with Font Awesome's brand icons built in so public pages load no icon library. Each link is named for screen readers ("Instagram"); the list is a named list. Shown as icons or circle, rounded or square badges, in the text colour or each brand's colour; icons follow the font size. Add, reorder and remove links in the panel; each link opens its own settings. The accessibility check warns about a link with no address and about brand colours too faint on white (WhatsApp, Spotify, RSS, Telegram). Elementor's Social Icons import as one when every network has a preset, and as icons as before otherwise. Agents can add them over MCP. No script.
- **Gallery and lightbox (W-1019).** Pictures from the media library in a grid of squares or masonry columns (1–6 wide, fewer on tablets and phones), each with alt text and an optional caption. Turn on "Open pictures large" and a small script, loaded only on that page, makes each picture a button that opens it in a native dialog with Previous and Next (arrow keys too), a spoken "2 of 5", Close and Escape, and returns focus to the picture. Without it the gallery uses no script. Add, reorder and remove pictures in the panel. Elementor's Image Gallery and Gallery import as one, lightbox included. Agents can add it over MCP; the accessibility check reads each picture's alt text.
- **Carousel (W-1018).** Slides of any content on a track that snaps to each one: swipe, scroll or use the arrow keys, with no script. Show 1 to 4 at once (fewer on tablets and phones). Turn on Previous/Next buttons, slide buttons or autoplay and a small script, loaded only on that page, adds them. Autoplay is off unless you turn it on; then a visible Pause button comes before the slides, hovering or focusing the carousel pauses it, and it starts paused for visitors who prefer reduced motion. Slides are named "2 of 5" (or your own name) for screen readers. Add, rename and reorder slides in the panel. The accessibility check warns when slides change faster than every 5 seconds. Elementor's Image Carousel and Media Carousel import as one (they no longer become a grid), with their navigation and looping; autoplay only when the widget asked for it. Agents can add it over MCP.
- **Elementor import, part 1 (W-1026).** Besides the widgets above (Star Rating, Alert, Icon Box, Image Box, Testimonial, Social Icons, Image Gallery and Gallery, Image and Media Carousel now import as their EmVB elements), Elementor's Sticky setting comes over as CSS sticky with its edge, offset and devices, instead of being dropped. A Nav Menu is filled with the links of the site menu of the same name, as EmDash's WordPress import brings it over (links to pages and posts go to their addresses here); only when the site has no such menu does it stay empty, with a note.
- **Schedule publishing from the editor (W-1027).** A calendar button beside Publish picks the date and time (your time zone is shown) when EmDash publishes the page or theme part by itself. Unsaved changes are saved first; until then visitors see what is live now. The top bar says "Publishes 14 Nov 2026, 09:00", and the same button changes or cancels it. Uses EmDash's own scheduling (1.4 and 1.5).
- **Widget scripts load themselves (W-1025).** `EmVBPage` now mounts the opt-in scripts of the 1.2 widgets a page uses, so pages need no change. For theme parts, add `<EmVBWidgetRuntimes names={theme.runtimes} />` (from `@perkyzz/emvb/astro/widgets`) to your site layout once. The HTML/CSS export writes the same scripts next to the pages that use them.

### Changed

- **Developed on EmDash 1.5, still installs on 1.4 (W-1008).** EmVB is now built and tested day to day on EmDash 1.5.0 with Astro 7.4. Every change is also tested on EmDash 1.4.0 in CI, and each release is installed on a stock 1.4 and 1.5 site, so 1.4 sites keep working with no change.
- **EmVB shares your site's zod (W-1007).** EmVB depended on zod `~4.5.4`, matching EmDash 1.4; with EmDash 1.5 (zod 4.6.7) that installed a second copy. It now takes any zod 4 from 4.5.4 up, so it uses the one EmDash brings. CI checks it on EmDash 1.5 with zod 4.6.7, where `bun audit` reports nothing.
- **Tests hold on EmDash 1.5's Kumo (W-1009).** EmVB's admin snapshot tests recorded Kumo's own markup, so the 56 that differed under Kumo 2.15 (attribute order, wrappers, tab scroll buttons) had to be rewritten for EmDash 1.5. They now record EmVB's own markup only, and the whole unit suite passes unchanged on EmDash 1.4 and 1.5.
- **Upgrading a site from EmDash 1.4 to 1.5 keeps your EmVB data (W-1004).** Checked on Node (SQLite) and Cloudflare (local D1): Site styles, published pages, uploaded icons, agent settings and requests carry over EmDash 1.5's migrations, and new pages save. The install guide says how to upgrade.
- **EmVB has a name on EmDash 1.5's plugins screen (W-1005).** It shows as "EmVB" with a one-line description there; EmDash 1.4 ignores both.
- **Convert to EmVB and Convert to rich text work with EmDash 1.5 co-editing (W-1006).** Checked on an entry open in a co-editing room: the converted content is kept through the room's autosave and saves.

## [1.1.2] - 2026-11-13

The rest of the 1.1.0 security audit. No schema change: pages and designs saved by 1.1.1 open and save unchanged, and the new options are off unless you set them. It installs on EmDash 1.4 with no change to your site and is tested on EmDash 1.5. Three behaviour changes to check: on a plain Node host, Visitors country rules no longer read the country headers unless you add `emvb({ trustGeoHeaders: true })` (Cloudflare and Vercel are unaffected); `emvb-mcp` refuses a token file other users can read; and Export pages leaves links to files (a PDF link) as links instead of copying them.

### Security

- **`describe_page` no longer connects where the request's Host header points (W-995, S-05).** Its required-form-field warnings read the forms plugin's definitions over HTTP from an address built from the request, following redirects, so on a host that forwards any Host header an editor token could make the site send requests to a server of the caller's choosing. It now uses only the site URL from EmDash's settings and follows no redirect; without a site URL set, `describe_page` skips those warnings. The AI agents page shows the MCP endpoint on the same configured address (or on the address you opened the admin with).
- **Export pages copies media files only (W-996, S-06).** With **Copy images and files**, the export downloaded any same-origin URL that looked like media, links included, with your session cookie, and wrote the answer into the zip. An editor could plant a link such as `/_emdash/api/admin/users?x=.png`, and an admin's export then carried that admin-only answer into a public zip. Now only images, video, posters and CSS backgrounds count; the file type is read from the path, not the query; nothing under `/_emdash/` is copied except media-library files; only image, video, audio, font and PDF answers are kept; and only media-library downloads send the session cookie. A link to a PDF stays a link to the live site.
- **The layout role check covers every collection with an EmVB field (W-997, S-08).** A collection with an `emvb:canvas` field was protected only when it was also listed in `emvb({ canvasCollections })`; on a site that rendered the field but forgot the option, any role allowed to save the entry could write its layout. Now every collection with such a field is checked on save, listed or not: below editor, the field must stay as stored, and a layout must be valid. The list is still worth setting (the editor and the Collections page use it).
- **Agent requests, editor presence and proposals are kept in bounds (W-998, S-09).** A request or an editor's "page is open" lease may name only an existing EmVB page or theme part, or an entry of a collection with an EmVB field; any made-up target was accepted and stored. Expired requests are now deleted as new ones come in, one person can have at most 20 requests waiting across the site (and still five per page), and an agent can withdraw only proposals its own person made (an admin's agent, any; proposals from before 1.1.2 stay open to all, and the person editing still accepts or rejects any of them in the editor).
- **Visitors country rules can't be steered by a visitor off Cloudflare and Vercel (W-999, S-10).** EmVB took the country from the `cf-ipcountry` and `x-vercel-ip-country` request headers everywhere, so on a plain Node host a visitor could send any country and see content meant for another. These headers now count only on Cloudflare Workers and Vercel, whose edge sets them (Cloudflare's `request.cf` still counts too). Behind a proxy of your own that sets one of them, add `emvb({ trustGeoHeaders: true })`; `false` turns them off everywhere. The install guide now says plainly that Visitors rules are presentation, not access control.
- **Choose which collections Loops may list (W-1000, S-11).** A Loop can list the published entries of any collection, with fields the editor picks. Sites that keep a collection published but not meant for listing can now name the allowed ones: `emvb({ loopCollections: ["posts"] })`; a Loop on another collection renders empty. Without the option nothing changes.
- **emvb-mcp keeps its token to itself (W-1001, S-12).** A token file other users of the computer can read is now refused, like ssh refuses a loose key (`chmod 600` it, or pass `--allow-loose-token-file` to use it with a warning as before), and the bridge no longer follows a redirect from the site, which would have carried the token to another address.
- **Smaller public surface (W-1001, S-12).** The public `health` check no longer tells the exact EmVB version (editors read it from the new `version` route), and EmVB now requires EmDash 1.4 or later (`>=1.4.0 <2`): its role checks were never tested on 1.0 to 1.3.
- **CSS ids can't shadow browser globals (W-1001, S-12).** An element's CSS id such as `location`, `document` or `name` became a property of `window` and `document`, which can mislead scripts on your site (DOM clobbering). The editor now refuses those ids, and a page that already has one renders without it; the page still opens and saves. `top` stays allowed, since `#top` links are common.

### Changed

- **Tested on EmDash 1.5 in CI (W-1002).** Every push runs the unit tests on EmDash 1.5.0 (with its Kumo 2.15.0) as well as 1.4.

### Fixed

- **Editors get the site's styles in the canvas (W-1001).** The `editor/config` route had no permission, so EmDash kept it to administrators and an editor's canvas loaded without the `canvasStyles` and extensions; editors can read it now.

## [1.1.1] - 2026-11-12

A security patch from an audit of 1.1.0. Update if editors, contributors or agents you don't fully trust can reach your site, and before anyone runs `emvb-mcp watch`. No schema change: pages and designs saved by 1.1.0 open and save unchanged. It installs on EmDash 1.4 with no change to your site and works with EmDash 1.5. One behaviour change: a request written in the editor's Agent tab now goes only to its author's own agent.

### Security

- **A request in the Agent tab reaches only its author's agent (W-990, S-01, high).** `get_requests` returned every editor's open requests to whoever called it, so `emvb-mcp watch` fed another person's text to your local agent as if you had written it, with your files, tools and token in reach. A request is now private to its author: only an agent using that person's API token receives, answers or lists it (a request saved without an author goes to nobody), and only the author or an admin can cancel it. A request's page id must be an EmDash id. `watch` quotes the request between tags with a random name and removes any copy of them from the text, skips a request whose ids aren't ids, and no longer passes `EMVB_TOKEN` to the agent (`--pass-token` to opt in). Run `watch` with an agent limited to the EmVB MCP tools, with no shell or file tools (bridge README). Behaviour change: a shared agent no longer answers other people's requests.
- **An SVG with a mask no longer takes a page down (W-987, S-02).** The SVG sanitizer kept the `mask` attribute but the HTML serializer refused it, so a saved SVG or icon with `mask="url(#…)"` made its page answer 500 (every page, when it sat in a header, footer or popup part), and `icons/upload` failed on such a file. `mask` now renders. Rendering also fails soft: markup the serializer refuses empties only the element that holds it, a stored layout that can't render gives an empty page instead of an error, and a theme part that fails is left out while the rest of the site renders. Each is logged with ids only.
- **A crafted layout can't exhaust the server's memory (W-989, S-03).** Validation made one issue per bad array item before checking the array's length, and every element passed all of its issues up to its parent: a 512 KB layout held 180 to 260 MB while being refused, enough to stop a Cloudflare Worker. Every bounded array in layouts, designs, conditions and triggers now checks its length first; an element reports ten issues and then how many more, a list of children stops after about forty, and a validation returns at most fifty. The same documents now take under 10 MB and a few milliseconds. A single bad item still gets the same path and message, and no saved page is refused that 1.1.0 accepted.
- **Co-editing on EmDash 1.5 can't slip a contributor's layout past the role check (W-991, S-04).** EmDash 1.5's real-time co-editing saves a room's changes as one person and lists everyone who took part in `editedBy`; EmVB only checked the person saving. It now checks each of them too: a save with a contributor (or anyone EmVB can't look up) in the room is refused for EmVB pages and theme parts, and leaves an `emvb:canvas` field as stored. EmVB asks for EmDash's `users:read` capability for this (no change to your site). On EmDash 1.4, which has no co-editing, nothing changes.
- **Uploading a crafted SVG can't hold the server (W-988, S-07).** The cleanup of uploaded SVGs (prolog, comments, doctype, metadata, titles, editor elements) used lazy patterns that rescanned to the end of the file for every unclosed opener: one 256 KB `icons/upload` request took up to 9 s of CPU. It now reads the file left to right, so a crafted file costs milliseconds, and a file where a tag, comment or declaration never closes is refused as not well formed. Well-formed files are cleaned exactly as before (41,675 SVG files compared byte for byte).

### Fixed

- **Installs on EmDash 1.5 (W-993).** EmDash 1.5.0 pins Kumo 2.15.0, and EmVB's Kumo peer named only 1.4's 2.6.0, so `npm install @perkyzz/emvb` stopped with a dependency conflict on a new 1.5 site (1.1.0 too). The peer is now `2.6.0 || 2.15.0`: the exact Kumo of each supported EmDash, so there is still one copy. Checked on a fresh EmDash 1.5.0 site: it installs, type-checks and runs the editor and public pages.
- **Picking a form field on EmDash 1.5 (W-994).** With EmDash 1.5's Kumo 2.15, choosing a field in a form field's **Field** list after typing a name that isn't one of the form's fields could pick the neighbouring field (the list's "Choose a field…" entry came and went, and Kumo 2.15 picks by position). The entry now stays in the list, greyed out once a field is chosen.

### Known issues

- On EmDash 1.5 (Kumo 2.15) some admin markup differs from 1.4 (attribute order, scroll buttons on long tab rows); it looks and works the same. EmVB's own markup snapshot tests are recorded on 1.4; 1.2 adds a 1.5 test run.

## [1.1.0] - 2026-11-11

A minor release: everything is additive and 1.0 pages open unchanged. Leave EmVB whenever you like (export pages and your own entries as HTML or rich text), a Wide screen device, search by content and bulk actions in the lists, measured performance on large pages, and the fixes below.

### Fixed

- **Tab stays inside EmVB's dialogs (W-984).** In the image editor, Export pages and every other EmVB dialog, a quick Tab past the last control could leave the dialog for the page behind (the dialog library moves focus back one frame later). Tab and Shift+Tab now wrap from the last control to the first and back.
- **Laptop fixes (W-959).** The Style panel said "Editing Tablet" while editing Laptop; each device now names itself and what it overrides. An Elementor boxed container's Laptop layout values (direction, gap, alignment) were dropped on import; they are kept.
- **Style source chip contrast (W-976).** The active chip in the Style panel's style sources (such as **Local**) had white text at 4.48:1 on the brand blue, just under WCAG AA. Its background is now a little darker (over 4.5:1, light and dark).

### Added

- **Search by content and bulk actions in the lists (W-978).** The Pages and Theme Builder searches also find the words on a page or part (headings, text, buttons, list items, alt text) and say "Found in content" with the matching words. Tick rows (or all shown) to **Publish**, **Delete** or, on Pages, **Export** them together. Delete asks first and moves them to EmDash's trash, with **Restore** right after; an item that can't be changed is named and the rest go on. Deleting a synced section or loop item that pages still use says where first (W-982).
- **Export entries as HTML (W-977).** Entries in your own collections that have an EmVB layout export as HTML and CSS too: choose the collection under **Export from** in **Export pages** (all published entries with a layout, or one), or click **Export HTML** on an entry's Canvas card. Each entry comes with the header, footer, popups and floats that show on its page, at its address on your site (its collection's URL pattern, or `/<collection>/<slug>` without one, W-981).
- **Wide screen device (W-959).** A Wide screen device (2400 px and up, Elementor's widescreen) sits above Desktop in the device bar, the command palette and Preview (on a screen at least 2400 px wide). Its styles build on Desktop's, for elements and classes. It hides with Desktop unless you set its own Hide, which can also show on wide screens what Desktop hides. The Elementor import keeps widescreen values and Hide on widescreen instead of folding them into Desktop. They are stored in the element's style as `wide`, so EmVB 1.0 still opens the page and shows its Desktop look on wide screens.
- **dvh and svh (W-974).** Height, Min height and Max height take `dvh` (dynamic viewport height) and `svh` (small viewport height), so a full-height section fits a phone screen with its browser bars. They are stored as `vh` with a new optional `viewportUnits` mark, so EmVB 1.0 still opens the page and draws it in `vh`.

- **Export pages (W-963).** **Export pages** on the Pages list takes your published pages (all of them, or one) elsewhere, as either:
  - **HTML and CSS files:** a zip you can host anywhere, each page in its own folder with the header, footer, popups and floats it shows, the small popup, tabs, menu and float scripts only where a page uses them, an index of the pages and a report. Images and files your site serves can be copied in, and the pages then point at the copies. Loops, bound fields, audience rules and forms need the live site, so the report lists where they appear.
  - **Rich text in a collection:** a draft entry per page in one of your collections (any with a rich-text field), holding the page's words, headings, lists, links and images. Nothing is published.

  Drafts are not exported, and your EmVB pages are not changed.

- **Docs on emvb.dev (W-964).** The project site gains a Docs section: every guide, the schema contract and the Extensions API reference, built from the repository's own docs so they can't drift, with an index grouped by topic, a search box, a sidebar and an on-this-page list. It goes live with this release.
- **Convert to rich text (W-963).** On an entry in your own collections, **Convert to rich text** copies the layout's words, headings, lists, links and images into the entry's rich-text field (the reverse of Convert to EmVB). A confirm first says how many blocks go in, what is left out (forms, icons, embeds) and whether it replaces what the field holds. The layout itself isn't changed; clear it and save the entry to show the rich text on your site.

### Changed

- **Performance on large pages, measured (W-979).** A new guide, [Performance on large pages](docs/guides/performance.md), gives what a page of up to 2,000 elements costs: about 17 ms to render on the server and 17 KB of HTML and CSS gzipped, and in the editor about 0.5 s to open and under 100 ms per edit (production build). The closed Accessibility dialog no longer builds its issue list on every edit.
- **The 1.x promise, clarified (W-971, W-975).** A 1.x page keeps its look and behaviour on every later 1.x; its HTML and CSS bytes may improve for accessibility and page size ([docs/SCHEMA.md](docs/SCHEMA.md)). Each such change is listed here and checked by comparing screenshots of the saved pages.
- **Tabs markup (W-975).** The tab role moved from the `<label>` (where ARIA allows no role, axe `aria-allowed-role`) to a `<span class="emvb-tab">` inside it. Tabs look and work the same, with and without the tabs script; the script also still handles pages rendered by 1.0. Hosts with CSS for `.emvb-tab-label[aria-selected]` should use `.emvb-tab[aria-selected]`.
- **Smaller theme CSS (W-971).** The header, footer, popups and floats on a page each repeated the same element base rules, scope rule and print rules in `resolveThemeParts().css`; they are now written once for all of them. Pages look and behave the same (screenshots compared pixel for pixel); each part's own `css` is unchanged.
- **Page weight and the version timeline (W-973).** The page weight meter counts the images and embeds of one arm of an A/B test (the heavier), not both, since a visitor sees one. The version timeline lists **Page styles** when a version changed the page's own styles or settings, with **Restore page styles**.
- **My uploads holds 500 icons, without duplicates (W-972).** The icon library's My uploads now holds up to 500 SVGs (was 100), and the server recognises the same drawing uploaded again (also from two tabs at once) and keeps one icon.
- **Unpublished synced sections are marked (W-970).** The canvas draws a synced section or Loop item from its latest saved version. When that isn't what visitors see, its canvas label says "unpublished changes" or "not published", and its settings explain that visitors see the published version (or nothing) until it is published in Theme Builder.
- **Inherited shadows, entrance and transition (W-969).** On Laptop, Tablet, Mobile or a state, an unset Box shadow, Drop shadow, Entrance or Transition that the element inherits (from a wider device, Normal, a class or the Site styles default) now says what it inherits, and **Edit here** starts from that value instead of the default.
- **Post title in a Loop starts as H2 (W-968).** A Post title added inside a Loop (or in a loop item part) is a level 2 heading, so a grid of cards no longer has one H1 per post. A level you choose is kept.

## [1.0.0] - 2026-11-09

EmVB 1.0: the stored page format is frozen for 1.x ([docs/SCHEMA.md](docs/SCHEMA.md)), AI agents co-design pages through reviewable proposals, sites can add their own elements and panels (Extensions API), pages can have one version per language, any element can loop, pages and templates import from Elementor (3 and 4), and the editor gains inline text formatting, fluid sizes, transforms, flex item sizing, list markers and numbered steps, gradient overlays and more style settings. Upgrading from 0.9: see the [upgrade guide](docs/guides/upgrade-1.0.md); 0.9 pages upgrade on read, and EmVB's AI tools need approving again on EmDash's Plugins screen.

### Added

- **Numbered steps drawn by site CSS (W-961).** Elementor sites that number separate paragraphs with a CSS counter (`.step::before { content: counter(step) }`) now import them as one numbered List, with the counter's style (numbers, letters, Roman numerals) and the first step's look. The import report lists it so you can check the spacing.
- **Laptop device (W-956).** The device bar, Preview and the command palette have **Laptop** (1025 to 1366 px) between Desktop and Tablet: style an element or class for laptops, hide it there, and Tablet and Mobile inherit what you set. Elementor imports keep laptop values. New `devices.laptop` and `hiddenOn: "laptop"` in the 1.0 schema. Pages saved by 0.9 that hide something on Desktop keep hiding it on laptops, with the same CSS. Grid column counts have no laptop value (laptops use the desktop columns).
- **Inline text formatting (W-950).** Make words inside a Heading or Text **bold**, _italic_, coloured or a link: select them in the Text field and use **Formatting** (Bold, Italic, Color, Link, Clear; each formatted part is listed with Remove). The text stays plain and the formatting follows the words as you edit. Elementor imports keep bold, italic, coloured and linked words, including colours the site's CSS gives emphasised words. New optional `marks` on Heading and Text in the 1.0 schema; pages without them render exactly as before.
- **Elementor import: page links, image copies and classes (W-958).** Links to pages on your old site become this site's paths, and Elementor 4 links to WordPress pages by number get an address under **Page links** (remembered for the next import). **Copy images** puts the page's old-site images in your media library (or **Add image files**), and the page uses the copies. **Add Elementor's classes to my site's classes** (off by default) keeps Elementor 4 global classes as Site styles classes, with elements keeping only what differs; an existing class is never changed (identical ones reused, clashes added as numbered copies).
- **Fluid sizes (W-955).** Type a range such as `32–56` in Font size, Gap, a width or height, Padding or Margin, and the size grows from 32 px on phones to 56 px on large screens (a `clamp()`, the same formula as the design's fluid sizes). Elementor's `max(A, min(B, …))` and `clamp()` sizes now import exactly. New value `{ "fluid": { "min", "max" } }` for those keys in the 1.0 schema.
- **Recolourable SVG files in Elementor imports (W-951).** SVG icons and Elementor 4 SVG elements import as Icons that keep their own drawing, so colours you set reach the parts drawn in `currentColor`. The import dialog can **Fetch SVG files** from your old site or take them with **Add SVG files** (matched by file name). SVGs an export names only by their WordPress media number become empty Icons at their size, listed in the report, instead of disappearing.
- **List markers and numbered steps (W-952).** A List has **Marker** (disc, circle, square, numbers, letters, Roman numerals, or **Steps**: each number in a circle) and **Start at**; Typography has **Marker color** and **Marker size** for lists. Number styles make the list numbered. Imported `<ol start>` keeps its first number. New list props `marker`, `start` and style keys `markerColor`, `markerSize` in the 1.0 schema; pages that don't use them render exactly as before.
- **Flex item sizing (W-954).** Inside a Flexbox or Container, any element can **Grow** into free space, **Shrink** when space is short and start from a **Basis** size (Size section), and set its own **Align self** and **Order** (Position section). New style keys `flexGrow`, `flexShrink`, `flexBasis`, `alignSelf` and `order` in the 1.0 schema.
- **Transforms and hover lift (W-953).** Effects has **Transform**: move, scale and rotate an element. In the Hover state it makes cards lift or arrows nudge, and Transition has a **Transform** choice to animate it. It works alongside entrance, scroll and loop motion. New style key `transform` in the 1.0 schema.
- **Gradient overlays (W-949).** An image or video background's **Overlay** can be a gradient as well as a colour: a scrim that is dark behind the text and clear over the picture. Its opacity fades every stop. `overlay` takes `{ gradient, opacity? }` in the 1.0 schema.
- **More style settings (W-957).** Typography has **Style** (italic), **Line wrapping** and **Long words**; Size has **Overflow X** and **Overflow Y**, and on images and videos **Object position**; Effects has **Backdrop filters** (blur, brightness and the rest applied to what is behind the element, for frosted glass). New optional style keys `fontStyle`, `whiteSpace`, `overflowWrap`, `overflowX`, `overflowY`, `objectPosition` and `backdropFilter` in the 1.0 schema.
- **Import from Elementor (W-945).** Pages VisualBuilder and Theme Builder have **Import from Elementor**: choose an Elementor template export (or paste `_elementor_data`), optionally add the site kit for exact global colours and fonts, read the report of what is kept, approximated or left out, then get a draft page or theme part (headers, footers, popups and single templates map to their EmVB types). Containers, legacy sections and columns and the core widgets map with Elementor's own defaults, including tablet and mobile values; Pro widgets, dynamic tags, custom CSS and third-party widgets are best effort. Elementor 4 pages (Flexbox, Div Block and the other atomic elements) import with their global classes and variables applied to each element, per device and state; the site's own design is never changed. Checked against a real Elementor 4.3 site. See the [Elementor import guide](docs/guides/elementor-import.md).
- **Guides (W-940):** [Co-design with an AI agent](docs/guides/co-design.md), [Languages](docs/guides/languages.md), [Motion](docs/guides/motion.md) and [Extensions](docs/guides/extensions.md), linked from the README.
- **Loops (W-938, W-939).** Effects → **Loop** makes any element float, pulse, breathe, wiggle, drift or spin, or move the way you set it: the same effects as scroll motion (opacity, move, scale, rotate, blur), each with two ends, a duration and an easing, back and forth or one way. Plain CSS, no script. Like an icon's spin it stops after about 5 seconds unless **Loop forever** is on, and visitors who prefer reduced motion see it still; the accessibility check flags loops that never stop. New key `style.motion.loop` in the 1.0 schema.
- **Language switcher element (W-937).** Links the page's other published languages, each in its own name with `hreflang` and `lang`, the current one marked; drafts are never linked, and a page in one language shows nothing. Works in headers and footers (`resolveThemeParts(..., { translations })`). `resolveEmVBPage` returns the page's `translations`; `translationHref` sets where they live. New element type `language-switcher` in the 1.0 schema.
- **Translate this page (W-936).** On sites with several languages, Page settings has a **Languages** section: each language shows as this page, an existing translation to open, or **Translate**, which creates a linked draft in that language with a copy of the layout (EmDash's `translationOf`) and opens it. Optionally it asks your agent to translate the words; you review its proposal in the new page's Agent tab.
- **Per-language pages (W-935, D-068).** `resolveEmVBPage` reads the translation for `Astro.currentLocale` (or a `locale` option) and reports `locale` and, when EmDash served another language from its fallback chain, `fallbackLocale`. Each language keeps its own layout in EmDash's own translation entries. Both demos now have English at `/` and French at `/fr/`. See the install guide's Languages section.
- **`emvb-mcp watch` (W-934).** `npx @perkyzz/emvb-mcp watch --site … --agent "claude -p"` checks for requests people wrote in the editor's Agent tab and runs your agent command once per request: the request goes to the command's stdin in a brief that says how to answer, never into the command line. One request at a time, each once; unanswered ones are logged. Also fixes the bridge README's tool count (25, or 27 with `--allow-publish`).
- **Agent setup checklist (W-932).** The AI agents page starts with a Setup card that checks the site itself: whether EmDash's MCP endpoint is on, whether EmVB's tools are approved on EmDash's Plugins screen and have been used since this version (EmDash quietly hides them after an update changes the tool list until an admin approves them again; the card says when that may be the case), whether agent access is on, and where to make a `mcp:tools:emvb` token. EmVB never reads or shows tokens.
- **Ask your agent from the editor (W-931, D-063).** The Agent tab has an **Ask your agent** box. A request waits until your own agent (Claude, Cursor or any MCP client) reads it with the new `get_requests` tool and answers with `propose_changes` and the request's id; the request then shows Answered and its proposal waits below for review. The tab says when an agent last checked. Nothing runs on the site and no model key is stored.
- **Review agent proposals in the editor (W-930, D-064, D-067).** A new **Agent** tab lists the changes an AI agent proposed for the page, grouped as Added, Changed, Moved, Removed and Site styles, each with Accept and Reject, plus Accept all and Reject all. **Preview** shows the pending changes on the canvas without applying them: new elements outlined in blue, changed ones dashed, removed ones struck through. Accepted page changes are normal edits that Undo takes back; Save draft makes a normal version, marked **Via agent** in the version timeline. A proposal made before the page was last saved says so instead of applying. The tab checks for new proposals every 5 seconds while the editor is open.
- **Agents propose changes for review (W-929, D-064).** Four new MCP tools: `list_page_outline` (a compact tree, the revisions a proposal must name, whether the page is open in the editor and the proposals waiting), `propose_changes`, `get_proposal` and `withdraw_proposal`. A proposal is checked against the current page and stored; nothing is saved or published until a person accepts it (the review panel is W-930). While someone has a page open in the EmVB editor, agent tools that write that page refuse with the new error code `PAGE_OPEN` and point to `propose_changes`; the editor renews this every 30 seconds and a closed tab frees the page at once. The bridge's agent skill explains both.
- **Co-design proposal storage (W-928).** Reviewable, versioned agent change sets now have plugin storage, ordered element/class/variable operations, server-side validation and size limits, stale-revision refusals with rebase guidance, and pure all-or-selected-operation previews. Proposals cannot save or publish pages. Agent tools and editor review UI follow separately.
- **Extensions API v1 (W-927, D-066).** Site owners register packages with `emvb({ extensions: [...] })` at build time: custom elements (declarative schema + Kumo fields + render-to-nodes), editor panels (Kumo slot, no global CSS), and read-only data sources. Stored types are `ext:<pkg>/<name>`; a missing extension shows a placeholder and leaves the page valid. See [docs/EXTENSIONS.md](docs/EXTENSIONS.md) for the contract and 1.x freeze/deprecation policy. Sample package: [`examples/emvb-ext-hello`](examples/emvb-ext-hello).
- **Schema contract 1.0 (W-925, D-065).** [docs/SCHEMA.md](docs/SCHEMA.md) describes the stored formats EmVB keeps stable through 1.x. JSON Schema exports are in [docs/schema/](docs/schema/), generated by `bun scripts/export-json-schema.ts`. `CONTRACT_VERSION` is `"1.0"`.
- **Unknown keys are kept (D-065).** A key EmVB does not know, on an element, its props or a style record, is stored untouched and never rendered. This lets a page saved by a newer 1.x open and save without losing anything. A key must have a plain name, there are at most 32 in one place, and a value nests at most 16 levels.
- **Compatibility suite (W-926).** `bun run check` now renders a corpus of stored pages from every release, 0.1.0 to 0.9.0, and fails if any is rejected or its HTML or CSS differs from what 0.9.0 rendered. The corpus uses every element type and every style key.

### Changed

- **Faster full e2e for contributors (W-960).** `bun run e2e:full` runs the whole e2e suite on both demos at once, starting each demo server once instead of once per file: about 17 minutes instead of about 100. Each platform keeps its own results folder; traces are off unless you pass `--trace on`.

- **No Astro pin for host sites (D-058 amended).** EmVB works on the Astro version a stock EmDash 1.4 site installs (verified on 7.4.7 and 7.4.8, node and Cloudflare). The advice to hold `astro` at 7.3.5 is gone from the READMEs and guides.
- **Clearer names, upgraded automatically (W-925).** The Theme section element is now type `part-ref` (was `section`). An element's editor name is `editorLabel` (was `label`). A Loop's item part is `props.partId` (was `itemPartId`). Pages, the editor, the MCP tools and saved sections still accept the old names and upgrade them.
- **Motion in one place (W-925).** `transition`, `entrance`, `scrollMotion` and `iconAnimation` now live under `style.motion` as `transition`, `entrance`, `scroll` and `icon`. The HTML and CSS are byte-identical to 0.9.0's.

### Security

- **Agent proposals reviewed for safety (W-933).** A red-team corpus (script links in nine spellings, unsafe image and SVG sources, CSS and font-stack break-outs, event-handler attributes, unknown and missing-extension elements, prototype keys, oversized and deeply nested proposals, prompt-injected and markup text) runs every case through `propose_changes` and the matching direct-write tool: both refuse it, and text that is only content renders inert. Fixed on the way: a proposal could add an element of an extension the site doesn't have. A page now holds at most 10 waiting proposals, so one agent can't fill the site's store. The agent log records the proposal id and change count, and the person's review (how many accepted and rejected). Review lines drop invisible direction-override characters that could disguise a change.
- **Oversized lists in agent and editor requests are refused before they're read item by item (D-070).** With the zod version EmDash 1.4 ships, a large list of bad items in a request could take hundreds of megabytes to refuse. Lists in EmVB's request inputs now check their length first. Nothing changes for EmDash hosts.

### Fixed

- **Heading level (W-946).** A Heading added by clicking it in the Add panel or the command palette now becomes the page's H1 when the page has none, as a dragged one already did. In a header, footer, popup, float, synced section or loop item a new Heading stays H2, so the part no longer adds a second H1 to the pages it lands on.

### Breaking

- **Layout schema 18 and design schema 17 (W-925).** Every older page and design upgrades on read. A page or design saved by this version can't be opened by 0.9.0 or earlier.

## [0.9.0] - 2026-10-29

EmVB layouts on your own collections, EmDash 1.4.0, and nine smaller additions (W-896 to W-920). Layout schema 17 and design schema 16, unchanged: 0.9.0 reads every 0.8.0 page, and the new props are optional, so 0.8.0 opens pages that don't use them.

### Added

- **Your own pages (W-897 to W-902, D-061).** `emvb({ canvasCollections: [...] })` lets entries in your collections hold an EmVB layout in an `emvb:canvas` JSON field. **Edit with EmVB** on the entry form opens the editor; **Apply** writes the layout back and the entry's own Save and Publish store it. `resolveEmVBPage(Astro, { collection, field })` renders it. Saves are validated on the server, and only editors and administrators can change the field. See the [native page editing guide](docs/guides/native-page-editing.md).
- **Preview in field mode (W-911).** See the unsaved layout at Desktop, Tablet and Mobile widths in a sandboxed window, in your site's styles (W-920).
- **Convert to EmVB (W-912).** Start a layout from an entry's rich-text body (headings, paragraphs, lists, images); the body is never changed.
- **Host collections (W-913).** An admin page that adds the canvas field to a collection and shows the exact `canvasCollections` line for astro.config.
- **Text direction (W-914).** Left to right or Right to left per element, in Advanced.
- **Responsive library images (W-915).** Pass `getImage` from `astro:assets` to `resolveEmVBPage` and library images get a `srcset`; a newly picked library image takes its EmDash focal point.
- **Page N of M and a Last link (W-916, D-062).** Pagination's Show Last link, with its own text and screen reader name. Totals come from an opt-in count (`resolveThemeParts(..., { pageCount: true })`), off by default.
- **Font size in vh (W-910).**

### Changed

- **EmDash 1.4.0 (W-908).** Built and tested on EmDash 1.4.0; the peer range stays `emdash` ^1.0.0, and Astro stays at 7.3.5 (D-058).
- **Field card (W-904).** The Canvas card shows an element summary and outline, and a read-only state for authors.
- **Versions.** `@perkyzz/emvb`, `@perkyzz/emvb-mcp` and `@perkyzz/emvb-icons` are all 0.9.0 (the icons are unchanged since 0.2.0).

### Fixed

- **Editor top bar.** The active device tab keeps its contrast in the dark theme (W-905) and switching device no longer fades through white.
- **Media library.** Libraries start loading as they open, fixing a race when one was reopened quickly (W-906).
- **Preview frame (W-920).** It now uses the site's stylesheets and has no stray margin, and a wide frame scrolls instead of being cut off on the left.

## [0.8.0] - 2026-10-21

Saved sections, a Loop forever switch for icon animations, image editor Recipe and Zoom, five behaviour decisions (D-053 to D-057) and dependency updates (W-844 to W-885). Layout schema 17 and design schema 16: the steps change nothing, so 0.8.0 reads every 0.7.0 page, and 0.7.0 shows a page or class that uses Loop forever as "saved by a newer EmVB" instead of invalid.

### Added

- **Saved sections (W-874 to W-877, D-060).** "Save as section…" in a layer's ··· menu or the command palette saves an element and everything inside it under a name. **Copy** adds it to **My sections** in the Add panel (search, rename, delete), and inserting gives an independent copy; **Synced** makes a Section theme part and links the element to it. A saved section brings its classes along: a missing class is recreated, the same class is reused, and one whose look differs is added as "Card 2", so an existing class is never changed. The palette inserts saved sections too. MCP tools `list_saved_sections`, `save_section`, `insert_saved_section` and `delete_saved_section`; the `emvb-page-builder` skill uses them. Old saves are upgraded when read.
- **Loop forever (W-853, D-059).** Spin and Pulse have a "Loop forever" switch, off by default, for a loading spinner. Reduced motion still turns it off, and the accessibility check flags a looping icon, including one set by a class (W-882).
- **Image editor Recipe (W-862, W-881, W-884).** Download the current edits as a `.recipe.json` file and load one back (ours or a bare photocn recipe), also from the phone layout's More menu. Bad, oversized or unappliable files say why.
- **Image editor Zoom (W-861).** Zoom out, Zoom in and Fit to screen at the stage's bottom right, 100% to 800%.

### Changed

- **Bars, print and popups (D-053 to D-055).** A tall top or bottom bar is capped at half the screen and scrolls inside (W-844); printing shows every tab and accordion panel (W-845); a click trigger always opens its popup and isn't counted against its show limit (W-846).
- **Menus on phones (W-847, D-056).** Column menu flyouts open below their item under 768 px.
- **Icon animations stop on their own (W-848, D-057).** A spin or pulse runs as many whole times as fit in about 5 seconds unless Loop forever is on.
- **Editor look.** Sentence-case element names (Div block, Post title, Loop item…) and Theme Builder tabs (W-857, W-866); Kumo inputs and checkboxes in the Visitors and Scales editors (W-865); key boxes in the Shortcuts dialog (W-864); tool tooltips in the image editor (W-860); Theme Builder tab-row edge fades in every browser (W-863).
- **Dependencies (W-850, W-852, D-058).** EmDash 1.3.1 and the forms plugin 0.2.11, React 19.3.1, happy-dom 21 for tests, Lucide 1.61 (2,171 icons) and `@perkyzz/emvb-icons` 0.2.0. Astro is supported up to 7.3.5 until EmDash moves its zod pin.

### Fixed

- **Saved sections.** An agent insert with a stale rev no longer adds classes before refusing (W-879); Synced on an element a Theme section can't wrap no longer leaves a stray theme part (W-880); focus stays put after rename, after deleting the last search match (W-878) and after closing Save as section (W-883).
- **Focus.** The inline delete confirmation and the Import confirmation take focus (W-849, W-854).
- **Image editor.** The active tab underline no longer runs through the tab label (W-872).

## [0.7.0] - 2026-10-21

About 470 changes from overnight testing and a full pass over the editor's look since 0.6.0 (UX-001 to UX-095, W-532 to W-841). This includes the 0.6.5 changes, which were never published to npm. No schema change: pages saved by 0.7.0 open in 0.6.0.

### Added

- **Undo and Redo in the top bar (UX-084).** Buttons next to Save draft; Ctrl/Cmd+Y also redoes and the Shortcuts dialog lists it and F2 rename (UX-085, W-775).
- **Empty page start (UX-019, UX-086).** An empty page or theme part fills the canvas and says how to start; pages saved without a layout save and accept new elements (UX-094, UX-095).
- **Meta description count (UX-021).** A roomier field with a live character count.
- **Setup snippet copy buttons (UX-088, UX-089).** The AI agents page has copy buttons on its snippets, a "Copy endpoint URL" button (W-812) and shows a failed copy on screen (W-777, W-778).
- **Site styles.** Unpublished changes fold under a count (UX-024), Escape closes the drawer and returns focus (UX-069, UX-070), and class chips whose class is gone are marked (UX-067).
- **Accessibility checks.** The checker flags an SVG with no title that isn't decorative (W-786), a linked box with nothing to name the link (W-798) and an icon that animates without end (W-791). Fix all re-chains heading levels so none still skips (W-773), and issues name their severity (UX-022).
- **Wording in the site's language.** The Pagination element has a **Posts archive title** (replaces "Posts", W-532) and screen reader names for the navigation, each page number and the arrow-only Previous and Next (W-689). Post Dates are written in the page's language (W-688), and hosts can name popup and float close buttons through `resolveThemeParts` `labels` (W-690).
- **Select placeholder.** A Select's Placeholder words its empty first choice instead of a fixed "Choose…" (W-686).
- **Editor hints.** A box's settings say why its Link isn't used when something inside is already a link or control (W-669); the editor says why a synced section past the page's limit isn't shown (W-657); a comma decimal such as "1,5rem" in a size variable or container-query value says to use a dot (W-687, W-695).

### Changed

- **Panel and dialog polish (UX-001 to UX-095).** Sentence-case labels, 13 px field labels, descriptions under text fields, hinted switches, Kumo selects, segmented Background fill types, Filters behind an Add filters button, tooltips for long titles and clamp() values, named HTML tags and gradient values, 16 px dialog titles, destructive confirms that say what they do, 24 px class chip targets and a Layers indent that steps down past four levels. Settings show only when they apply (grid placement for Grid children, Loop Columns for Grid and Cards, the new-tab switch once there is a link, a button's icon layout once it has an icon).
- **Motion.** Style sections fade in and the Site styles drawer slides in; toasts, the compact image sheet and the image editor respect reduced motion (UX-010, W-731, W-733, W-742).
- **Timeline Retry (UX-014).** A failed version load offers Retry inside the timeline and keeps keyboard focus in the dialog. Hosts that keep no revisions get no Retry.
- **Add panel search recovery (UX-013).** A search with no results offers Clear search, which restores the tiles and focus. Escape clears a non-empty search first.
- **Named loading and Retry for access, setup and opening a page (UX-012).** Spinners are replaced by named status text. Each failure offers Retry; a failed Set up EmVB no longer needs a reload.
- **AI agents feedback (UX-011).** A named loading card, Retry after a failed load, and "Saving…" / "Saved." when a switch changes.
- **Section and drawer motion (UX-010).** Style sections fade their rows in as they open and close instantly; the Site styles drawer slides in. Both are instant under reduced motion.
- **Consistent utility dialogs (UX-007, UX-009).** Shortcuts, Accessibility, Page weight, Timeline and Share use one dialog layout: a 14 px title, spaced 13 px text and a right-aligned compact Close.
- **Readable selected Layers row on hover (UX-008).** The selected row keeps its primary fill while hovered; its white text had dropped to 1.14:1.
- **24 px overlay quick actions (UX-006).** Duplicate, Copy and paste and Delete on the selected element meet the WCAG 2.5.8 minimum target.
- **Kumo selects in the panels (UX-005).** Dynamic data, Visitors, Scales, display conditions and the container-query Property picker use Kumo Select instead of native dropdowns.
- **Property labels (UX-004).** Labels are 13 px, quieter while unset and semibold once a value is set.
- **Panel typography and palette hints (UX-001 to UX-003).** Sentence-case group labels, stronger section headers, tagged palette groups with keycap hints, a readable Scales preview and a compact Classes empty state.

- **Compact image panel focus (W-743).** Close panel returns keyboard focus to the current bottom tool, including after switching tools inside the sheet. Enter can immediately reopen its controls.
- **Compact image sheet motion (W-742).** The controls sheet uses a short transform entrance while photo layout, panel dragging and snap sizes respond immediately. Reduced motion keeps transitions instant.
- **Media library opening and Close (W-741).** Opening places focus inside the library. Close returns to Choose from library, or the URL field while loading keeps Choose disabled. Completing the request preserves that focus.
- **Media library retry focus (W-740).** Keyboard Retry keeps focus inside the library while images load and when results arrive. Tab then reaches recovered image cards instead of restarting outside the panel.
- **Steady icon uploads (W-739).** Upload SVG keeps its width while pending. The adjacent feedback wraps within its own column and reserves two lines, preventing normal pending, error and success messages from shifting the toolbar on narrower editor windows.
- **Icon upload feedback (W-738).** Successful upload and duplicate-selection messages expose polite live status feedback. Failures retain alert semantics, and the message still explains that Insert applies the icon to the page.

- **Icon search recovery (W-737).** Unmatched icon-library searches offer Clear search. It restores results and keyboard focus while keeping the chosen category and icon.

- **Timeline loading accessibility (W-736).** Pending saved-version requests expose a named polite status, including while optional agent metadata is loading.

- **Form field feedback (W-735).** Field binding explains when definitions are loading, unavailable, empty or need a parent form. Manual names stay editable, and arriving options preserve keyboard focus and unfinished input.

- **Bound color save feedback (W-734).** Editing a color variable shows saving and saved messages without shifting the controls. Pending values retain focus and reject duplicate submissions; errors retain the draft for retry and success reminds editors to publish styles.

- **Toast motion preferences (W-733).** Editor notifications respect reduced motion, including live preference changes, while retaining Restore, keyboard dismissal and their existing normal transitions. The scoped toast portal leaves host notifications alone and is removed when the editor closes.

- **Image editor closing motion (W-731).** Closing Edit image keeps reduced motion active after its image body unmounts, preventing the popup and backdrop from briefly resuming their exit transitions.

- **Utility dialog motion (W-730).** Command palette, Share link, Version timeline, Page weight and Accessibility now respect reduced motion for their popup and backdrop while retaining Kumo's normal transitions.

- **Dialog motion and focus (W-729).** EmVB dialog portals and backdrops respect reduced motion, including live preference changes, while unrelated admin portals retain their motion. Closing creation dialogs restores keyboard focus to their opener.

- **Inline color variable feedback (W-728).** Creation shows a live progress message, keeps button/form geometry stable and uses a static indicator under reduced motion. Pending fields and actions are disabled, repeated submissions are guarded, and failed saves retain values for retry.

- **Creation feedback (W-727).** New page and New theme part announce progress, keep button/dialog geometry stable, and respect reduced motion. Pending creation locks fields and dismissal, prevents repeated submissions, and restores editing with the entered values after failure.

- **Save and publish feedback (W-726).** The editor announces the action in progress, keeps button widths stable, and uses static icons under reduced motion while retaining busy/disabled feedback. Failures remain actionable and retryable.

- **Search recovery (W-725).** Unmatched searches in Visual pages and Theme Builder offer Clear search, restore results and return keyboard focus to the search field. Theme Builder keeps the selected type filter.

- **Publish styles feedback (W-724).** Publishing shows a stable-width loading button and live footer status, prevents rapid duplicate clicks, and unlocks after success or failure. Reduced motion keeps a static icon with the same pending message; failed requests remain retryable.

- **List loading feedback (W-723).** Visual pages and Theme Builder show named loading cards with three placeholder rows during initial requests and retries. Reduced motion disables shimmer; empty and error states remain distinct.

- **Panel feedback (W-722).** Add/Layers, Content/Style and Site styles tab contents fade in over 150 ms. Controls stay interactive and reduced-motion preferences make changes instant.

- **Form-field definition changes (W-721).** The field picker clears old options while loading another form definition, preserving the current name and ignoring late results from the previous form.

- **Form-field name recovery (W-720).** Picking a form field replaces an invalid typed name and clears its error, including when reselecting the stored field. Manual names remain editable and only valid names are saved.

- **Interrupted image loading (W-719).** Interrupted picture transfers show connection guidance and Try again instead of a low-level body-read error, including when loading an edited copy after its original is missing.

- **Copy-size validation (W-718).** Save copy checks its existing stored custom-size limits before rendering and explains how to choose a supported size or use Full size.

- **Export size bounds (W-717).** Typed image export dimensions keep both sides within the existing pixel limit, preserving the aspect ratio and showing each field's effective maximum.

- **Image export recovery (W-716).** Escape keeps the export step open during Save copy, preserving a failed upload's error and Retry action. Closing remains available before saving, after failure and during downloads.

- **Delayed image uploads (W-715).** Upload completion preserves newer image URLs, alt text and styling; results and errors from an older image no longer affect the current selection.

- **Delayed image reset (W-714).** Reset to original preserves newer alt text and styling, and ignores late results or errors after the image changes or its settings close.

- **Media-library recovery (W-713).** A failed library load shows an error and Retry inside the picker, without claiming the library is empty or marking the image URL invalid.

- **Retained template choices (W-712).** New page keeps an unlisted selected template visible and changeable, and shows template names instead of internal ids.

- **Template creation recovery (W-711).** An unavailable selected page template shows an error and keeps the dialog open; it no longer silently creates a blank page.

- **Share-link copy feedback (W-710).** A delayed copy result cannot mark a different link as copied or replace the latest copy result.

- **List-load recovery (W-709).** Visual pages and Theme Builder offer Retry after a failed load, with accessible error feedback.

- **Palette navigation (W-705).** Filtering and reopening keep the selected command in view.
- **Timeline filters (W-706).** Saved versions remain visible when agent metadata is unavailable; empty filtered results explain how to return to All.
- **Site-style search (W-707).** An active search stays available when fewer classes or variables remain, so it can still be cleared.
- **Search feedback (W-708).** Add-panel searches with no matches expose a status message for assistive technology.

- **Add-panel search (W-704).** Search words match in any order, ignoring case and accents, across element names and groups and section recipe descriptions.

### Fixed

- **Keyboard focus never falls to the page body.** Busy buttons (Save draft, Publish, Revert, Publish styles, Set up EmVB, create dialogs, agent switches, icon and image uploads, image Save copy, Download and export Close) stay focusable and ignore repeat presses instead of being disabled (W-769, W-814, W-816, W-819, W-822, W-824 to W-830). Focus lands somewhere sensible after closing a dialog with no opener, restoring a timeline section, applying an accessibility fix, deleting a subtree, removing a button icon, using Retry on the Pages and Theme parts lists, running out of image editor Undo, Redo or Reset, and creating, cancelling or deleting in Site styles (W-831 to W-833, W-835, W-837 to W-841). The media library, background media library and New variable form take focus, close on Escape and give it back (W-740, W-741, W-745, W-817, W-818, W-820, W-821, W-823), and refused fields are focused and marked invalid (W-813, W-788).
- **Saving.** The Leave dialog can't be pressed twice or closed mid-save (W-834), a save asked for during a conflict overwrite waits for it and uses the new revision (W-836), and versions saved in the same second stay newest first (W-768).
- **Enter in Site styles.** Enter in a new class or variable name creates it (an IME Enter only finishes the word) (W-840).
- **Published pages.** Popups start once and keep their close button at the top (W-757, W-758), corner floats stay on screen (W-759), closing a focused float keeps focus near it and edge bars no longer cover focused elements (W-781, W-782), Escape closes a hover-shown menu dropdown and column flyouts open beside their toggle (W-783, W-784), pasted SVG ids don't collide (W-785), loops are lists (W-789), image figure and caption CSS ships with the image (W-792), contents entries hide with their heading (W-793), numbered lists with three-digit numbers fit (W-796), linked boxes inherit colour (W-797), grid spans fit each device (W-799), long words, labels and tabs wrap instead of widening the page (W-764 to W-766, W-800), background video hides under reduced motion and sits under its overlay (W-801, W-802), large icons shrink on narrow screens (W-803), clicking a public tab focuses it (W-779) and form controls name their error message (W-780) and fields without a label are named (W-753).
- **Editor.** Timeline pictures have no live links and load the host's stylesheets (W-752, W-811), the command palette keeps a fixed width (W-760, W-810, UX-093), long URLs and quoted values wrap in the panel (W-761, W-763, W-767), keyboard moves announce where the element landed (W-770), page weight sizes and contrast messages read cleanly (W-771, W-772, UX-083), popup delays under a second read in ms (W-776), the canvas frame shows a focus ring (W-809), a bare word in a video URL shows the placeholder (W-795), refused SVG markup says why (W-787), and the canvas passes fetchpriority, srcset, playsinline, autoplay and datetime in React's spelling (W-804).
- **AI agents (MCP).** `list_versions` gives times as ISO 8601 UTC (W-805), and an update with null props is an invalid layout, not an internal error (W-755). The rate-limit message says 1 second (W-754).
- **Forms.** Number fields take decimals (W-578). Hidden fields from the form definition are sent (W-595), and conditional fields such as "Other" carry their condition, stay hidden until shown and no longer block every submission (W-596, W-597). Patterns browsers refuse are repaired instead of dropped (W-538, W-594). Fractional length limits round to whole numbers (W-588). The Form element warns when a minimum is above its maximum, naming both length and value problems at once (W-577, W-589), when a text box is bound to a field with fixed choices (W-579), and compares real audience rules (W-550). Blank labels fall back to a name (W-587), the spam trap no longer scrolls right-to-left pages sideways (W-555), and a field in a broken A/B test isn't flagged as shown to some visitors (W-628).
- **A/B tests.** Deleting one variant no longer hides the other from some visitors: it shows to everyone and the editor says why (W-625, W-627). Duplicating, pasting or restoring a variant makes an independent copy instead of joining the test (W-629, W-632, W-636). A new test never reuses another test's name, so ending one can't delete the other (W-701).
- **Typing in Japanese, Chinese or Korean, and other keyboards.** Enter or Escape that ends a composition no longer saves, cancels or closes a field, popup, rename, list or icon search mid-word (W-606, W-676, W-681, W-682). Editor shortcuts work on Cyrillic, Greek, Hebrew and Arabic layouts (W-565), and held Delete, Ctrl+D or Ctrl+V act once (W-622). Public Tabs, the theme part filter and the image editor tools leave Alt, Ctrl and Cmd shortcuts to the browser (W-675, W-680).
- **Right-to-left and other scripts.** Canvas drops and the drop line follow the shown flow, including reversed rows (W-559), and canvas text editing keeps the element's direction and case (W-560). Page slugs keep non-Latin letters, as EmDash makes them (W-554, W-590, W-591), relative links in other scripts are kept (W-683), and cut text never splits a character, accent, flag or emoji (W-543, W-556, W-557, W-700). Post Excerpt counts words in Japanese, Chinese and Thai (W-660), and a page count without a total drops its dangling lead-in in more languages (W-702).
- **Site styles and classes.** Quick edits to a class no longer lose earlier ones (W-536). Names drop hidden marks and compare accent forms alike everywhere (W-558, W-568, W-570). Undoing a delete renames the restored item if its name was taken and respects the 100-class limit (W-575, W-576). Saving from two tabs treats a name clash as a conflict, keeps a class reorder and stays within the limits (W-620, W-621, W-647), Import refuses two items sharing an id (W-619), a reorder counts as an unpublished change (W-641), a failed create or rename keeps what you typed (W-610, W-616), type and space scales keep renamed tokens (W-640, W-609, W-626), and font stacks or `!important` values the site CSS would drop are refused (W-547, W-648).
- **Checks that missed styles from classes or container queries.** The contrast check reads colours, font size, opacity and heading styles from global classes and size variables, and skips text over gradients and video (W-633, W-637, W-638, W-639, W-651). The performance meter, share-link warning and variable-delete check count class, container-query, synced-section and Loop Item styles and media (W-635, W-643, W-644, W-645, W-671, W-674, W-631). The accessibility check treats invisible-only text as blank and flags hidden form controls (W-572, W-650).
- **Published pages.** Synced sections nested in each other stop at a per-page limit instead of multiplying (W-653), and a Loop that uses its own item design no longer crashes the archive (W-654). Ids inside a Loop are emitted once (W-649), a Loop with no item design lists no empty boxes (W-602), Loop Item parts load visitor, A/B and collection data (W-658, W-666, W-667), and a linked box doesn't wrap links or controls (W-668). Tab panels keep their own style (W-598), a Post Date shows the right day (W-599), Pagination never hides just one page behind "…" (W-600), a Heading in a Menu doesn't break it (W-601), empty nested lists and untitled post headings are dropped (W-585, W-661), plain-text post content keeps paragraphs (W-662), header or footer parts aren't double-wrapped (W-586), motion set in a container query animates (W-670), srcset lists each width once (W-541), and the page root is never hidden (W-567, W-571).
- **Popups and menus.** Tab and Shift+Tab stay in the popup, including past accordions, videos and frames (W-553, W-672). Escape closes an open menu dropdown before the popup (W-580), and a dropdown without a link opens from its text (W-614).
- **Video and icons.** YouTube playlists, YouTube Music, Vimeo showcases and hosts typed without https:// embed (W-546, W-659, W-691), and an untitled video keeps a name (W-549). My uploads holds 100 icons (W-535), renamed icons keep a slash and drop hidden or direction-changing characters (W-655, W-656), and the Circle Alert icon draws its mark (W-699).
- **Image editor.** Saving keeps tall strips within the size limit (W-581), never applies edits twice from a damaged record (W-582), accepts capitalised file types (W-592), and keeps names in other scripts and sane names for dotted or long originals (W-539, W-593). Reset to original handles a blank address (W-583), a locked crop ratio keeps both sides at the minimum (W-693), metadata reads "Canon EOS R5" and "1.0 MB" (W-698), the edit summary skips no-op steps (W-551), and blend paths refuse backslashes (W-534).
- **AI agents (MCP).** Tools refuse links and SVG markup the page would drop, with the reason (W-563, W-566), refuse duplicate class or variable names (W-573), save nothing when nothing changed (W-562, W-564), find a taken slug past the first 50 pages (W-537), handle deeply nested input (W-652) and cut labels cleanly (W-557). The AI agents page keeps working after a failed or conflicting save (W-624, W-630, W-634).
- **Editor fields.** Line height and number fields keep what you type (W-603, W-604), item titles can be selected without dragging the row (W-605, W-611), popup trigger numbers and selectors such as `nav > .cta` save (W-607, W-613), Visitors hours keep the other box and count overnight windows (W-615, W-665, W-608), Layers menus close on an outside click (W-612), the command palette searches whole text and List items (W-556, W-618) and no longer moves focus after it closes (W-533), and SEO fields of only spaces save as cleared (W-663).
- **Smaller fixes.** Colour picker reads rgb percents and oklch hues (W-540), "UK" means GB in country rules (W-544), extra sizes accept paths with spaces (W-545), generated ids don't end in a hyphen (W-548), the paged archive title keeps `$` and `{page}` as written (W-552), timeline refusals clear (W-561, W-623), blank page titles read "Untitled page" (W-679), unreadable edit times don't break lists (W-685), new-tab switches read "Open in a new tab" (W-684), bound values drop control and direction characters (W-677), theme part float errors are readable (W-678), section recipes pick readable button text (W-642), demo pages have a favicon (W-617), container-query values refuse inherited object names and keep a variable's kind so `var(--space-4)` renders (W-542, W-696), an element's own background keeps the layer its classes draw (W-569), the performance meter skips an empty Image when checking hero Priority (W-574), a specific Archive part beats a newer catch-all one (W-584), Display conditions the menu can't build show as themselves instead of "Entire site" (W-694), blank Tab and Accordion titles get a visible name (W-664), refused colour values are marked invalid for screen readers (W-673), and very large pages no longer overflow the outline (W-646).

## [0.6.0] - 2026-10-14

### Breaking

- **Layout schema 16.** Images can carry an optional `edit` record for the image editor (the edit settings and a link back to the original picture). Pages saved by this version can't be opened by EmVB 0.5 or older; older pages open unchanged (W-481).

### Added

- **Image editor (docs).** [Guide](docs/guides/image-editor.md), README feature line, and third-party notices for photocn and the code it includes (mini-photo-editor, glfx.js, exif-js, fflate). The size budget test covers the editor chunk (350 KB gz) and the worker (32 KB gz) (W-488).
- **Image editor: accessibility.** The crop frame moves and zooms from the keyboard, focus stays in the dialog, screen readers hear the tool and a plain-language summary of the edits, and pictures that can't be edited say why. Reduced motion is respected (W-487).
- **Image editor: more ways in, and Metadata.** Media-library cards have a ⋯ menu with **Edit…**, and the command palette has **Edit image** when an image is selected. The editor's **Metadata** tool shows the file, dimensions and camera details (EXIF), and warns when a photo carries a location. The phone tool sheet is white again (W-486).
- **Image editor (preview).** Image settings have an **Edit image** button that opens a full-screen editor for a media-library picture, laid out like [photocn](https://photocn.dev)'s editor: undo, redo, Reset, hold **Original** to compare, the tool switcher, a live histogram and the tool's panel in a resizable sidebar, and on narrow screens the photo first with tools at the bottom and controls in a sheet. **Crop** works: drag the frame, move and zoom the picture under it, rotate, flip, straighten, fix perspective with two sliders or by dragging the corners, pick a ratio (including **Fit this element**, the Image element's own width and height), and use the keyboard (R, H, V, X, [ ], arrows). **Adjust** (light, color, effects; **Effects** opens its tab), **Filters** (13 looks with a strength slider), **Curves** (RGB, red, green and blue over the live histogram) and **Blur** (bokeh or gaussian around a sharp spot you drag on the picture) work too. Every slider has a label and a value you can type; curve points and the blur spot move with the arrow keys. **Save copy** saves the edit as a new picture in the media library (WebP at 85 % by default, at most 2560 px on the longest side, JPEG and PNG on request) and leaves the original untouched; a JPEG copy has the photo's location removed unless you turn that off, and **Download** saves the file to your computer instead. An edited picture shows **Edited** in Image settings; **Edit image** opens the original again with your changes still applied, and **Reset to original** puts the first picture back. Blender and Metadata arrive in the next updates. The editor loads only when it is opened and renders in a background thread where the browser allows it.

### Fixed

- The paged archive title ("Posts – page 2") can be worded in the site’s language: the Pagination element’s new "Page title text" (`{title}`, `{page}`) reaches hosts as `archiveTitleText` for `archivePageTitle` (W-529).
- Blank canvas pages set `<html lang>` from the new `lang` prop or the request locale instead of always "en" (W-528).
- A synced section with a form or tabs used both on the page and in a popup, header, footer or float no longer repeats HTML ids; the popup’s labels focused the page’s fields (W-527).
- Choosing a colour with the colour picker keeps a see-through colour see-through, in element colours and colour variables; the picker has no alpha and made it solid (W-526).
- Post Content keeps a line break inside bold, italic or linked text instead of turning it into a space (W-525).
- The Radio field names its group with a real `<legend>` inside the `<fieldset>` instead of a separate label and `aria-labelledby`; it looks the same (W-524).
- A box marked Query container no longer collapses to zero width (hiding its content) in a row or a non-stretched column: it is full width unless it has a width of its own (W-523).
- The agent activity log now keeps 90 days: each new entry drops older ones, so a busy agent token no longer grows it without end (W-522).
- Dropping an element back on its own spot no longer marks the page unsaved, adds an empty undo step, or clears redo (W-521).
- In Layers, the up and down arrows skip the rows inside a collapsed element instead of selecting a hidden one and re-opening it (W-520).
- Publish styles no longer lists an unchanged class or variable as changed, and saving styles from two tabs no longer reports a false clash, when a value was removed and set again (W-519).
- The version timeline no longer marks unchanged sections as changed because a saved version lists element settings in another order (W-518).
- Restoring a section from the version timeline no longer brings back a CSS id another section took since then, which made the page fail to save (W-517).
- **Site styles Import:** a design file over the 256 KB site-styles limit is refused when you pick it, with its size and what to do, instead of replacing the site styles and then failing every save (W-516).
- **Forms:** the required-field notice on a Form is shorter and easier to scan: each field name in bold with a one-line reason, then one hint on how to fix it. The full sentence is in the tooltip (W-515).
- **Visitors:** a host that passes Cloudflare's `XX` (unknown) or `T1` (Tor) as the visitor's country no longer replaces the country EmVB detected, so country rules keep working (W-514).
- **Forms:** the required-field warning (W-511) also covers a required field shown only to some visitors, by a Visitors rule or as one arm of an A/B test, on the field or a box around it (W-513).
- **Table of contents:** a heading inside a box hidden on every device is no longer listed as a link that goes nowhere (W-512).
- **Forms:** a Form element now warns, in its settings and in MCP `describe_page`, when a required field has no field on the form or is hidden on a device. Either way visitors can't send the form, and they see no reason why (W-511).
- **MCP:** `update_element` giving an image a new `src` now drops the old picture's extra sizes, media id, size and image-editor record, so the page shows the new picture instead of the old one from srcset (W-510).
- **Text limits:** canvas text at the 2,000-character limit, class names, class and variable copies, layer names, uploaded icon names and the post author no longer end in half an emoji (W-509).
- **Performance meter:** a media-library video, or a Video element with no valid URL, is no longer counted as a 500 KB third-party player embed with a warning (W-508).
- **Share links:** a page title cut at the 120-character limit no longer ends in half an emoji (W-507).
- **Devices:** an element hidden on two adjacent devices no longer shows at fractional window widths from browser zoom or display scaling (1024.5 px, for example); the device media queries end at `.98px` (W-506).
- **Loops:** the editor's Loop preview no longer shows entries whose list field holds the filtered value, matching the published page, where EmDash compares fields as plain values (W-505).
- **MCP:** `update_site_styles` refuses to remove a class a page still uses, naming the pages, unless `force: true`, as it already did for variables (W-504).
- **Playground:** the image editor's Reset to original and re-opening an edit work in the playground; its mock media library now answers a lookup by id (W-503).
- **Data binding:** a bound value cut at the 500-character limit no longer ends in half an emoji (W-502).
- **Data binding:** an Image whose picture is bound (post featured image, URL parameter, site setting) shows the bound picture even when the typed one has extra sizes; the old srcset hid it on most screens (W-501).
- **MCP:** `describe_page` warns when an element, or the whole page, is hidden on every device (W-500).
- **MCP:** an image source other than http(s) or a path on the site (`javascript:`, `data:`, `//host`) is refused with an explanation instead of publishing a blank image (W-499).
- **MCP bridge (`@perkyzz/emvb-mcp`):** a token with a line break or space (for example a second line in the token file) is refused at start-up instead of failing later with an error that quoted the token to the agent; errors are redacted of the token, and `--token-file` with no path is an error (W-498).
- **MCP:** on a site where EmVB isn't set up yet, `get_layout`, `describe_page` and the other page tools now say so (`NOT_SET_UP`) instead of claiming the page doesn't exist (W-497).
- **Image editor and images:** pictures larger than the browser's graphics limit open scaled down to fit, marked "Reduced to fit", instead of a blank preview and a grey copy; pictures over 10000 px on a side no longer make the draft unsaveable (W-496).
- **Image editor:** a JPEG copy of a transparent picture is put on a white background instead of turning the transparent parts black (W-495).
- **Image editor:** Reset to original no longer points an image at a deleted original; re-opening an edit whose original was deleted opens the edited copy; Fit this element is not offered for strips longer than 100:1, which couldn't be saved (W-492 to W-494).
- Choosing a different picture for an Image element drops the old picture's edit record.

## [0.5.0] - 2026-10-13

### Fixed

- emvb-mcp: warns about a token file other users can read, explains a missing token file, and says a refused token is wrong, revoked or expired instead of "Couldn't reach the site".
- MCP: references to fonts, sizes and spacings work without "from", typos in variable or class names are refused with the names that exist, tag defaults are merged instead of replaced, a site without EmVB set up says so, and create_page with a hero makes the hero heading the only H1.
- The AI agents page uses EmVB's admin styles instead of plain browser defaults.
- Video URLs typed without https://, such as youtube.com/watch?v=…, embed the video.
- A form's Submit button with a blank label shows "Submit" instead of an empty button.
- The accessibility check reports links and fields inside an element marked aria-hidden.
- The same-name menu warning ignores menus that are never shown on the same device.
- The accessibility check no longer reports two H1s when each is shown on different devices.
- Hiding a captioned image on a device hides its caption too.
- Screen readers announce a radio group's question along with its options.
- A required checkbox's asterisk is no longer read aloud by screen readers.
- Featured images in a Loop load lazily.
- Post links with shared text such as "Read more" include each post's title in their accessible name.
- The Visitors time zone field can be typed normally, and an unknown time zone is pointed out instead of being treated as UTC.
- Shared playground links open even when a mail or chat app wrapped them or added a trailing bracket or full stop.
- Number fields accept their unit after the number, such as 16px in a px field.
- The colour control's RGB field accepts rgb(0 0 0 / 50%).
- Colour fields accept a hex pasted without "#", as design tools copy it.
- Pagination's Previous and Next links set to just an arrow are read as "Previous page" and "Next page".
- The accessibility check flags more vague link texts, such as "See more" and "More info".
- The accessibility check flags screenshot and chat-app file names used as alt text.
- A table of contents with no headings no longer adds an empty navigation region to the page.
- The Link field explains when a link was refused because of a space or an unsupported scheme.
- Images whose file names contain spaces keep their extra sizes.
- Links typed as www.example.com go to that site, and email links with a spaced subject work.
- Pagination page number links are read as "Page 2" and so on by screen readers.
- Pasting an image URL over a library image clears the old image's width and height.
- Extra sizes accepts a pasted srcset line and widths written 400W, 400px or 400 w.
- Choosing a different image clears the previous image's extra sizes.
- Low contrast caused by opacity says to raise the opacity instead of offering a colour fix that can't help.
- Command palette search ignores accents: "cafe" finds "café".
- CSS ids starting with emvb- are refused in Advanced, since EmVB uses them for headings and fields.
- Phone links written with spaces (tel:+1 555 010 0199) work instead of going to #.
- The accessibility check ignores elements hidden on every device.
- The contrast check accounts for semi-transparent text and background colours.
- The vague-link warning also catches "Read more…", "Learn more →" and similar.
- The accessibility check flags a video with a blank title.
- The table of contents leaves out headings hidden on every device.
- The accessibility check flags a blank tab label or accordion title.
- Floating bars keep the page clear when their height changes after load.
- An open popup still closes with Escape, and Tab stays inside it, after the focused control inside it disappears.
- Tabs arrow keys follow right-to-left text.
- Container-query style rows accept a bare number as px and keywords in any case.
- Retyping the container-query width no longer deletes the styles set for it.
- The accessibility check calls a text-less button without a URL a button, not a link.
- Closing the command palette (Esc or a jump) no longer leaves keyboard focus on the page body.
- **A table of contents links only headings that render (W-384).** A heading in the other A/B arm or for another audience is no longer listed, and a repeated HTML ID is listed once.
- **Extra image sources keep the main image in `srcset` (W-385).** The browser ignores `src` once `srcset` has widths, so a wide screen got only the smallest extra file. The main image is listed with its width when that is known.
- **The accessibility check covers image links (W-386).** A decorative image that is a link is reported as a link with no name, a linked image isn't offered "Mark as decorative", and an image link that opens a new tab is noted like other links.
- **A button icon can be saved and removed (W-387).** Choosing an icon for a Button no longer makes the page refuse to save, and the Icon field on a Button has Remove.
- **Focal point and button icon gap take 0 and stop at their maximum (W-388).** A 0 % focal point or a 0 px gap can be typed, and 101 % or a 65 px gap is refused in the field instead of at save.
- **Wrap the selection follows the nesting rules (W-389).** An accordion item, tab panel or menu item is no longer wrapped into a page that can't save, and a wrap that would go past the depth limit is refused with the reason.
- **Renaming an uploaded icon returns the checked SVG (W-390).** The rename answer goes through the same allowlist as My uploads, so a stored row that fails it is not sent back to the picker.
- **A long Loop filter can't stall the server (W-391).** The filter check no longer backtracks on padded values, so a 265-character filter is checked at once instead of in about 50 seconds. A filter on a field named `constructor` keeps its plain value.
- **Post Content never nests links (W-392).** A span with more than one link mark is one link, to the first.
- **The save message for a bad segment name mentions `:` (W-393).** It matches the rule since 0.4.0.
- **Custom grid tracks are checked as you type them (W-394).** A track like `4fr`, or a 13th track, stays in the field with the allowed values instead of making the page fail to save.
- **`@perkyzz/emvb-icons` carries its sets' license texts (W-395).** The icon package now ships `licenses/`, a NOTICE with each set's attribution, and a README. (Not yet published.)
- **`@perkyzz/emvb-icons` 0.1.1 (W-396).** Ships the sets' license texts, NOTICE and README; `@perkyzz/emvb` depends on it.

### Added

- MCP: each token may make 300 reads and 60 changes a minute and 10 publishes an hour; over the limit a tool returns RATE_LIMITED with how many seconds to wait.
- `@perkyzz/emvb-mcp` 0.5.0 ships alongside `@perkyzz/emvb` 0.5.0.
- Docs: the AI agents (MCP) guide.
- `@perkyzz/emvb-mcp` serves the layout and style schemas, page resources, four workflow prompts and the `emvb-page-builder` skill.
- Version timeline: Agent badge and a People/Agents filter. The editor tells you when an AI agent changed the page while you were idle.
- `@perkyzz/emvb-mcp`: run `npx @perkyzz/emvb-mcp --site https://your.site` with `EMVB_TOKEN` to give a local AI agent the EmVB tools through your site's EmDash MCP.
- AI agents admin page with an off-by-default master switch and separate publish permissions; gated `publish_page` and `publish_site_styles` tools; EmDash's own MCP can't publish EmVB pages unless allowed; removing an in-use variable through MCP is refused.
- MCP write tools (draft only): create, add, move, update, remove elements, section recipes, restore versions and site style drafts, validated like the editor, `_rev`-checked and logged per user. Site styles keep a 50-entry history.
- MCP read tools for AI agents on EmDash 1.2+ (with `mcp: true`): list pages, get a layout or its outline, element types with their settings schema, site styles, section recipes, a page description, accessibility findings and versions. Agents need a token with the `mcp:tools:emvb` scope and an editor role.
- The accessibility check warns when two menus on a page have the same name.
- The accessibility check warns about empty headings.
- The accessibility check flags form fields with no label, or only a placeholder.
- The accessibility check warns when an image has extra sizes but no Width (px).
- Container query styles can be edited one property at a time in Advanced: change, remove or add a property.
- Image settings have an Extra sizes (srcset) field: one `URL WIDTH` per line, up to 6.

### Changed

- Docs for 0.5.0: the READMEs, the install guide and the MCP guide cover EmDash 1.2+ with `mcp: true`, token scope and role, the bridge's options, rate limits, resources, prompts and the skill, and the AI agents page. Tool messages name the **AI agents** page by its label.
- The AI agents page, the timeline's All/People/Agents filter and Agent badge, and the "An AI agent changed this page" notice match the editor's design.
- The emvb-page-builder skill pushes agents toward designed pages with a new design reference, documents what the tools can't do, and ships scripted trigger and task evals.
- The contrast check accounts for an element's opacity and its parents'.
- A table of contents link to a heading inside a closed tab opens the tab and scrolls to the heading.
- "Use current style at that width" asks before replacing container-query styles you set.

## [0.4.0] - 2026-10-11

Schema 15. Container queries, per-element text direction, image links and captions, button icons, a table of contents, custom grid tracks, and the security fixes since 0.3.0.

### Breaking

- **Layout and design schema 15.** Pages and site styles saved now can't be opened by an EmVB that only knows schema 14. Older pages and styles open and upgrade unchanged. Schema 15 adds optional fields only: per-element text direction, image link, caption, focal point and extra image sources, a button icon, a table of contents element, container queries, custom grid column tracks, and a grid child's column or row start line.
- **Layout and design schema 14 (W-329).** Pages and site styles saved now can't be opened by EmVB 0.3.0 or earlier; update the plugin everywhere first. Older pages and styles open and upgrade unchanged.
- **Forms runtime import.** `@perkyzz/emvb/astro/forms` no longer imports `@emdash-cms/plugin-forms`, so a host without that plugin can import it and the build still succeeds. Hosts that have the forms plugin import `@perkyzz/emvb/astro/forms/client` instead. That subpath calls `initForms`.

### Added

- **Custom grid tracks and a start line (W-350).** A grid can list its own column tracks (`1fr`, `2fr`, `3fr`, `auto`, `min-content`, `max-content`, or a length), per device, instead of equal columns. A child can start on a column or row line (1–13) and still span.
- **An SVG keeps its viewBox ratio (W-350).** The longer side is the Size and the other side follows the viewBox. A square, missing, or unreadable viewBox stays square.
- **Forms inside theme parts (W-350).** A form in a header, footer, popup, float, synced section, or loop item loads that form's field definitions. `resolveThemeParts` sets `needsFormsRuntime` so the host can mount `EmVBFormsRuntime`. The demo layouts do.
- **Field options come from the form they sit in (W-350).** A select or radio uses that form's definition, including a form inside a synced section or loop item. Another form on the page with the same field name does not supply the options.
- **Segment names can include a colon (W-350).** `plan:pro` is valid (a letter or digit, then letters, digits, `:`, `_`, or `-`, up to 64 characters). A rejected name stays in the field with an error and does not clear the stored rule. "Only" with no rules says to add a country, device, segment, or time.
- **The seen cookie is written only for a new or returning rule (W-350).** Country, device, and segment rules still personalize. They do not set `emvb_seen`.
- **Wrap the selection.** The command palette can wrap the selected element in a Flexbox, Grid or Div Block in one step. The page root stays put.
- **Find text.** The command palette's `/` prefix lists the text on the page (headings, buttons, accordion titles, captions) and jumps to that element.
- **Publish styles lists the change.** While site styles are unpublished, the site styles drawer names the variables, classes and settings Publish styles will add, change or remove.
- **Image link, caption and focal point.** An image can link somewhere (size styles stay on the image), show a caption, set a focal point (`object-position`), and list extra image URLs for `srcset` when those URLs exist.
- **Button icon.** A button can show an icon before or after its label, in a small, medium or large size.
- **Rename and delete uploaded icons.** My uploads can rename or remove an SVG. Icons already placed on a page keep their own copy.
- **Drag to reorder Accordion and Tabs items.** Dragging a row in the Content list reorders it in one step. Move up and move down stay.
- **Table of contents.** A Table of contents element lists the page's headings as links. No script.
- **Print stylesheet.** Printed pages hide the header, footer, floats and popups.
- **Text direction on one element.** Advanced → Text direction sets `dir` on that element. Unset follows the site.
- **Container queries.** A box can be a query container. A child can apply a copied style when that container is at least a chosen width, with `@container`, not the viewport.
- **Icon sets are a separate package.** Lucide, Font Awesome Free, Tabler and Remix live in `@perkyzz/emvb-icons`. Remix stays on 4.8.0. Public pages still store only the SVG you insert.
- **An EmVB page at a fixed path.** `resolveEmVBPage(Astro, { slug: "home" })` looks up that slug as-is and ignores the route parameter, so a host can serve an EmVB page at `/`. Without `slug`, the route parameter is used as before.
- **Your site's stylesheets in the editor canvas (W-327).** `emvb({ canvasStyles: ["/styles/site.css", "https://fonts…"] })` makes the canvas load the host's stylesheets and fonts before EmVB's CSS, so pages look in the editor as on the site. Only `https:`/`http:` URLs and site paths are used, at most 10. The demo sites load their `public/site.css` this way.
- **Visitor segments from your site (W-329).** Hosts pass what they know about the visitor, e.g. `resolveEmVBPage(Astro, { visitor: { segments: ["member", "pro"] } })` (and the same option on `resolveThemeParts`), and a Visitors rule can match those segments (Visitors → Segments). Host-provided country, device and new/returning replace the detected ones.
- **Loop link pattern, image and excerpt fields, and filters (W-330).** A collection Loop can link each entry where you choose (`/team/{slug}`, `{id}` works too), show a different image or excerpt field (`photo`, `role`), and list only entries where `field=value` (pairs separated by `;`; a taxonomy name filters by term, the same field twice matches either value). The canvas preview applies field filters; taxonomy filters apply on the published page.
- **`ch` lengths and negative margins (W-331).** Sizes and spacing take `ch` (the width of a "0"), handy for readable text such as a 65ch max width, and margins can be negative (down to -10000) to pull an element over its neighbour. Padding stays 0 or more.

### Security

- **A URL is the string that was checked (W-348).** An absolute link or media URL that contains spaces, other whitespace, or a backslash is refused. Before, those characters were removed only for the check and the original string was kept, so one image address could name a second host inside `srcset`. A URL with a username or password (`user:pass@host`) is refused, so that password is not published in the page. A relative path may still contain a normal space.
- **`srcset` candidates cannot contain a comma or a space.** A comma inside one extra image URL is another image request, so that candidate is left out.
- **Video embeds are sandboxed.** A YouTube or Vimeo iframe can run scripts on its own origin and open popups. It cannot navigate the page that embedded it.
- **Uploaded icons are checked again when they are listed.** A stored SVG that no longer passes the allowlist is left out of My uploads.
- **Style numbers stay numbers.** A focal point, a button icon gap, and a container-query width are written into CSS only when they are whole numbers in range. Text direction is only `ltr`, `rtl`, or `auto`.
- **A form pattern that can hang the browser is left off.** A pattern that does not compile, or that nests quantifiers such as `(a+)+`, is not copied onto the control. Ordinary patterns such as `.+@example.com` still are.
- **An SVG paint server stays inside the file (W-349).** `fill` and `stroke` may use `url(#id)`. A `url(https://…)` is refused, so a pasted icon cannot make the visitor's browser request another site. `url(#id)` gradients still work.
- **Alternating form patterns are left off too (W-349).** `(a|aa)+` can hang a tab the same way a nested quantifier can. A single optional group such as `(https?:\/\/)?` is still copied onto the control.
- **Theme-part ids and float edges are escaped (W-349).** The wrapper and the float markup escape those strings before they are written into the page.

### Changed

- **CI runs the same checks as `bun run check` (W-350).** After format, GitHub CI runs fallow, the runtime check, and the seed check, then the unit and Astro tests.
- **The install guide names every runtime (W-351).** A host mounts the tabs and menu scripts on a page, and the popup and float scripts for theme parts, only when that page or theme says it needs them. Segment names may include `:` and are up to 64 characters; a name that doesn't fit is dropped.
- **The canvas uses the same style scope as the published page.** Editor CSS is prefixed the way public CSS is, and the canvas markup sits in the same scope wrapper.
- **A site-styles save from another tab is replayed when it can be.** If the other tab changed different variables or classes, this tab's edit is saved on top. If both tabs changed the same one, the latest styles load and the edit is not overwritten.
- **Post Content keeps the post's formatting (W-328).** Bold, italic, code, underline, strike-through, links (only hrefs that pass the link check), bulleted and numbered lists (nested), headings h1–h6, block quotes and line breaks now show on the page and in the editor. Images, embeds, custom blocks and raw HTML are still left out, and all text is escaped.

### Fixed

- **A page and its theme parts agree on new vs returning (W-313).** Within one request, a first visit no longer turns into a returning one for the header, so a "first time here?" bar shows on the visit it is for. The seen cookie is read as the browser sent it.
- **Ctrl/Cmd+K no longer opens the command palette over an open dialog (W-314).** Escape no longer strands focus outside the dialog. Ctrl/Cmd+K still opens the palette from a text field.
- **A bundled icon tile cannot carry a handler (W-370).** Tiles are built the same way an uploaded SVG is. A viewBox that breaks out into `onload` is left out of the grid.
- **A broken share link is unreadable (W-371).** A link that fails while it is unpacked comes back as unreadable. It does not leave the reader waiting.
- **A playground layout that is not JSON is unreadable (W-372).** The view shows the same message as a layout that fails validation.
- **An unknown element keeps direction and container queries (W-352).** `dir`, `container` and `query` stay on a node this version does not recognize, so a later version still has them.
- **Layers icons match the element (W-361).** A Layers row uses the same icon as the Add panel.
- **JSON-LD cannot close its script tag (W-379).** A `<` in the site's structured data is written as a JSON escape.
- **Editor feature colours follow the admin theme (W-380).** Timeline, accessibility and style-source colours use Kumo roles, including in dark mode.
- **A corrupt style draft can be replaced (W-382).** The editor keeps that draft's revision, so the next save overwrites it. A missing draft still has no revision.
- **An unknown element can still be saved after a device hide or a pasted style (W-351).** Hiding it on a device, or pasting a style that sets device overrides, no longer makes the whole page fail to save.
- **Version history looks like the canvas (W-351).** The before/after snapshots load the host's stylesheets before EmVB's CSS, in the same order as the canvas. A stylesheet that isn't an `http(s)` URL or a site path is left out.
- The emvb.dev changelog page leaves out a release with no entries yet, such as an empty Unreleased (W-324).
- **Site styles saves no longer conflict with themselves (W-325).** Quick successive edits to variables or classes save one at a time, each on the revision the previous save made, so a second edit is never refused as "changed in another tab". Publish styles waits for pending saves.
- **Paused forms say so (W-326).** A form paused in the forms plugin shows "This form isn't accepting responses right now." on the page instead of empty fields and a Submit button that can't send, and the form picker marks it "(paused)".

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

[Unreleased]: https://github.com/PerkyZZ999/EmVB/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/PerkyZZ999/EmVB/compare/v1.1.2...v1.2.0
[1.1.2]: https://github.com/PerkyZZ999/EmVB/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/PerkyZZ999/EmVB/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/PerkyZZ999/EmVB/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/PerkyZZ999/EmVB/compare/v0.9.0...v1.0.0
[0.9.0]: https://github.com/PerkyZZ999/EmVB/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/PerkyZZ999/EmVB/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/PerkyZZ999/EmVB/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/PerkyZZ999/EmVB/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/PerkyZZ999/EmVB/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/PerkyZZ999/EmVB/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/PerkyZZ999/EmVB/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/PerkyZZ999/EmVB/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/PerkyZZ999/EmVB/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/PerkyZZ999/EmVB/releases/tag/v0.1.0
