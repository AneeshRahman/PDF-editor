import { Link, NavLink, Outlet } from "react-router-dom";
import { TOOLS } from "../lib/tools";
import { cn } from "../lib/utils";
import { Wordmark } from "./brand";
import { ThemeSwitch } from "./ThemeSwitch";

const NAV = ["merge", "split", "compress", "watermark"];

export const AppLayout = () => (
  <div className="flex min-h-screen flex-col bg-background">
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="container flex h-14 items-center gap-8">
        <Link to="/" aria-label="PDF Editor home" className="shrink-0">
          <Wordmark />
        </Link>
        <nav className="hidden h-full items-stretch gap-6 text-sm md:flex">
          {NAV.map((id) => {
            const tool = TOOLS.find((t) => t.id === id)!;
            return (
              <NavLink
                key={id}
                to={`/${id}`}
                className={({ isActive }) =>
                  cn(
                    "-mb-px flex items-center border-b-2 transition-colors",
                    isActive ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  )
                }
              >
                {tool.name.replace(" PDF", "")}
              </NavLink>
            );
          })}
          <Link to="/#tools" className="-mb-px flex items-center border-b-2 border-transparent text-muted-foreground hover:text-foreground">
            All tools
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-5">
          <span className="label-mono hidden items-center gap-2 lg:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
            On-device · Private
          </span>
          <span className="hidden h-5 w-px bg-border lg:block" aria-hidden="true" />
          <ThemeSwitch />
          {/* On phones the nav is hidden, so offer a way to the tool list. */}
          <Link to="/#tools" className="rounded-md border border-border px-3 py-1.5 text-sm font-medium md:hidden">
            Tools
          </Link>
        </div>
      </div>
    </header>
    <main className="flex-1">
      <Outlet />
    </main>
  </div>
);
