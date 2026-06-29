// SPA entry point — replaces TanStack Start's SSR bootstrapping.
//
// TanStack Router runs entirely in the browser. The Rust backend serves
// index.html for every non-API path, so React Router handles all navigation
// and page refreshes work correctly on any route.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import { getRouter } from "./router";

// Import global styles so Vite bundles and injects them
import "./styles.css";

const router = getRouter();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
