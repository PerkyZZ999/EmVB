# Custom fonts

EmVB pages can use your own fonts and Google fonts, served from your own site. Visitors' browsers
never contact Google or another font host, so no visitor data goes to a third party and pages
don't wait on another server. More about EmVB: <https://emvb.dev>.

## Where fonts live

Fonts belong to **font variables** in **Site styles → Variables → Fonts**. A font variable is a
font stack such as `'Brand Sans', Georgia, serif`; elements and classes pick it in the Style tab's
**Font family** (or a tag default does). A variable can also have its own **font files**: one per
weight and style (Regular 400, Bold 700 italic…).

A page loads a variable's files only if it uses the variable, with `font-display: swap`: the text
shows at once in the next font of the stack, then switches when the file arrives. The editor's
canvas uses the files too.

## Upload WOFF2 files

1. Open **Site styles → Fonts** and open a font variable (or create one with **New**).
2. Under **Custom font**, type the **Font family name** the first time, for example `Brand Sans`.
3. Pick the **Weight** and **Style** of the file, then click **Upload WOFF2** and choose the file.
4. Repeat for each weight and style. A file uploaded again for the same weight and style replaces
   the one before.

EmVB puts the family first in the variable's font stack, so `Inter, sans-serif` becomes
`'Brand Sans', Inter, sans-serif`.

Only WOFF2 files are accepted, up to 1 MB each (a Latin font is usually 15–150 KB). Every browser
EmVB supports reads WOFF2, so older formats would add nothing. Convert a TTF or OTF first, for
example with `woff2_compress` or an online converter; check that the font's licence allows web use.
The file is checked in the browser and again on the server: it must really be WOFF2 (its header,
not only its name).

## Google fonts

1. Open a font variable in **Site styles → Fonts**.
2. Under **Google font**, type the family as it is named on Google Fonts, for example `Open Sans`.
3. Tick the **Weights** you need (Regular 400 and Bold 700 are ticked) and **Italic too** if you
   want italics. Latin is always downloaded; tick **Latin Extended**, **Cyrillic**, **Greek** or
   **Vietnamese** for those alphabets.
4. Click **Download from Google Fonts**.

Your site's server downloads the WOFF2 files from Google once (one request per weight and style)
and stores them like uploads. Public pages then only reference your site's own addresses. The
server only talks to `fonts.googleapis.com` and `fonts.gstatic.com`, follows no redirects, and
caps every answer's size; this works the same on Node and on Cloudflare Workers.

Google fonts are open source: almost all use the SIL Open Font License (OFL), the rest Apache 2.0
or the Ubuntu Font Licence. All of them allow self-hosting. Families split into hundreds of files
(Chinese, Japanese, Korean) are refused; upload a WOFF2 subset instead.

## Removing a font

Each weight and style has a **Remove** button. Removing the last one turns the variable back into
a plain font stack. The files stay on the server, so pages published with them keep working;
deleting a variable works the same way.

## How it works

- EmDash's media library (1.4 and 1.5) doesn't accept font files: its upload allowlist has images,
  video, audio and PDF only, and changing it would mean changing the host site. So EmVB keeps the
  files in its own plugin storage, named by a hash of their bytes, and serves them from
  `/_emdash/api/plugins/emvb/font?id=…` as `font/woff2` with
  `Cache-Control: public, max-age=31536000, immutable` (the same address always serves the same
  file). A site keeps up to 300 font files.
- Uploading and downloading need an editor or above; loading a font file is public, like the page.
- The stored format is in [SCHEMA.md](../SCHEMA.md) (font variables' `family`, `faces` and
  `source`). Agents over MCP can set those keys too; the font files themselves are added in the
  editor.
- A font file must be on your own site: a face whose address points at another host (for example
  `fonts.gstatic.com`, added by hand, by an import or by an agent) is refused when saved and never
  written into a page.
- The HTML export (Leaving EmVB) copies the font files with **Copy images and files**, into `media/` as
  `font-<id>.woff2`, and points the `@font-face` rules there.
