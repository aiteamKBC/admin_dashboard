import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    proxy: {
      // Local Django accounts API (evidence marking) - MUST BE FIRST
      "/api/accounts": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },

      // main API (coaches analytics, attendance data)
      // Using local API server - make sure it's running on port 5055
      "/api": {
        target: "https://api.kentbusinesscollege.net",
        changeOrigin: true,
        secure: false,
      },

      // Local Django tasks API
      "/tasks-api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },

      // Local Django auth API
      "/auth": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});