# Motion

Everything moves with plain CSS: no script on the page. Every kind of motion is off for visitors
who ask their system for reduced motion. Find them in the **Style** tab's **Effects** section.

| Motion | What it does | Plays |
| --- | --- | --- |
| **Entrance** | Fade, slide or scale in once | On load, or as the element scrolls into view |
| **Scroll motion** | Opacity, move, scale, rotate or blur tied to scrolling | While the element enters, crosses or leaves the screen, or over the whole page |
| **Loop** | The same effects played over time | Back and forth (or one way), about 5 seconds unless **Loop forever** |
| **Transition** | Smooths changes to hover, focus and active states | When the state changes |

An Icon also has its own **Spin** and **Pulse** (see the [icon library guide](icon-library.md)).

## Loops

**Add loop** starts with **Float**. Pick another ready-made motion (Pulse, Breathe, Wiggle, Drift
sideways, Spin), or tune it: **Duration**, **Easing**, **Back and forth**, and each effect's
**From** and **To**. **Add effect** adds opacity, move, scale, rotate or blur. The canvas plays it
as you edit.

A loop stops on its own after about 5 seconds. **Loop forever** keeps it going; use it sparingly:
motion visitors can't pause can distract, and the accessibility check flags it.

## Hover effects

Use the **Normal / Hover / Focus / Active** switch under the Classes box with a **Transition**:
for example a slight Scale and a Shadow on Hover, with a 150 ms transition on Normal.

## Devices and classes

Each kind of motion can differ on tablet and mobile, or be turned off there. Motion set in a class
applies to every element using it; the element's own wins.
