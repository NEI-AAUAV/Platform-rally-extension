import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      // The app is served under /rally/; keep the SW scope aligned so it
      // controls the whole app and nothing outside it.
      base: "/rally/",
      scope: "/rally/",
      // Prompt, not autoUpdate: a silent activate-and-reload can fire while a
      // judge is halfway through an evaluation form and throw the input away.
      // The app surfaces PWAUpdatePrompt instead and only reloads on tap (see
      // src/components/pwa/PWAUpdatePrompt.tsx).
      registerType: "prompt",
      // The PWA web-app manifest is hand-authored in public/manifest.json;
      // don't let the plugin emit a competing one.
      manifest: false,
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Install-dialog artwork: the browser fetches it, the app never does,
        // so precaching it would cost every user ~450 KB for nothing.
        globIgnores: ["**/screenshots/**"],
      },
      devOptions: { enabled: false },
    }),
  ],
  // Trailing slash matters: it must match the VitePWA base/scope above, or the
  // service worker registers against a different path than the app is served
  // from.
  base: "/rally/",
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    watch: {
      ignored: ['**/.pnpm-store/**', '**/node_modules/**'],
    },
    // Local dev talks to a directly-run api-rally (poetry run uvicorn, port
    // 8003 by default — see api-rally/docker-compose.smoke.yml). Production
    // instead relies on the gateway nginx routing /api and /static to the
    // backend container (deploy/nginx/rally.conf); this proxy just recreates
    // that for `vite dev`, where there is no such gateway in front.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8003',
        changeOrigin: true,
      },
      '/static': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8003',
        changeOrigin: true,
      },
    },
  },
  // For the fullstack e2e project only: proxy /api to a real running
  // api-rally instance (e.g. the docker-compose.smoke.yml stack) so the
  // built app can talk to a real backend instead of Playwright route mocks.
  preview: process.env.FULLSTACK_API_PROXY_TARGET
    ? {
        proxy: {
          '/api': {
            target: process.env.FULLSTACK_API_PROXY_TARGET,
            changeOrigin: true,
          },
        },
      }
    : undefined,
});
