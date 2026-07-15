import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  // Relative base so the built dist/ works from any path (GitHub Pages
  // project sites, `npx serve`, or a plain subdirectory).
  base: "./",
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        // Two independent pages, one deploy:
        //   index.html  → the original distortion-only tool (unchanged)
        //   aids.html   → the expanded low-vision viewer
        main: resolve(__dirname, "index.html"),
        aids: resolve(__dirname, "aids.html"),
      },
    },
  },
});
