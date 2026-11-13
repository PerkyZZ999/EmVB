# Widgets

EmVB 1.2 adds the common widgets site builders expect: Star rating, Alert, Icon box, Image box,
Testimonial, Social icons, Gallery and Carousel. They are in the editor's Add panel under Content
(the Carousel under Layout), AI agents can add them over MCP, and the accessibility check knows
each one.

Like every EmVB element they publish plain HTML and CSS. Most use no script at all. The Alert,
Gallery and Carousel have options that need a small script; it loads only on a page that turns
one of those options on, and the page works without it until it arrives.

## Star rating

Stars filled to a rating such as 4.5 out of 5, in the element's text colour, with half and
part-filled stars. Set the **Rating**, the number of **Stars** and their size. Screen readers hear
"Rated 4.5 out of 5"; to say it your way, write your own **Text for screen readers** with
`{value}` and `{max}` where the numbers go. The accessibility check warns when your text leaves the
rating out. No script.

## Alert

A notice in four kinds: information, success, warning and danger, with an optional title and its
icon. Each kind's colours meet 7:1 contrast. Turn on **Visitors can dismiss it** to add a close
button. Its script loads only on pages with such an Alert, and the button stays hidden until the
script runs, so it never shows a button that does nothing. Closing an Alert moves keyboard focus to
what comes next. The accessibility check warns about an empty Alert.

## Icon box and Image box

A title and text with an icon (Icon box) or a picture (Image box) **Above**, **Before the text** or
**After the text**. The icon comes from the same [icon library](icon-library.md) as the Icon
element; the picture from the media library, with alt text (or marked **Decorative**), loaded
lazily. Beside the words, a picture takes 25 %, 40 %, 60 % or the full width.

Give the box a **Link** and the whole box becomes clickable through one link named by its title, so
screen readers hear the title once instead of a list of separate links. No script.

## Testimonial

A quote with the person's name, role or company, an optional photo and an optional star rating.
It publishes as a real `figure` with a `blockquote` and a caption, and the rating is read as
"Rated 5 out of 5". The accessibility check warns about an empty quote. No script.

## Social icons

Links to your profiles on 19 networks (Facebook, Instagram, X, LinkedIn, YouTube, TikTok, Bluesky,
Mastodon, Threads, GitHub and more), plus email, RSS and a website. The brand icons are built in
(from Font Awesome Free), so public pages load no icon library.

- Add, reorder and remove links in the panel; select a link to set its network, **Profile
  address** and whether it opens in a new tab.
- Show them as icons only, or as circle, rounded square or square badges, in the text colour or
  in each network's **Brand colours**. Icons follow the font size.
- Each link is named for screen readers ("Instagram", or your own name), and the whole list is a
  named list.

The accessibility check warns about a link with no address, and about brand colours that are too
faint on a white page (WhatsApp, Spotify, RSS, Telegram). No script.

## Gallery

Pictures from the media library in a **Grid of squares** or **Masonry** columns, 1 to 6 wide
(fewer on tablets and phones), each with alt text and an optional caption. Add, reorder and remove
pictures in the panel.

Turn on **Open pictures large (lightbox)** and each picture becomes a button that opens it in a
dialog, with Previous and Next buttons (and the arrow keys), "2 of 5" spoken as it changes, Close
and Escape. Closing returns focus to the picture that opened it. That script loads only on pages
whose gallery uses the lightbox; without it the gallery uses no script.

## Carousel

Slides of any content (text, pictures, buttons, whole layouts) on a track that snaps to each
slide. Visitors swipe, scroll or use the arrow keys, with no script. Show 1 to 4 at once
(**Slides shown at once**; fewer on tablets and phones). Add, rename and reorder slides in the panel.

These options add a small script, loaded only on that page:

- **Previous and Next buttons** and **Slide buttons (dots)**.
- **Go round from the last slide** back to the first.
- **Play automatically**, every so many **Seconds per slide**. Autoplay is off until you turn it
  on. Then a visible Pause button comes before the slides, hovering over the carousel or moving
  focus into it pauses it, and it starts paused for visitors who prefer reduced motion.

Each slide is named "2 of 5" for screen readers, or by its own **Slide name**. The accessibility
check warns when slides change faster than every 5 seconds.

## Scripts in theme parts

A page built with `EmVBPage` mounts the scripts its own widgets need, with no change to your site.
To use a dismissible Alert, a lightbox Gallery or Carousel controls inside a header, footer or other
theme part, add this once to your site layout (see the
[install guide](install-in-a-host-site.md#3-public-route)):

```astro
---
import { EmVBWidgetRuntimes } from "@perkyzz/emvb/astro/widgets";
---
<EmVBWidgetRuntimes names={theme.runtimes} />
```

The [HTML and CSS export](leaving-emvb.md) writes the same scripts next to the pages that use them.

## From Elementor

Elementor's Star Rating, Alert, Icon Box, Image Box, Testimonial, Social Icons, Basic and Pro
Gallery, and Image and Media Carousel widgets import as these elements, with their options. See
[Import from Elementor](elementor-import.md).
