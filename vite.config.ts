import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the built dist/ works from any path (GitHub Pages
  // project sites, `npx serve`, or a plain subdirectory).
  base: "./",
  build: {
    target: "es2022",
  },
});
