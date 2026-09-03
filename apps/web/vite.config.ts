import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Cultiva",
        short_name: "Cultiva",
        description: "Monitoramento e execução de ordens de serviço em campo",
        theme_color: "#5e22f3",
        background_color: "#0f172a",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              request.method === "GET" && url.pathname.startsWith("/v1/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // sem sinal em campo: enfileira início/conclusão de OS e o
            // workbox reenvia sozinho (IndexedDB) quando a conexão voltar
            urlPattern: ({ request, url }) =>
              request.method === "PATCH" && /^\/v1\/work-orders\/[^/]+$/.test(url.pathname),
            handler: "NetworkOnly",
            method: "PATCH",
            options: {
              backgroundSync: { name: "wo-start-queue", options: { maxRetentionTime: 24 * 60 } },
            },
          },
          {
            urlPattern: ({ request, url }) =>
              request.method === "POST" &&
              /^\/v1\/work-orders\/[^/]+\/complete$/.test(url.pathname),
            handler: "NetworkOnly",
            method: "POST",
            options: {
              backgroundSync: {
                name: "wo-complete-queue",
                options: { maxRetentionTime: 24 * 60 },
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@components": resolve(__dirname, "src/components"),
      "@pages": resolve(__dirname, "src/pages"),
      "@hooks": resolve(__dirname, "src/hooks"),
      "@services": resolve(__dirname, "src/services"),
      "@layouts": resolve(__dirname, "src/layouts"),
      "@types": resolve(__dirname, "src/types"),
    },
  },
});
