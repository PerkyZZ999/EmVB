# Popups and off-canvas panels

A popup is a theme part: you build it once in **Theme Builder** and it shows on the pages its
display conditions pick. Since 1.4 a popup can also be an off-canvas panel that slides in from the
edge of the screen, and it can be limited to certain page addresses and dates.

Popups need a small script, which loads only on pages that have a popup. Each popup is a dialog:
keyboard focus moves into it and stays there until it closes, Escape or the close button closes it,
and focus goes back to where it was.

## Make a popup

1. In **Theme Builder**, press **New theme part** and choose **Popup**.
2. Build its content like a page.
3. With nothing selected, the Settings panel shows **Theme part settings**. Set the display
   conditions (which pages), then the **Triggers** (when it opens). **Entire site** means every
   page that renders EmVB theme parts: EmVB pages and the routes whose layout adds them. A blog
   home or post list built from your site's own templates shows no popup until its layout adds
   theme parts; see
   [Theme parts on your site's other routes](install-in-a-host-site.md#theme-parts-on-your-sites-other-routes).
   The triggers:
   - **On page load**, **After delay**, **On scroll**, **Exit intent** or **After inactivity**.
   - **On click (selector)**: it opens when a visitor clicks an element that matches a CSS selector,
     such as `#menu-button`. Give that button a **CSS id** in its Advanced settings.
4. Publish it.

## Off-canvas panels

Under **Show as**, change **Shape** from **Popup in the middle** to **Panel from the left** or
**Panel from the right**, and pick a **Panel width**: **Narrow** (20rem), **Medium** (24rem) or
**Wide** (32rem). A panel is never wider than the screen less 3rem.

The panel fills the screen's height and slides in from its edge. Use it for a mobile menu, filters
or a cart, opened by an **On click (selector)** trigger on a button. It is the same dialog as a
popup, so keyboard and screen reader users get the same behaviour. The button that opens it is
announced as opening a dialog, and screen readers hear whether the panel is open. Visitors who
prefer reduced motion see the panel appear without the slide.

A panel can hold a Menu with a [mega menu](widgets.md#mega-menu) item: on phones the mega panel opens
inline under its item.

## Limit where and when it shows

The **Advanced** settings limit how often, on which devices, on which addresses and when a popup
shows:

- **Show at most (times)**: how many times one browser sees it. A click trigger always opens it.
- **Devices**: desktop, tablet or mobile. All devices when none are checked.
- **Only when the page address has** (1.4): one rule per line.
  - `utm_source=newsletter`: the address has that value, as in `?utm_source=newsletter`.
  - `coupon`: the address has `coupon`, with any value.
  - `!preview`: the address doesn't have `preview`.

  Every rule must hold, up to five. Leave it empty for every address.
- **Show from** and **Show until** (1.4): a date, time and UTC offset, such as
  `2026-12-01T09:00-05:00`. The popup shows from the first and stops at the second. Leave either
  empty to keep that end open. The end must come after the start.

The address rules and dates apply to click triggers too: outside them, the popup isn't on the page
at all. The visitor's browser checks them, so a cached page is still right.
