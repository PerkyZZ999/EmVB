# Edit your own pages with EmVB

EmVB can lay out entries in your site's own collections (for example a `pages` collection), not only EmVB pages. The entry keeps its title, slug and other fields; one JSON field holds the EmVB layout, and the entry's own Save and Publish store it. This guide is for editors. Setup for developers is in the [install guide](install-in-a-host-site.md#emvb-layouts-on-your-own-collections).

## Who can edit

Editors and administrators can change the layout field. Authors and contributors see a read-only summary of it, and the server refuses changes from them (D-061).

## Set up a collection (administrators)

1. Open **Host collections** in the EmVB section of the admin sidebar. It lists your collections, whether each has a layout field, and whether the site config lists it.
2. Click **Add canvas field** on a collection. This adds a `canvas` field with the **Edit with EmVB** widget to its schema. Existing entries keep their content and show it until a layout is added.
3. Copy the `emvb({ canvasCollections: [...] })` line from **Site config** into `astro.config` and restart or redeploy the site. EmVB can't change that file itself. Until the site lists the collection, layouts there aren't checked on save or rendered.

## Edit an entry's layout

1. Open the entry. The **Canvas** card shows a summary of the layout, or "No layout yet" while the field is empty.
2. **Edit with EmVB** opens the full editor over the admin.
3. **Preview** shows your unsaved changes in your site's styles at Desktop, Laptop, Tablet and Mobile widths. **Back to editing** returns to the editor. Preview stores nothing.
4. **Apply** puts the layout back into the entry form. Then use the entry's own **Save** (and **Publish**) to keep it. **Exit** without Apply discards the changes.

## Start from the existing content

While the field is empty, **Convert to EmVB** builds a starter layout from the entry's saved rich-text body: headings, paragraphs, lists and images. Other blocks are left out, and the note under the button says how many blocks were converted. The original body is never changed. Save the entry to keep the new layout.

## On the site

An entry with a layout renders it inside your site layout; an entry with an empty field keeps using your own template. To go back to the template, clear the layout in the editor, Apply and save the entry.
