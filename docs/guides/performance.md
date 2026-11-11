# Performance on large pages

EmVB pages can hold up to 2,000 elements. These numbers show what a page that size costs, on the
site and in the editor, so you can plan big pages with confidence. They were measured for 1.1
(W-979) and you can measure your own machine the same way (see the end of this page).

## The test pages

Generated marketing pages: each section has a heading, a list, a grid of four cards (image,
heading, text, button, with a class and a hover style), and an accordion of two questions, with
Tablet and Mobile values on several elements. 7, 33 and 66 sections give about 200, 1,000 and
1,900 elements.

## On the site

Rendering a page is the work your server does for each visitor (before any cache). Measured with
Bun on an AMD Ryzen 7 5800XT, median of 15 to 40 runs.

| Elements | Check the stored page | Render | HTML | CSS | HTML and CSS, gzipped |
| --- | --- | --- | --- | --- | --- |
| 204 | 7 ms | 2 ms | 16 KB | 14 KB | 3 KB |
| 958 | 12 ms | 8 ms | 74 KB | 53 KB | 9 KB |
| 1,915 | 24 ms | 17 to 19 ms | 149 KB | 103 KB | 17 KB |

- The page ships no script of its own. Popups, floats, tabs and menus add a small script only on
  pages that use them.
- Each styled element has its own small CSS rule, so CSS grows with the page; it compresses well
  (about 6 to 1 with gzip, which hosts apply by default).

## In the editor

Measured in Chromium against the Node demo's production build, on the same machine. "Open" is
from loading the editor to the last section showing on the canvas. The edits are keyboard
shortcuts on a selected heading; each time runs until the canvas shows the change.

| Elements | Open | Duplicate | Undo | Switch to Mobile | Back to Desktop |
| --- | --- | --- | --- | --- | --- |
| 204 | 1.4 s (first load) | 36 to 41 ms | 28 to 29 ms | 84 to 96 ms | 66 to 91 ms |
| 958 | 0.56 s | 55 to 64 ms | 41 ms | 96 to 102 ms | 81 ms |
| 1,915 | 0.54 s | 81 to 82 ms | 64 to 65 ms | 120 to 132 ms | 107 to 111 ms |

An edit on the largest page a layout can hold shows within about a tenth of a second. Switching
devices lays the whole page out again at the new width, which is mostly the browser's own work.
The first row includes the editor's first load in the browser.

What the 1.1 pass changed: the Accessibility dialog no longer builds its list of issues while it
is closed. In the development build that saved about 10 ms per edit on the largest page; in the
production build the numbers above are the same before and after, within a few milliseconds. A
cache that reused the canvas's unchanged elements between edits was tried and left out: it only
helped the development build (React's development checks), and production gained nothing.

## Measure it yourself

From a checkout of the EmVB repository:

```bash
bun run bench:large
```

prints the site table. For the editor table, start the Node demo (`bun run demo:node`), build and
start its production version (`bun run demo:node:build`, then `bun run demo:node:prod`), and run:

```bash
EMVB_DEMO=http://127.0.0.1:4421 EMVB_LOGIN=http://127.0.0.1:4411 bun run bench:editor
```

`bun run bench:render` keeps the older single number (a 300-element page renders in under 20 ms),
and `scripts/bench-large.test.ts` checks the largest test page stays well within its budget.
