import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      events: "events/events.js",
    },
  },
  // Add WASM support
  assetsInclude: ["**/*.wasm"],
  optimizeDeps: {
    exclude: ["@worldcoin/idkit-core"],
    include: ["qrcode"],
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
