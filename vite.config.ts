import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, PluginOption } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import sparkPlugin from "@github/spark/spark-vite-plugin";
import createIconImportProxy from "@github/spark/vitePhosphorIconProxyPlugin";
import { resolve } from 'path'

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname
const isProduction = process.env.NODE_ENV === 'production'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
    // Spark plugins — development only (icon proxy bundles Spark runtime into production otherwise)
    ...(!isProduction ? [
      createIconImportProxy() as PluginOption,
      sparkPlugin({ port: 5173 }) as PluginOption,
    ] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'Photo Grid Collage Maker',
        short_name: 'Collage Maker',
        description: 'Create beautiful photo grid collages in seconds',
        theme_color: '#6b21a8',
        background_color: '#faf9f7',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        icons: [
          {
            src: 'pwa-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Exclude large WASM-based chunks from precache (loaded on demand)
        globIgnores: ['**/libheif-js-*.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }) as PluginOption,
  ],
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src')
    }
  },
  server: {
    port: 5173,
  },
  css: {
    lightningcss: {
      // Workaround for Tailwind v4 generating CSS media queries that
      // lightningcss cannot parse (e.g. `@media (width >= (display-mode: standalone))`)
      errorRecovery: true,
    },
  },
});
