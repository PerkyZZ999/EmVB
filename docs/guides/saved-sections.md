# Saved sections

Save any element, with everything inside it, under a name and reuse it on other pages.

## Save

Select an element, then choose **Save as section…** from its **···** menu in Layers, or
**Save selected element as a section…** in the command palette (Ctrl/Cmd+K). Give it a name and
pick a kind:

- **Copy** adds it to **My sections**. Every insert is an independent copy that you edit on that
  page; changing one copy changes nothing else.
- **Synced** makes a **Section theme part** (Theme Builder) from the element and puts the element
  inside a **Theme section** that embeds the part. Edit the part once in Theme Builder and every
  page that uses it follows. Publish the part in Theme Builder to use it on the site; until then
  the page shows the element as it was.

The page itself can't be saved as a section. A saved copy never takes part in an A/B test.

## Insert, rename, delete

**My sections** sits at the end of the **Add** panel, listed by name. The panel's search filters
it. Click a name to insert a copy after the selection (outside the current Section, like a
section recipe). The command palette's **Insert** group lists them as well.

Use the pencil to rename a section in place (Enter saves, Escape cancels) and the bin to delete
it. Delete asks first; pages that already use a copy keep it.

## Classes

A saved section carries the classes it uses. When you insert it:

| On this site | What happens |
| --- | --- |
| No class with that id or name | The class is added to Site styles. |
| A class with the same id or name and the same styles | That class is reused. |
| A class with the same id or name but different styles | The saved one is added as a copy named "Card 2" (or 3, …) and the inserted elements use the copy. |

An existing class is never changed, so the rest of the site keeps its look and the inserted
section keeps the look it was saved with (decision D-060). References to colours, fonts or sizes
the site doesn't have are dropped, as with paste. A site holds at most 100 classes; an insert that
would go over is refused. New classes go to the Site styles draft like any other change: publish
styles to make them live.

## Storage and agents

Sections are kept per site in EmVB's plugin storage (`emvb_saved_sections`, up to 200). Only
editors and admins can list, save, rename, insert or delete them. Every save is checked on the
server, and older saves are upgraded to the current page format when they are read; one that can't
be read is listed as such and can only be deleted.

AI agents use the MCP tools `list_saved_sections`, `save_section` (copies only),
`insert_saved_section` and `delete_saved_section`; see [the MCP guide](mcp.md).
