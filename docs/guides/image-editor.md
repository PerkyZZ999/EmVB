# Image editor

Edit a media-library picture in place: crop and rotate, adjust light and color, apply film-style filters, draw tone curves, add blur, read the file and camera data, then save a new copy. The original stays in the library. The editor runs only in the EmDash admin; published pages never load its code.

## Who can edit what

- **Same-site library pictures** (JPEG, PNG, WebP, AVIF) can be edited.
- Pictures from **other websites**, **SVG** and **GIF** cannot. Image settings then say why, and the Edit button is hidden.
- Choosing a different picture for an Image element drops a previous edit record.

## Ways to open it

1. **Image settings:** **Edit image** under the preview (library pictures only).
2. **Media library:** the ⋯ menu on a card → **Edit…**. Saving uploads a new item and selects it for the element.
3. **Command palette:** **Edit image** when the selection is an editable Image.

While it is open, keyboard focus stays inside the editor. Closing it from Image settings (Cancel, Esc, or after a save) puts focus back on **Edit image**.

## Layout

- **Desktop** (editor at least 640 px wide): top bar (Undo, Redo, file name and size, Reset, Original, Cancel, **Save copy**), canvas, and a resizable sidebar with the tools, histogram and panel.
- **Phone** (narrower): tools along the bottom and a non-modal sheet for the active tool's controls, so you can still drag the crop frame or the blur spot on the picture.

## Tools

| Tool | What it does |
| --- | --- |
| Adjust | Light and Color sliders (−100…+100, each with a typed value field). |
| Crop | Rotate, flip, aspect ratio (including **Fit this element**), straighten, perspective, and a frame you can drag, pinch or move with the arrow keys (+ / − to zoom). |
| Curves | RGB and R/G/B channels; click to add points, drag, or use the keyboard (arrows, typed Input/Output). |
| Effects | Clarity, Noise and Vignette (the Adjust panel opened on its Effects tab). |
| Filters | None plus photocn's film looks; Strength once a look is on. |
| Blur | Bokeh or Gaussian, with a focusable sharp spot on the image. |
| Metadata | File name, type, size, dimensions and camera data (EXIF). Photos with a location show a note about what a saved copy keeps. |
| Blender | Coming in a later update. |

Undo, Redo, **Original** (press and hold to compare), and **Reset all edits** work across tools. Screen readers hear the active tool and a short plain-language summary of the edits ("Edits: Cropped · Exposure +20").

## Saving a copy

**Save copy** opens the export step:

- **Format:** WebP (recommended), JPEG or PNG.
- **Quality:** 10–100 % (default 85 % for WebP and JPEG).
- **Size:** typed width and height in px. By default the longest side is capped at 2560 px; **Full size** exports at the crop's full resolution. Typed sizes keep both sides at or below 16,384 px while preserving the aspect ratio; each field's maximum reflects the other side's limit.
- **Remove location (GPS):** on by default for a JPEG of a photo that has one. WebP and PNG never carry camera data from the original.

The new file is uploaded as `<original>-edited.<ext>` and applied to the Image element. The element's `edit` record points back at the untouched original (and its media id when known) and stores the recipe so re-opening restores the sliders, filter and crop. **Reset to original** in Image settings puts the element back on the first file and leaves the edited copy in the library. An edit of an edit still points at the first original.

While Save copy is processing, the export step stays open, including when pressing Escape. If saving fails, it shows the reason and **Retry**; you can also close it once the request finishes. Downloads allow closing the export step while they finish.

Save copy accepts a custom longest side from 16 through 10,000 px, as required by the stored edit format. Other custom sizes show a correction hint before rendering. Choose a supported size or **Full size** to continue. Download keeps its existing size range.

## Size and loading

If the picture request fails or its transfer is interrupted, the editor asks you to check the connection and offers **Try again**. Retry reopens the same picture without closing the editor.

The editor and its WebGL worker load only after you open them (hover or focus on **Edit image** can start the fetch early). A size check in the repo (`scripts/image-editor-budget.ts`) keeps the photocn chunk under 350 KB gzipped and the worker under 32 KB gzipped. Host sites that ship a Content Security Policy must allow a same-origin module worker for the admin; if the worker cannot start, the editor falls back to a main-thread preview and still saves under the CSP.

## Attribution

The engine is [photocn](https://photocn.dev) 0.1.2 (MIT). EmVB's panels and layouts are ported from photocn's editor UI into Kumo and EmVB tokens. Full notices, including photocn's own dependencies (mini-photo-editor, glfx.js, exif-js and fflate), are in [`packages/emvb/THIRD_PARTY_NOTICES.md`](../../packages/emvb/THIRD_PARTY_NOTICES.md).
