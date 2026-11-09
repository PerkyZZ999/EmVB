# Languages

EmVB pages follow EmDash's translations: each language of a page is its own entry with its own
layout, linked to the others. Turn on languages with Astro's `i18n` setting; see the install
guide's [Languages section](install-in-a-host-site.md#languages-optional) for the route setup.

## Translate a page

Open the page in the editor. With nothing selected, **Page settings → Languages** lists the site's
languages:

- **This page** marks the language you are editing.
- **Open** goes to an existing translation.
- **Translate** makes a draft in that language with a copy of this page's layout, linked to this
  page, and opens it. Change the words; links, images and form field names stay as they are.

With **Ask my agent to translate the new page** ticked, Translate also sends your agent a request
naming both languages. Review its proposal in the new page's Agent tab
([Co-design](co-design.md)).

## What visitors see

A page shows in the visitor's language when it has a published translation. Otherwise EmDash
shows the next language in its fallback chain, and your route can say so (`fallbackLocale`).

## Language switcher

Add the **Language switcher** element (Add → Content) to a page, or to a header or footer theme
part. It links the page's other published languages, each in its own name ("Français", "English")
with `hreflang`; the language being shown is marked as the current page. Drafts are never linked,
and a page with only one published language shows nothing. Its **Label** names the navigation for
screen readers (default "Languages").

Theme parts (header, footer, popups) are shared by every language for now.
