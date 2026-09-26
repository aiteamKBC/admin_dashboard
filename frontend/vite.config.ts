import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const backend = env.VITE_AUTH_BACKEND_ORIGIN || "http://127.0.0.1:8000";
  return {
  plugins: [react()],
  base: "/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: Number(env.VITE_DEV_PORT || 5174),
    strictPort: true,
    proxy: {
      // Local Django accounts API (evidence marking) - MUST BE FIRST
      "/api/accounts": {
        target: backend,
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
        target: backend,
        changeOrigin: true,
      },

      // Local Django auth API
      "/auth": {
        target: backend,
        changeOrigin: true,
        // Old SSO links are SPA pages, not Django endpoints.
        bypass(req) {
          const pathname = (req.url || "").split("?")[0];
          if (pathname === "/auth/lms/callback" || pathname === "/auth/lms/callback/") {
            return "/index.html";
          }
        },
      },
    },
  },
  };
});
