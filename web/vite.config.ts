import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The app is served from the SAME ORIGIN as the API in production: the Node
 * server serves `web/dist` and keeps `/api/*` for itself. That removes CORS
 * from the picture entirely.
 *
 * In development Vite runs on its own port, so `/api` is proxied to the
 * backend to preserve the same-origin assumption the app code relies on —
 * no environment-specific base URL anywhere in the client.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirrors the `@/*` paths mapping in tsconfig.json.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
