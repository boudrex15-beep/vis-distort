# Vis-Distort

A simple **low-vision viewer and reader** for people with macular degeneration (AMD), which
usually mixes **fuzziness** (blur) and **darker spots** in central vision. Open an image, a PDF,
or a video — or paste text — and make it easier to see.

Everything runs locally in your browser. Your files and text never leave your computer.

## What it offers (and why)

- **Magnification** (up to 8×, with scroll-to-zoom and drag-to-pan) — in low-vision research,
  making things bigger is the single highest-yield aid, especially for blur.
- **Brightness, contrast, and high-contrast colour modes** (white-on-black, black-on-white,
  yellow-on-black, yellow-on-blue, black-on-yellow) — the same palettes electronic magnifiers
  use; they make content stand out and help it survive darker spots.
- **Scrolling-text reading** — paste text (or pull it from an open PDF) and read it as a large
  horizontal ticker with play/pause, speed, size, and a **text colour choice** (white text on
  black, or black text on white). Studies of central vision loss found scrolling text easier to
  read than static text, because you can hold your gaze slightly to the side and let the words
  come to you.

Settings (brightness, contrast, colour mode, reader colours) are remembered between visits.

## Honest limits

- Magnification and contrast improve *perceived* clarity, but no software can restore detail the
  retina no longer senses, or refill a true blind spot.
- This is an assistive aid, **not a medical device or treatment**. If vision changes noticeably
  or suddenly, see an eye doctor promptly — sudden change can signal wet AMD, which is urgent.

## Running it

### Hosted (recommended)

A GitHub Actions workflow builds the app on every push to `main` and publishes it to the
`gh-pages` branch, served by GitHub Pages at `https://<owner>.github.io/vis-distort/`.
(One-time setup: **Settings → Pages → Source: Deploy from a branch → `gh-pages` / root**.)

### Locally

```bash
npm install
npm run dev        # development server
npm run build      # production build into dist/
npx serve dist     # serve the production build
```

Requirements: any browser with WebGL2 (Safari 15+, Chrome, Edge, Firefox).

## How it works

- Content (image, rasterized PDF page via [pdf.js](https://mozilla.github.io/pdf.js/), video
  frame, or the text ticker canvas) is drawn through a small WebGL2 shader that applies
  brightness/contrast and the duotone colour modes on the GPU in real time.
- The scrolling reader draws text to a canvas each frame, so it flows through the same pipeline.
