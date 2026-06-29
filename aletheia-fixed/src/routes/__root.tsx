import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
} from "@tanstack/react-router";
import { useEffect } from "react";

import { reportLovableError } from "../lib/lovable-error-reporting";

// ─── 404 page ────────────────────────────────────────────────────────────────
// Unchanged from original.

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Error boundary ───────────────────────────────────────────────────────────
// Unchanged from original.

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Root route ───────────────────────────────────────────────────────────────
//
// Changes from original (deployment-only, no UI changes):
//   • shellComponent / RootShell removed — HTML shell is now index.html
//   • Scripts removed — scripts are injected by Vite via index.html
//   • appCss ?url import removed — CSS is imported directly in main.tsx
//   • links[] removed from head() — CSS handled by Vite bundle
//   • HeadContent moved into RootComponent so per-route titles still update

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport",           content: "width=device-width, initial-scale=1" },
      { title: "Lovable App" },
      { name: "description",        content: "Lovable Generated Project" },
      { name: "author",             content: "Lovable" },
      { property: "og:title",       content: "Lovable App" },
      { property: "og:description", content: "Lovable Generated Project" },
      { property: "og:type",        content: "website" },
      { name: "twitter:card",       content: "summary" },
      { name: "twitter:site",       content: "@Lovable" },
    ],
  }),
  component:          RootComponent,
  notFoundComponent:  NotFoundComponent,
  errorComponent:     ErrorComponent,
});

// ─── Root component ───────────────────────────────────────────────────────────

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* HeadContent applies per-route <title> / <meta> changes defined
          via head() in each route file — works in SPA mode via React portals */}
      <HeadContent />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
