# Selection Scope

A Firefox widget that lets you **marquee-select any region** of a webpage, then **rotate** and **zoom** it in a floating control panel — **live**, even when video is playing or CSS animations are running.

## How it works (in one sentence)

The live mirror uses Firefox's `-moz-element()` CSS function, which creates a continuously-rendered reference to a DOM element as a background image. Video frames, canvases, and animations all keep flowing inside the rotated/zoomed view — no screenshotting, no polling.

---

## Install (temporary, for development/testing)

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select `manifest.json` from this folder.

The extension will stay loaded until you restart Firefox. (For a permanent install, you'd need to sign it via AMO or use Firefox Developer / ESR / Nightly with `xpinstall.signatures.required = false` in `about:config`.)

## Usage

1. **Click the toolbar icon** (lime-accented viewfinder). The page dims with a crosshair cursor.
2. **Drag a rectangle** over any area — a live video, an animated chart, anything.
3. A **floating control panel** appears showing a live mirror of that region.
4. Drag the **Rotate** slider (-180° to +180°) or the **Zoom** slider (0.25× to 6×). The mirror updates instantly while the underlying content keeps animating.
5. Use **Re-select** to pick a new region, **Reset** to zero the transforms, or **Done** / × to close the widget.
6. The panel itself is draggable by its header.
7. Press **Esc** at any time to cancel.
8. Click the toolbar icon again to toggle off.

## Files

```
selection-scope/
├── manifest.json       WebExtension manifest (MV2, Firefox ≥109)
├── background.js       Toolbar-click handler, injects content script
├── content.js          Selection overlay, live mirror, UI, transforms
├── icons/
│   └── icon.svg        Toolbar icon
└── README.md
```

## Notes & caveats

- **Firefox only.** `-moz-element()` is non-standard — this is the whole reason the live mirror works. Chrome/Safari can't do this without per-frame canvas captures.
- **DOM wrapping.** On activation the extension wraps `document.body`'s children in `<div id="ffws-page-wrapper">` so the mirror doesn't include the widget's own UI (which would cause a feedback loop). The wrapper is removed on deactivation. Pages that depend on a very specific `body > child` selector structure may behave oddly while the widget is active.
- **Shadow DOM.** All widget UI lives inside a closed shadow root, so the page's styles don't leak into the panel and vice versa.
- **Cross-origin iframes** inside the selection may appear in the mirror as they render visually, but their internal animations depend on Firefox's rendering pipeline — in practice it usually works.
- **Fixed-position page elements** (sticky navs, etc.) are included in the wrapper's rendering as they appear.

## Extending it

Easy things to add:
- **Keyboard nudge**: arrow keys for 1° rotation steps, `+`/`-` for zoom.
- **Multiple panels**: support several concurrent scopes — would require unique wrapper IDs per panel and a panel registry.
- **Snapshot**: a "capture" button that paints the current mirror state to a canvas (`html2canvas` or `CanvasRenderingContext2D.drawImage` from `-moz-element` isn't directly supported, but you can use `canvas.getContext('2d').drawImage(video)` for video sources).
- **Pan inside the mirror**: click-drag on the mirror to offset the background-position.

## License

Do whatever you want with it.
