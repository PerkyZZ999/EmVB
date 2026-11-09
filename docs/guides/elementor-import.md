# Import from Elementor

Bring pages and templates you built with Elementor on WordPress into EmVB. The import reads
Elementor's own JSON, builds an EmVB page from it, and tells you what it kept, what it changed to
fit EmVB, and what it left out, before anything is created.

## Export from Elementor

In WordPress, go to **Templates → Saved Templates**, then **Export** the template you want. To
export a page, open it in Elementor, choose **Save as Template** from the Update button's menu,
then export that template. You get a `.json` file.

You can also paste the page's `_elementor_data` (from the database or a WordPress export tool), or
an element copied from the Elementor editor.

For exact global colours and fonts, also export your **site kit** (**Elementor → Tools → Import /
Export Kit → Export**, then take `site-settings.json` from the zip).

## Import it

1. In the admin, open **Pages VisualBuilder** (or **Theme Builder** for headers, footers and other
   theme templates) and choose **Import from Elementor**.
2. **Choose file** (or paste the JSON). Optionally **Add site kit**.
3. Read the report. The title comes from the template; change it if you like, and check the slug.
4. **Import** creates a draft and opens it in the editor. Nothing is published until you publish.

### SVG files

SVG icons and the Elementor 4 SVG element point to files on your old site. When the export gives
their address, the dialog shows **Fetch SVG files** and **Add SVG files**. With the file, the SVG
becomes an Icon that keeps its own drawing, and parts drawn in `currentColor` take the colour you
set in EmVB. Fetching works when your old site lets other sites read its files. If it doesn't,
download the files from the WordPress media library and add them: they are matched by file name. An
SVG without its file stays an image.

Elementor 4 exports often name an SVG only by its WordPress media number. Those become empty Icon
elements at the right size; pick each file in the editor (**Icon → My uploads**).

**Give unstyled widgets Elementor's default colours and fonts** is on by default: widgets you never
styled in Elementor look the way Elementor showed them (its kit colours, Roboto). Turn it off if
your site had Elementor's default colours and fonts disabled, so those widgets take your EmVB site
styles instead.

In **Theme Builder**, an Elementor header becomes a Header, a footer a Footer, a popup a Popup, a
single template a Single post or page, and so on. Other templates import as a reusable Section;
pick another type in the dialog if you want.

## What is imported faithfully

- **Layout:** Flexbox and Grid containers (direction, gap, alignment, wrap, width, minimum height,
  boxed or full width, columns per device), legacy sections and columns (column widths, gaps,
  vertical position, stacking on phones), and inner sections.
- **Style:** backgrounds (colour, image, gradient, overlay), padding, margins, borders, corner
  radius, box shadow, typography (family, size, weight, line height, letter spacing, case,
  decoration), text colour and alignment, entrance animations, visibility per device, and the
  tablet and mobile values of all of these.
- **Widgets:** Heading, Text Editor, Image, Button (with its icon and hover colours), Spacer,
  Divider, Icon, Icon Box, Image Box, Icon List, Video (YouTube, Vimeo, files), Counter, Progress
  Bar, Testimonial, Star Rating, Alert, Tabs, Accordion, Toggle, Nested Tabs, Nested Accordion,
  Social Icons, Basic Gallery, Menu Anchor, and HTML (as plain elements).
- **Theme builder:** Post Title, Post Content, Post Excerpt, Featured Image, Post Info (author and
  date) and the Elementor Pro dynamic tags for the post title and featured image become EmVB's
  dynamic elements.

## Elementor 4 (atomic) pages

Pages built with Elementor 4's new elements (Flexbox, Div Block, Heading, Paragraph, Button,
Image, SVG, Divider, YouTube, Accordion, Tabs and the Form fields) import with their styles. An
Elementor 4 export carries the global classes and variables the page uses; EmVB applies them to
each element, so the import never changes your site's own design system.

- Each class's desktop, tablet and mobile values and its hover and focus states carry over.
  Laptop and "extra" breakpoints fold into Tablet and Mobile, the way Elementor's desktop-first
  breakpoints reach the smaller screens.
- Fluid sizes (`max(32px, min(56px, …))`) use their large value on desktop and their small value
  on phones. Centred wrappers (`min(1180px, calc(100% - 48px))`) keep their maximum width and
  side gutters.
- Grids keep their columns per device, including uneven ones (`20% repeat(5, 1fr)`), and children
  that span every column.
- A class's own custom CSS is applied where EmVB has the property (borders on one side, gaps,
  weights, overflow and so on).
- Forms keep their fields, labels and the layout around them.
- A gradient drawn over a background image keeps its gradient as an overlay.
- Transforms, flex grow and shrink, and links to WordPress pages are listed in the report.

## What is approximated

These keep their content in the closest EmVB form, and the report says so:

- **Pro widgets:** Form (its fields; connect it to a form in the forms plugin), Call to Action,
  Price Table, Flip Box (back below the front), Animated Headline (no animation), Slides and
  carousels (stacked or as a grid), Blockquote, Table of Contents, Code Highlight.
- **Google Maps** becomes a link to the map; **Star Rating** shows star characters; counters and
  progress bars show their final value.
- **Text formatting** inside a paragraph (bold, italic, coloured or linked words) becomes plain
  text. Paragraphs, headings, lists, line breaks, images and video embeds stay separate elements.
- **Custom CSS** (Pro): rules on `selector` itself are applied where EmVB has the property (colour,
  background colour, font size and weight, alignment, spacing, radius, opacity and a few more).
  Rules for inner parts, and properties EmVB has no setting for, are listed.
- **Other dynamic tags** keep the fixed fallback value Elementor stored.
- **Third-party widgets** (Essential Addons, ElementsKit, JetElements and others): EmVB keeps their
  titles, text, images and buttons in a plain layout and names the widget in the report.

## What is left out

WordPress-only things: shortcodes, WordPress widgets and sidebars, menus (the Menu element is
created empty: add its links), the site logo and title, post lists and loops (rebuild them with
EmVB's Loop element), comments, search and login forms, countdowns, share buttons, Lottie,
hotspots, motion effects, sticky positioning and Elementor CSS classes. Scripts and styles in HTML
are always removed.

## After importing

- **Images still load from your old site.** Upload them to the media library and swap them in
  before the old site goes away.
- **Fonts:** the report lists the font families the page uses. Make sure your site loads them.
- **Alt text:** images that had none in the export get one from their file name. Check each one.
- **Icons** come from EmVB's Font Awesome set. A few renamed or missing icons are listed; pick a
  similar one in the editor.

## Limits

A file can be up to 8 MB. One import reads up to 5,000 Elementor elements and builds up to about
1,800 EmVB elements; the rest is left out and reported, so import very long pages a section at a
time. Elements nested more than 16 levels deep are left out. Long text is split across several
Text elements, never cut.

Every imported text is plain text and every address goes through the same checks as anything you
type in the editor, so an export can't add scripts or unsafe links to your site.
