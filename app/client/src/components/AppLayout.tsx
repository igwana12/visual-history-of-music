import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useTheme } from "./ThemeProvider";
import { Sun, Moon, Music, GitBranch, ArrowLeftRight } from "lucide-react";
import { PerplexityAttribution } from "./PerplexityAttribution";

const NAV_ITEMS = [
  { href: "/", label: "Timeline", icon: Music },
  { href: "/influences", label: "Influences", icon: GitBranch },
  { href: "/compare", label: "Compare", icon: ArrowLeftRight },
];

function VHMLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-label="VHM Logo" className="shrink-0">
      <rect width="32" height="32" rx="6" fill="currentColor" fillOpacity="0.1" />
      <path d="M6 22L11 8h2l5 14h-2.5l-1.2-3.5h-5.6L7.5 22H6zm4.3-5.5h4.4L12.5 10h-.1L10.3 16.5z" fill="currentColor" opacity="0.3"/>
      <path d="M8 24C8 17 12 12 16 9c4 3 8 8 8 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.7"/>
      <path d="M10 24c0-5 3-9 6-12c3 3 6 7 6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.4"/>
      <circle cx="16" cy="8" r="2" fill="currentColor" opacity="0.6"/>
    </svg>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 border-b border-border/50 vhm-glass bg-background/80">
        <div className="max-w-[1600px] mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo + Brand */}
          <Link href="/" className="flex items-center gap-2.5 group" data-testid="nav-logo">
            <VHMLogo />
            <div className="flex flex-col leading-none">
              <span className="font-display text-base font-semibold tracking-wide text-foreground group-hover:text-primary transition-colors">
                VHM
              </span>
              <span className="text-[10px] text-muted-foreground font-medium tracking-widest uppercase hidden sm:block">
                Visual History of Music
              </span>
            </div>
          </Link>

          {/* Center Navigation */}
          <nav className="flex items-center gap-1" data-testid="main-nav">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const isActive = location === href || (href !== "/" && location.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  data-testid={`nav-${label.toLowerCase()}`}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium
                    transition-all duration-200 vhm-ease
                    ${isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            data-testid="theme-toggle"
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/30 py-4 px-4 text-center">
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span>237 Artists · 2,798 Performances · 1920s–2020s</span>
          <span className="hidden sm:inline">·</span>
          <PerplexityAttribution />
        </div>
      </footer>
    </div>
  );
}
