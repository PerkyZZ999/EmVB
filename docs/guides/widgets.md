# Widgets

EmVB 1.2 adds the common widgets site builders expect: Star rating, Alert, Icon box, Image box,
Testimonial, Social icons, Gallery and Carousel. EmVB 1.3 adds the marketing widgets: Counter,
Progress bar, Countdown, Map, Price table, Price list, Call to action, Flip box, Animated headline,
Share buttons and Hotspots. They are in the editor's Add panel under Content
(the Carousel under Layout), AI agents can add them over MCP, and the accessibility check knows
each one.

Like every EmVB element they publish plain HTML and CSS. Most use no script at all. The Alert,
Gallery, Carousel, Counter, Countdown, Map, Animated headline and Share buttons have options that
need a small script; it loads only on a page that turns one of those options on, and the page
works without it until it arrives. Anything that moves respects visitors who prefer reduced
motion, and anything that keeps moving for more than five seconds can be paused.

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

## Counter

A number to show off, such as "1,200+ happy clients": the **Number**, text **Before** and **After**
it, a **Title**, **Decimals** and a **Thousands separator**. It is plain text on the page. Turn on
**Count up when scrolled into view** and it counts from **Count from** (0 unless you set it) in at
most five seconds; visitors who prefer reduced motion see the final number at once, and screen
readers hear only the final number. The accessibility check warns about a counter without a title.

## Progress bar

A bar filled to a **Value** out of a **Maximum** (100 unless you set it), in the element's text
colour, with its **Title** and, if you like, the percentage. Pick its **Meaning**: a measurement
such as a skill (screen readers hear a meter) or how far a task has got (a progress bar).
**Grow in when scrolled into view** animates the fill with CSS only, in browsers that support
scroll-driven animations, and not for visitors who prefer reduced motion. No script.

## Countdown

A deadline written as a date: "Ends 1 Dec 2026, 09:00 UTC−5". Type the **Ends at** date with its
time zone offset, such as `2026-12-01T09:00-05:00` (or `Z` for UTC). **Show a live countdown** adds
days, hours, minutes and seconds (or no seconds) that tick, with a **Pause** button; screen readers
keep reading the date rather than a number every second. **When time is up** it shows your ended
text, shows it as a link, or hides the countdown.

## Map

An **Address** with a link to it on OpenStreetMap or Google Maps, at exact coordinates if you give a
**Latitude** and **Longitude**. **Visitors can load the map on the page** adds a Show the map button:
the map service is contacted only when a visitor presses it, so pages stay private and fast. An
OpenStreetMap map needs the coordinates; Google Maps can show the address. If your site sends a
Content Security Policy, allow `frame-src https://www.openstreetmap.org https://www.google.com`.

## Price table and Price list

A **Price table** is a plan card: title, description, price with **Currency** and **Period**, a
**Regular price** struck through when it is on sale, what is **Included** and **Not included** (one
per line), a button and a **Featured** ribbon. Screen readers hear which price is the sale price
and which features aren't included.

A **Price list** is a menu: each row has a title, a dotted leader and the price on one line, an
optional description, picture and link. Add, reorder and name rows in the panel. No script.

## Call to action

A box with a **Picture** behind the words (under a dark overlay that keeps white text readable) or
above or beside them, a title, text, a button and an optional ribbon. Give it a **Link** and the
whole box opens it through its title, so screen readers hear one link instead of two. No script.

## Flip box

A card with a front and a back that turns over on hover, when keyboard focus reaches the back's
link, or with its **Turn over** tick box on touch screens, all without script. Pick the direction
it turns. Screen readers read both faces, and visitors who prefer reduced motion see the faces swap
without the turn. The back's button shows only once it has a **Button link**; the accessibility
check warns about button text without one.

## Animated headline

A heading with **Highlighted words** between text **Before** and **After** them, marked with an
underline, a circle or a strike drawn once (already drawn for visitors who prefer reduced motion).
List **Other words** and turn on **Rotate the words** to swap the highlight through them for a few
**Rounds** with a Pause button, then stop on the first; screen readers read one steady sentence.
The accessibility check counts it as a heading.

## Share buttons

Links that share the page on Facebook, X, LinkedIn, WhatsApp, Telegram, Reddit, Bluesky, Threads
or by email, with the same icons, shapes and brand colours as Social icons, named for screen
readers ("Share on X"). They are plain links to each service's own share page, so there is no
tracking script and nothing is sent to those services until a visitor clicks. **Add the device's
Share button** adds a Share… button for the phone's or browser's own share sheet where it has one.
`resolveEmVBPage` gives the links the page's address; the HTML export leaves them out, because it
doesn't know your site's address.

## Hotspots

A **Picture** with numbered markers. Each marker has a **Title** and a **Note** and sits at a place
**Across** and **Down** the picture in percent, with its own places on tablets and phones if you
like. A marker is a button named by its title that opens its note with the browser's built-in
popover: no script, Escape or a click outside closes it, and keyboards and screen readers reach
every marker. Where the browser supports it, the note appears next to its marker.

## Search form

Add → Content → **Search form** is a search box and a button that send the words to your site's
search page, `/search?q=…`, the page EmDash's own Search widget uses. It is a plain form: no
script, and it works before any script loads. In its settings you can change the placeholder, the
button's text, the name screen readers hear (unset "Search") and the search page, such as
`/fr/recherche` for a French page (the browser drops anything after a `?` in that address, and
the address isn't offered for translation, so set it on each translated page). Pair it with a
**Search Results** template in Theme Builder.
Being a form itself, it can't go inside a **Form** element.

## Light and dark, and the Theme toggle

In **Site styles → Colors**, open a colour and give it a **Dark mode** value. Visitors whose device
is set to dark see those colours (and dark scrollbars and form controls); the others see the
normal ones. Colours without a dark value stay the same in both.

Add → Content → **Theme toggle** adds a "Dark mode" button (a toggle screen readers hear as on or
off) that lets visitors choose for themselves; the choice is remembered in their browser. It needs
a small script that loads only on pages with a toggle, so on a page without it no button shows.

A site whose Site styles have any Dark mode value also gets one tiny inline script at the start of
each EmVB page and theme part. It puts the visitor's stored choice back before the page is drawn,
so the page never flashes the device's look first, and the choice holds on pages without a toggle.
A site with no Dark mode value gets no script. If your site sends a Content Security Policy that
blocks inline scripts, allow this one by its hash,
`'sha256-tQy7biF/kugrT/8W/ZtwVQWgAwcnKKMv4WLE+A1RGjQ='` (EmVB pages already need inline styles
allowed). Without it, the stored choice applies once the toggle's own script runs, on pages with a
toggle.

## Scripts in theme parts

A page built with `EmVBPage` mounts the scripts its own widgets need, with no change to your site.
To use a dismissible Alert, a lightbox Gallery, Carousel controls or any of the 1.3 widgets' scripts
inside a header, footer or other theme part, add this once to your site layout (see the
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
Gallery, and Image and Media Carousel widgets import as these elements, with their options. Since
1.3 so do its Counter, Progress Bar, Countdown, Google Maps, Price Table, Price List, Call to
Action, Flip Box, Animated Headline, Share Buttons and Hotspot, and Slides and Testimonial Carousel
become a Carousel. See
[Import from Elementor](elementor-import.md).
