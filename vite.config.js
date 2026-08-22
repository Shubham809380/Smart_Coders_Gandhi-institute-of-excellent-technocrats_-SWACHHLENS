import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
    plugins: [react(), VitePWA({ registerType: "autoUpdate", workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        // Auth deep-links (password-reset emails!) must NEVER be served from a
        // stale precached app shell — always fetch fresh from the network.
        navigateFallbackDenylist: [
            /^\/reset-password/,
            /^\/forgot-password/,
            /^\/login$/,
            /^\/signup$/,
        ],
    }, manifest: { name: "SwachhLens", short_name: "SwachhLens", description: "AI-powered civic waste response", theme_color: "#047857", background_color: "#f8fbf8", display: "standalone", icons: [{ src: "/src/logo.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }] } })],
    server: { port: 5173, proxy: { "/api": "http://127.0.0.1:3000", "/uploads": "http://127.0.0.1:3000" } }
});