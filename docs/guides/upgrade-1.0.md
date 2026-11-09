# Upgrade from 0.9 to 1.0

1.0 freezes EmVB's stored formats for the whole 1.x line ([schema contract](../SCHEMA.md)) and adds
co-design with AI agents, languages, loops and extensions. Most sites upgrade by changing the
package version; read the steps below once.

## Before you start

- **EmDash 1.4.** 1.0 is tested on EmDash 1.4.0 and needs nothing changed in your EmDash setup.
  It keeps EmDash's zod pin (4.5.4); no override is needed.
- **Back up** your database (the `emvb_pages`, theme parts and design rows).
- 1.0 opens every page, theme part and design saved by 0.1–0.9. Once saved by 1.0 (layout schema 18,
  design schema 17), a page can't be opened by 0.9 or earlier, so upgrade every editor's site at once.

## Steps

1. Update the package (it brings the matching `@perkyzz/emvb-icons`):

   ```sh
   npm i @perkyzz/emvb@1
   # or: bun add @perkyzz/emvb@1
   ```

   Keep the Astro version your site has; 1.0 needs no Astro change. If you held `astro` at
   7.3.5 for 0.9, you can drop that pin. Agents' computers pick up
   `@perkyzz/emvb-mcp@1` on their next `npx -y` start.

2. Build and deploy as usual. Nothing in `astro.config.mjs` has to change.

3. **Re-approve EmVB's AI tools** if you use agents. EmDash approves a plugin's MCP tools as an
   exact list, and 1.0 adds tools (`list_page_outline`, `propose_changes`, `get_proposal`,
   `withdraw_proposal`, `get_requests`) and rewords some. Until an admin approves them again on
   EmDash's **Plugins** screen, agents see no EmVB tools at all. The **Setup** card on
   **Pages VisualBuilder → AI agents** tells you when this may be needed.

4. Open a page in the editor and **Save draft** to check it (optional). Pages are upgraded on read;
   saving stores the 1.0 shape.

## What changes for you

- **Renamed keys, upgraded automatically.** The Theme section element is now `part-ref` (was
  `section`), an element's editor name is `editorLabel` (was `label`), a Loop's item part is
  `props.partId` (was `itemPartId`), and motion lives under `style.motion` (`transition`,
  `entrance`, `scroll`, `icon`, and the new `loop`). Pages render byte for byte as in 0.9. The old
  names are still accepted on input, so existing MCP prompts and scripts keep working; new code
  should use the new names.
- **Agents propose while you edit.** While someone has a page open in the editor, an agent's
  direct writes to it are refused with `PAGE_OPEN`; it sends a proposal instead, reviewed in the
  editor's **Agent** tab. See [Co-design](co-design.md).
- **Laptop is a device.** Desktop, Laptop (1025 to 1366 px), Tablet and Mobile. Pages from 0.9
  that hide something on Desktop keep hiding it on laptops; from now on, Hide on Desktop means
  wider than 1366 px, and Hide on Laptop is separate.
- **Unknown keys are kept.** A key EmVB doesn't know is stored untouched and not rendered, so a
  page saved by a later 1.x opens and saves without losing anything.

## Optional new features

- [Co-design with an AI agent](co-design.md): Agent tab, Ask your agent, `emvb-mcp watch`.
- [Languages](languages.md): per-language pages, Translate this page, the Language switcher.
  Needs Astro `i18n` and a route per language; see the install guide's Languages section.
- [Motion](motion.md): loops in Effects.
- [Extensions](extensions.md): custom elements, panels and sources from code.
- [Import from Elementor](elementor-import.md): bring Elementor 3 and 4 pages and templates over
  as drafts, with a report of what was kept, changed or left out; copy their images, set page
  links, and optionally keep Elementor's classes as site classes.
- New in the editor (all optional; pages that don't use them render as before):
  - **Formatting** on Heading and Text: bold, italic, colour and links on selected words.
  - **Fluid sizes:** type a range such as `32–56` in Font size, Gap, a width or height, Padding
    or Margin.
  - **Lists:** Marker (bullets, numbers, letters, Roman numerals, numbered steps) and Start at;
    Marker color and size.
  - **Effects:** Transform (move, scale, rotate, also in Hover), Backdrop filters, gradient
    overlays on image and video backgrounds.
  - **Flexbox children:** Grow, Shrink, Basis, Align self and Order.
  - **Typography and Size:** Style (italic), Line wrapping, Long words, Overflow X and Y, Object
    position.

## If something goes wrong

Downgrading to 0.9 is safe only for pages 1.0 hasn't saved. Restore your backup for the others.
Report problems at <https://github.com/PerkyZZ999/EmVB/issues>.
