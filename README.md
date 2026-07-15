# Vis-Distort

A viewer for people with **metamorphopsia** — distorted (wavy) vision, most often caused
by macular degeneration (AMD). Because the distortion in dry AMD is usually **stable**,
it can be measured once and counteracted: Vis-Distort shows images, PDFs, and videos
**pre-warped with the opposite of your distortion**, so they can look straighter to you.

Everything runs locally in your browser. Your files and your calibration never leave
your computer.

## How to use it

### 1. Calibrate (once per eye)

1. Open the app and stay on the **Calibrate** tab. You'll see a grid of straight lines
   with a red center dot (an [Amsler grid](https://en.wikipedia.org/wiki/Amsler_grid)).
2. If your eyes differ, cover one eye. Sit at your normal reading distance — and try to
   use the same distance later when viewing.
3. **Stare at the center dot** and drag the blue grid points until the lines look
   **straight to you**. You are literally sculpting the counter-distortion: whatever
   warp makes the grid look straight is exactly the correction you need.
   - Click a point and use the **arrow keys** to nudge it precisely
     (**Shift+arrows** for fine steps).
   - Use **Grid detail** for a finer or coarser set of points, **Undo** / **Reset**
     to back out of changes, and the checkbox to hide the drag points while judging.
4. Click **Save profile** and name it (e.g. “Right eye”). Make one profile per eye
   if needed, and use **Export** to keep a backup file.

### 2. View

1. Switch to the **View** tab and open (or drag in) an **image**, **PDF**, or **video**.
2. The content is displayed through your correction. While reading, keep your gaze near
   the **center dot** — the correction is anchored to where you look.
3. Useful controls:
   - **Space bar** — toggle the correction on/off to compare.
   - **Strength** — scale the correction up or down.
   - **Correction area** — match how large the grid appeared during calibration.
   - Scroll to zoom, drag to pan. PDFs: arrow keys turn pages. Video: **K** plays/pauses.

## Running it

### Hosted (recommended)

The repository ships with a GitHub Actions workflow that publishes the app to GitHub
Pages on every push to `main`. To enable it once: repository **Settings → Pages →
Source: GitHub Actions**. The app is then available at
`https://<owner>.github.io/vis-distort/` — just bookmark it on the MacBook.

### Locally

```bash
npm install
npm run dev        # development server
npm run build      # production build into dist/
npx serve dist     # serve the production build
```

Requirements: any browser with WebGL2 (Safari 15+, Chrome, Edge, Firefox — every
modern Mac qualifies).

## How it works

- Calibration edits an N×N lattice of control points; displacements are interpolated
  (Catmull-Rom) into a dense displacement field.
- A WebGL2 fragment shader remaps every screen pixel through that field
  (backward mapping), so applying the correction to a video frame costs the same as
  an image — it all runs on the GPU in real time.
- PDFs are rasterized page-by-page with [pdf.js](https://mozilla.github.io/pdf.js/)
  and pushed through the same shader.
- Profiles are stored in the browser's localStorage and can be exported/imported
  as JSON.

## Honest limitations

- The distortion lives on your **retina**, so the correction is only geometrically
  right at the point you calibrated around. It helps most when you look at/near the
  center dot; away from it, the correction is approximate.
- Keep the **same viewing distance and window size** you calibrated with (the
  “Correction area” slider compensates for moderate differences).
- This is an assistive aid, **not a medical device or treatment**. If your distortion
  changes noticeably or suddenly, see your eye doctor promptly — sudden change can
  signal wet AMD, which needs urgent care.
