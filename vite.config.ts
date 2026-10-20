import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      // The app registers the worker itself (src/app/pwa.ts) so an update can
      // never reload the page in the middle of a run. See docs/PWA-PLAN.md.
      injectRegister: false,
      registerType: "prompt",
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        id: "./",
        name: "Bossy Road",
        short_name: "Bossy Road",
        description:
          "A kid-friendly, offline voxel hopper. Hop, dodge and collect coins.",
        start_url: ".",
        scope: ".",
        display: "standalone",
        orientation: "any",
        background_color: "#e6f8ff",
        theme_color: "#6cc24a",
        categories: ["games", "kids"],
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        // A waiting worker activates after every tab closes. It never calls
        // skipWaiting, so a new deploy cannot swap assets under a live run.
        skipWaiting: false,
        clientsClaim: false,
        // No runtimeCaching block: every request is either precached or absent,
        // and there are no third-party origins to cache.
      },
    }),
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});
