import { Link, NavLink, Outlet } from "react-router-dom";
import { FileText, ShieldCheck } from "lucide-react";
import { TOOLS } from "../lib/tools";
import { cn } from "../lib/utils";

const NAV = ["merge", "split", "compress", "watermark"];

export const AppLayout = () => (
  <div className="min-h-screen bg-background flex flex-col">
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="container mx-auto flex h-14 items-center gap-6 px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <FileText className="h-6 w-6 text-primary" />
          PDF Editor
        </Link>
        <nav className="hidden md:flex items-center gap-1 text-sm">
          {NAV.map((id) => {
            const tool = TOOLS.find((t) => t.id === id)!;
            return (
              <NavLink
                key={id}
                to={`/${id}`}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-1.5 transition-colors hover:bg-muted",
                    isActive ? "text-primary font-medium" : "text-muted-foreground"
                  )
                }
              >
                {tool.name.replace(" PDF", "")}
              </NavLink>
            );
          })}
          <NavLink to="/" end className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted">
            All tools
          </NavLink>
        </nav>
        <span className="ml-auto hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          Files never leave your device
        </span>
      </div>
    </header>
    <main className="flex-1">
      <Outlet />
    </main>
  </div>
);
