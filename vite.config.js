import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  // Serve files from the 'public' directory
  publicDir: "public",
  build: {
    // Output the built files to a 'dist' directory
    outDir: "dist",
  },
});
