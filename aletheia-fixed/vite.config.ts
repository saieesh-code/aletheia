// Plain Vite SPA config — replaces @lovable.dev/vite-tanstack-config.
//
// TanStack Start (SSR / nitro / cloudflare) is no longer used.
// The app is built as a static SPA and served by the Rust backend:
//   - Static assets at /*
//   - SPA fallback: unknown paths return index.html so React Router works
//
// Plugins:
//   TanStackRouterVite — regenerates src/routeTree.gen.ts from src/routes/
//   react              — JSX transform + Fast Refresh (dev)
//   tailwindcss        — Tailwind v4 CSS-first
//   tsconfigPaths      — resolves @/* alias from tsconfig.json

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    // Must come before react() so the route tree is generated first
    TanStackRouterVite({
      routesDirectory:    "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  build: {
    outDir:      "dist",
    emptyOutDir: true,
  },
});
