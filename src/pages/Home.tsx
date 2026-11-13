import { useState } from "react";
import { Link } from "react-router-dom";
import { CATEGORIES, TOOLS, type ToolCategory } from "../lib/tools";
import { cn } from "../lib/utils";

type Filter = "all" | ToolCategory;

const Home = () => {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = filter === "all" ? TOOLS : TOOLS.filter((t) => t.category === filter);
  const filters: [Filter, string][] = [
    ["all", "All"],
    ...(Object.entries(CATEGORIES) as [ToolCategory, { label: string }][]).map(
      ([id, c]) => [id, c.label] as [Filter, string]
    ),
  ];

  return (
    <div className="container mx-auto px-4 py-12">
      <section className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Every PDF tool you need, in your browser</h1>
        <p className="mt-3 text-muted-foreground">
          Merge, split, compress and edit PDFs for free. Everything runs on your device, so your files are
          never uploaded anywhere.
        </p>
      </section>

      <div className="mt-8 flex flex-wrap justify-center gap-2" role="tablist" aria-label="Tool categories">
        {filters.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={filter === id}
            onClick={() => setFilter(id)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition-colors",
              filter === id
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.id}
              to={`/${tool.id}`}
              className="group rounded-xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <div className={cn("mb-4 inline-flex rounded-lg p-2.5", CATEGORIES[tool.category].tint)}>
                <Icon className="h-6 w-6" />
              </div>
              <h2 className="font-semibold group-hover:text-primary">{tool.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default Home;
