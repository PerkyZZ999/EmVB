# Import from WordPress or HTML

Bring posts and pages written with WordPress's block editor (Gutenberg), or any HTML page, into
EmVB. The import reads the markup you paste or upload, builds an EmVB page from it, and tells you
what it kept, what it changed to fit EmVB, and what it left out, before anything is created.

For pages built with Elementor, use [Import from Elementor](elementor-import.md) instead: it reads
Elementor's own export and keeps much more of the design.

## Get the content

- **From WordPress:** open the post or page in the block editor, open the **⋮** menu (Options) and
  choose **Code editor**, then select all the text and copy it. That is the post's block markup
  (`<!-- wp:paragraph -->` comments around the HTML of each block).
- **From any website:** save the page from your browser (**Save page as… → Webpage, HTML only**),
  or copy its source (**View page source**). Only pages you own or may reuse, of course.
- **From a file:** any `.html` file you have, such as a page exported from another tool.

EmVB never fetches a page from an address: you paste the markup or choose the file, so the server
makes no requests to other sites.

## Import it

1. In the admin, open **Pages VisualBuilder** (or **Theme Builder** for a header, footer or other
   theme part) and choose **Import HTML**.
2. **Choose file**, or paste the markup under **Or paste the HTML**.
3. Read the report. The title comes from the page's `<title>`, or its first main heading; change it
   if you like, and check the slug. In Theme Builder, pick the part's **Type** (Section by default).
4. **Import** creates a draft and opens it in the editor. Nothing is published until you publish.

When a whole HTML page has a `<main>` element, only what is inside it is imported: the site's
header, navigation and footer are left out (build those once in Theme Builder). The report says
so.

### Images

Images keep their address. When they load from your old site, the dialog shows **Copy images**:
it puts them in your media library and the page uses the copies. Copying works when your old site
lets other sites read its files; if it doesn't, download them and add them with **Add image files**
(matched by file name). Copies stay in the media library even if you don't import.

Images with a site-relative address in a saved page (`/images/photo.jpg`) now point at this site.
Upload those files and pick them in the editor; the report lists them.

### Links

Links keep their address. Links to pages on your old WordPress site become the same path on this
site (`https://old-site/contact/` → `/contact`), so they work once those pages exist here with the
same slugs.

## What is imported

**WordPress blocks**

| Block                                             | Becomes                                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Paragraph, Heading                                | Text, Heading, with bold, italic, coloured and linked words, alignment                  |
| List (and List item)                              | List, numbered when ordered; nested items join it one level down                        |
| Image                                             | Image with its alt text, caption and link                                               |
| Gallery                                           | Gallery (its columns; the lightbox when the images linked to their files)              |
| Quote, Pullquote                                  | The quote's paragraphs beside a line, then "— who said it"                              |
| Buttons, Button                                   | A row of Buttons with their links (new tab kept)                                        |
| Columns, Column                                   | A row of boxes with the columns' widths, stacked on phones unless turned off            |
| Group, Row, Stack, Grid                           | A box (or Grid) with the group's background, text colour, padding and corner radius     |
| Cover                                             | A box with the image (or video) behind, its overlay, minimum height and white text      |
| Media & Text                                      | A row of the media and the text, stacked on phones                                      |
| Separator, Spacer                                 | Divider, Spacer with its height                                                         |
| Embed (YouTube, Vimeo), Video                     | Video                                                                                   |
| Embed (other services)                            | A link to the original                                                                  |
| Table                                             | A Grid of text (header cells bold)                                                      |
| Details                                           | Accordion with one item                                                                 |
| Code, Preformatted, Verse                         | Text that keeps its line breaks (code and preformatted in a monospace font)             |
| Search                                            | Search form (it sends visitors to this site's `/search`)                                |
| Social Icons                                      | Social icons, for the services EmVB has                                                 |
| Custom HTML                                       | The plain elements inside it, as for an HTML page                                       |

Blocks' own text and background colours, font sizes in px, rem or em, padding and corner radius
carry over, because WordPress stores them as values EmVB can check. Your theme's colour and size
presets (`has-vivid-red-color`, "Large") aren't on this site: those blocks take your EmVB site
styles, and the report says so.

**Any HTML page**

`h1`–`h6`, `p`, `ul`/`ol`, `img` (with `figure` and `figcaption`), `a`, `blockquote`, `hr`,
`table`, `details`, `pre`, `dl`, `video` and YouTube or Vimeo `iframe`s map onto the same elements
as above. `section`, `article`, `header`, `footer`, `aside`, `nav`, `main` and `div` become boxes
(a box with a single child adds no level; an `id` stays as the box's HTML id, so `#anchor` links
keep working). A link with a button class (`button`, `btn`, WordPress's `wp-block-button__link`)
becomes a Button. An image alone in a link keeps the link.

Text keeps bold, italic, colour (from a `color` style or `<font color>`) and links, and line breaks
inside a paragraph. Text alignment is kept from `text-align` and WordPress's `has-text-align-*`
classes. Other formatting (underline, superscript, code, highlights) becomes plain text.

## What is changed or left out

- **Styles:** the old site's stylesheets, classes and inline styles aren't imported (apart from
  text colour and alignment). The page takes your EmVB site styles; restyle it in the editor.
- **WordPress-only blocks:** Latest Posts, Query Loop and other post lists, Navigation, Site Logo
  and Title, Template Parts, comments, Archives, Categories, Calendar and other widgets, synced
  patterns (reusable blocks, only a reference in the post) and shortcodes. WordPress builds these
  when the page is shown, so there is nothing to import; rebuild them with EmVB's elements (a Loop
  for post lists, a Menu for navigation).
- **Blocks from plugins** (`jetpack/…`, `acme/…`): EmVB keeps their text, images and links in
  plain elements and names the block in the report.
- **Forms** and their fields: rebuild them with a Form element (forms plugin).
- **Frames** other than YouTube and Vimeo videos (maps, other sites' widgets), audio players,
  embedded objects, canvas and inline SVG drawings.
- **Scripts, styles and event handlers** (`onclick`, `onerror` and the like) are always removed.
- **Tables** become a grid of text: they look like a table but screen readers no longer read them
  as one. Tables keep up to 100 rows and 12 columns.
- **Nested lists** become one level.
- **Links around whole boxes** (a card that is one big link) are left out; the content stays.

## Limits and safety

A file can be up to 4 MB. One import reads up to 20,000 pieces of markup and builds up to about
1,800 EmVB elements and 200,000 characters of text; the rest is left out and reported, so import
very long pages in parts. Boxes nested more than 10 levels deep are flattened into their parent.
Long text is split across several Text elements, never cut.

The import never puts HTML on your page. It reads the markup into plain text, a few checked style
values and addresses, and every address goes through the same checks as anything you type in the
editor: only `http(s)`, `mailto:`, `tel:` and site-relative links, and `http(s)` or site-relative
images. `javascript:`, `data:` and `//other-site` addresses are refused, including when they are
hidden with character references (`&#106;avascript:`). So pasted markup can't add scripts or unsafe
links to your site.

## Why the markup is read in EmVB's core

The import reads the HTML with a small reader of its own (in EmVB's framework-free core) rather
than the browser's DOM parser. The same input gives the same result in the admin, on the server
and in tests; WordPress's block comments come out as structure, with their settings; and nothing
in the pasted markup is ever loaded or run while it is read.
