# Vis-Distort

A viewer for people with **age-related macular degeneration (AMD)**. Because the
distortion in dry AMD is usually **stable**, it can be measured once and counteracted:
Vis-Distort shows images, PDFs, and videos **pre-warped with the opposite of your
distortion**, so straight lines can look straight to you again.

Everything runs locally in your browser. Your files and your calibration never leave
your computer.

## Two versions (same calibration)

There are two pages, and both share the same saved calibration profiles:

- **`index.html` — the classic distortion tool.** Just calibration + the distortion-correcting
  viewer. Simple and focused.
- **`aids.html` — the low-vision viewer.** Everything the classic version does, **plus**
  evidence-based aids for the *other* symptoms that usually come with AMD:
  - **Magnification** — the single biggest help for fuzziness/blur.
  - **Brightness, contrast, and high-contrast colour modes** (white-on-black, black-on-white,
    yellow-on-blue, etc.) — help blur and darker spots.
  - **Scrolling-text reading mode** — a large horizontal ticker (paste text, or pull it from an
    open PDF), which research shows is easier to read with central vision loss and supports
    eccentric viewing. It scrolls *through* your distortion correction and colour settings.

  **Honest limits:** magnification and contrast improve *perceived* clarity, but no software can
  restore detail the retina no longer senses, or refill a true blind spot. This is an assistive
  aid, not a treatment — sudden vision change means see your eye doctor promptly.

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

The repository ships with a GitHub Actions workflow that builds the app on every push
to `main` and publishes it to the `gh-pages` branch. To enable it once: repository
**Settings → Pages → Source: Deploy from a branch → Branch: `gh-pages` / `(root)`**.
The app is then available at `https://<owner>.github.io/vis-distort/` — just bookmark
it on the MacBook.

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
