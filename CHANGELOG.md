# Changelog

EmVB isn't released yet. The `emvb` package is private, so nothing is on npm.

## Unreleased

The first public source release: a visual page builder for EmDash CMS 1.0.x on Node (SQLite) and Cloudflare Workers (D1).

- **Editor:** a full-screen editor inside the EmDash admin. Drag, drop and nest elements, edit text on the canvas, copy and paste, undo and redo, and preview desktop, tablet and mobile.
- **Elements:** containers with flexbox or CSS Grid, headings, text, buttons, images, video, icons, tabs, accordions, popups and forms (through the EmDash forms plugin).
- **Styling:** Hover, Focus and Active states with transitions, per-device styles and hide on device, backgrounds with gradients and overlays, entrance animations, custom attributes and text decoration.
- **Site styles:** colour, font, size and spacing variables; classes in a clear priority order; tag defaults; changes staged until Publish styles; import and export as JSON.
- **Theme Builder:** headers, footers, Error 404, Search Results, Single Page, Single Post, Archive, Loop Item and popups, with display conditions and dynamic data.
- **Public pages:** plain HTML and CSS. The only EmVB scripts are the optional popups and tabs scripts, which load only on pages that use them.
- **Storage:** layouts and the design document are validated on save and versioned at schema 9. Older documents upgrade automatically.
