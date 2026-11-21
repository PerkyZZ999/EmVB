# Starter templates

EmVB ships ready-made sections and whole pages to start from. They use only built-in elements
and no pictures, and they take their colours, type sizes, spacing and button and card classes
from your **Site styles**, so they look like the rest of your site.

## Sections

| Template | What it holds |
| --- | --- |
| Hero | A big headline (the page's H1), a line of text and two buttons |
| Page intro | The page title (H1) and a short introduction, for inner pages |
| Features | Three benefits, each with an icon, title and text |
| Stats | Three big numbers with labels |
| Testimonials | Three customer quotes with names and star ratings |
| Pricing | Three price tables, the middle one featured |
| FAQ | Questions that open to show their answers (an Accordion, no script) |
| Team | Four people with their roles, ready for photos later |
| Call to action | A coloured band with a heading, a line of text and a button |
| Contact details | Email, phone and address boxes, with opening hours |
| Footer | Your name, a tagline, two columns of links and a copyright line |

Open **Add**, then **Templates** (next to **Elements**). Each template shows a small picture drawn
in your Site styles, in light or dark following your system setting. Search narrows the list.
Click a template, or Tab to it and press Enter, to add it after the selection, the way a section
recipe is added; or drag it onto the page. The panel remembers **Templates** for the session.

Every insert is an ordinary copy with new element ids, so you can add the same template twice
and edit each on its own; one Undo removes it. A page has one H1: on a page that already has one
(and in Header, Footer and other shared theme parts) the headline of a Hero or Page intro is added as an H2.

## Pages

**New page** offers **Landing page**, **About page** and **Contact page** under **Page template**,
marked "(starter)", next to your own page templates from Theme Builder. The new page holds the
template's sections in order, in your Site styles.

| Page | Sections |
| --- | --- |
| Landing page | Hero, Features, Stats, Testimonials, Pricing, FAQ, Call to action, Footer |
| About page | Page intro, Stats, Team, Testimonials, Call to action, Footer |
| Contact page | Page intro, Contact details, FAQ, Footer |

## Site styles and dark mode

A template picks your Site styles by name, as section recipes do: the brand (primary) colour and
its "on" colour for buttons and the call to action, text, muted, surface and border colours, the
`fs-*` type sizes and `space-*` spacing, and your Button and Card classes, which then own the
look of buttons and cards. Without them it uses neutral stand-ins: a blue brand with white text, a
translucent grey surface and border that suit light and dark pages, and text in the page's own
colour. Colours with a **Dark mode** value (W-1067) switch with the visitor's setting, so a
template looks right in both. Every template passes the accessibility check, in light and dark.

## Agents

`list_templates` lists the section and page templates; `insert_template` adds a section (at the
end of the page, or at `parentId`/`index`); `create_page` takes `template` to start from a page
template. See [the MCP guide](mcp.md).
