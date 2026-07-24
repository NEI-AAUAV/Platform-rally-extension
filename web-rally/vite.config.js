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
            // Silent update: activate the new SW and reload, matching the old
            // force-update behavior.
            registerType: "autoUpdate",
            // The PWA web-app manifest is hand-authored in public/manifest.json;
            // don't let the plugin emit a competing one.
            manifest: false,
            injectManifest: {
                globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
            },
            devOptions: { enabled: false },
        }),
    ],
    base: "/rally",
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        watch: {
            ignored: ['**/.pnpm-store/**', '**/node_modules/**'],
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
