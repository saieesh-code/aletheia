import { Link } from "@tanstack/react-router";
import { Shield } from "lucide-react";

const NAV_LINKS = [
  { to: "/capture",  label: "Capture"  },
  { to: "/verify",   label: "Verify"   },
  { to: "/analysis", label: "Analysis" },
  { to: "/ledger",   label: "Ledger"   },
  { to: "/lineage",  label: "Lineage"  },
  { to: "/hardware", label: "Hardware" },
  { to: "/docs",     label: "API"      },
] as const;

// Base nav link class shared by all links
const BASE_CLS =
  "px-2.5 py-1.5 rounded-md text-xs transition-colors whitespace-nowrap";

export function Nav() {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Shield className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="leading-tight">
            <div className="font-semibold tracking-tight text-sm">Aletheia</div>
            <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground hidden sm:block">
              Provenance Infrastructure
            </div>
          </div>
        </Link>
        <nav className="flex items-center gap-0.5 text-sm overflow-x-auto scrollbar-hide">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`${BASE_CLS} text-muted-foreground hover:text-foreground hover:bg-secondary`}
              activeProps={{
                // FIX: activeProps.className REPLACES (not merges with) className in
                // TanStack Router — repeat the base classes plus the active-state delta.
                className: `${BASE_CLS} text-foreground bg-secondary`,
              }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
