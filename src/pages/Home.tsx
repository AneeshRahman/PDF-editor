import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, BadgeCheck, FileText, Loader2, Lock, MousePointerClick, Upload, X, Zap } from "lucide-react";
import { CATEGORIES, TOOLS, type ToolCategory, type ToolDef } from "../lib/tools";
import { formatSize, isPdfFile, loadPdfFile, setHandoff, type LoadedPdf } from "../lib/files";
import { cn } from "../lib/utils";

type Filter = "all" | ToolCategory;

const PERKS = [
  { icon: Lock, label: "Private: files never leave your device" },
  { icon: BadgeCheck, label: "Free, no sign-up" },
  { icon: Zap, label: "Fast: no uploads, no waiting" },
];

const STEPS = [
  { icon: Upload, title: "Add your PDF", text: "Drop it in or pick it from your device. Nothing is uploaded." },
  { icon: MousePointerClick, title: "Choose a tool", text: "Merge, split, compress, watermark and more, with a live preview." },
  { icon: ArrowRight, title: "Download", text: "Get the result instantly, or carry it straight into another tool." },
];

const Home = () => {
  const navigate = useNavigate();
  const { hash } = useLocation();
  const [filter, setFilter] = useState<Filter>("all");

  // The header's "Tools" link points at /#tools.
  useEffect(() => {
    if (hash === "#tools") document.getElementById("tools")?.scrollIntoView({ behavior: "smooth" });
  }, [hash]);
  const [ready, setReady] = useState<LoadedPdf[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const visible = filter === "all" ? TOOLS : TOOLS.filter((t) => t.category === filter);
  const count = (c: ToolCategory) => TOOLS.filter((t) => t.category === c).length;

  const addFiles = async (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
    const pdfs = picked.filter(isPdfFile);
    if (pdfs.length < picked.length) toast.error("Only PDF files can be added");
    setLoading(true);
    const loaded: LoadedPdf[] = [];
    for (const f of pdfs) {
      try {
        loaded.push(await loadPdfFile(f));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Could not open ${f.name}`);
      }
    }
    setLoading(false);
    if (loaded.length) {
      setReady((r) => [...r, ...loaded]);
      document.getElementById("tools")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  /** With files dropped on the home page, a tool card opens that tool with them already loaded. */
  const openTool = (tool: ToolDef, e: React.MouseEvent) => {
    if (!ready.length) return; // plain link navigation
    e.preventDefault();
    if (!tool.multiple && ready.length > 1) toast.info(`${tool.name} works on one file, so it will use ${ready[0].name}`);
    setHandoff(tool.multiple ? ready : ready.slice(0, 1));
    navigate(`/${tool.id}`);
  };

  return (
    <div>
      {/* ---------------------------- Hero ---------------------------- */}
      <section className="hero-bg border-b border-border">
        <div className="container mx-auto grid items-center gap-10 px-4 py-14 md:py-20 lg:grid-cols-[1.1fr_1fr]">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-background/70 px-3 py-1 text-xs font-medium text-primary backdrop-blur">
              <Lock className="h-3.5 w-3.5" />
              100% in your browser
            </span>
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              Every PDF tool,
              <br />
              <span className="text-primary">none of the uploads.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground lg:mx-0">
              Merge, split, compress, watermark and clean up PDFs for free. Everything happens on your device, so
              your documents stay yours.
            </p>
            <ul className="mt-7 flex flex-col items-center gap-2.5 text-sm sm:flex-row sm:flex-wrap sm:justify-center lg:justify-start">
              {PERKS.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2 text-foreground/80">
                  <Icon className="h-4 w-4 text-emerald-600" />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          {/* Drop zone */}
          <div className="relative">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={cn(
                "relative rounded-2xl border-2 border-dashed bg-card/90 p-8 text-center shadow-xl shadow-primary/5 backdrop-blur transition sm:p-10",
                dragging ? "scale-[1.01] border-primary bg-primary/5" : "border-primary/30"
              )}
            >
              <input
                type="file"
                multiple
                accept=".pdf,application/pdf"
                aria-label="Select PDF files"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
                {loading ? <Loader2 className="h-7 w-7 animate-spin" /> : <Upload className="h-7 w-7" />}
              </div>
              <p className="mt-5 text-lg font-semibold">Drop PDFs here to get started</p>
              <p className="mt-1 text-sm text-muted-foreground">or click to choose files, then pick a tool below</p>
              <span className="mt-6 inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
                Choose PDF files
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------- Tools --------------------------- */}
      <section id="tools" className="container mx-auto scroll-mt-20 px-4 py-14">
        {ready.length > 0 ? (
          <div className="mb-8 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <FileText className="h-8 w-8 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="font-semibold">What would you like to do?</p>
                <p className="truncate text-sm text-muted-foreground">
                  {ready.length === 1
                    ? `${ready[0].name} · ${ready[0].pageCount} pages · ${formatSize(ready[0].bytes.byteLength)}`
                    : `${ready.length} files ready: ${ready.map((f) => f.name).join(", ")}`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReady([])}
              className="inline-flex items-center gap-1 self-start rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-background hover:text-foreground sm:self-auto"
            >
              <X className="h-4 w-4" /> Clear
            </button>
          </div>
        ) : (
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">All the tools you need</h2>
            <p className="mt-2 text-muted-foreground">Pick a tool to get started. No account, no limits.</p>
          </div>
        )}

        <div className="mb-8">
          <div className="flex flex-wrap justify-center gap-2" role="tablist" aria-label="Tool categories">
            {(["all", ...(Object.keys(CATEGORIES) as ToolCategory[])] as Filter[]).map((id) => (
              <button
                key={id}
                role="tab"
                aria-selected={filter === id}
                onClick={() => setFilter(id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                  filter === id
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {id === "all" ? "All tools" : CATEGORIES[id].label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs",
                    filter === id ? "bg-background/20" : "bg-muted text-muted-foreground"
                  )}
                >
                  {id === "all" ? TOOLS.length : count(id)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {visible.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.id}
                to={`/${tool.id}`}
                onClick={(e) => openTool(tool, e)}
                className={cn(
                  "group relative flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition",
                  "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5",
                  "sm:flex-col sm:items-start sm:p-6",
                  ready.length > 0 && "ring-1 ring-primary/10"
                )}
              >
                <span className={cn("shrink-0 rounded-xl p-3", CATEGORIES[tool.category].tint)}>
                  <Icon className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold group-hover:text-primary sm:text-lg">
                    {tool.name}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground sm:mt-1.5">{tool.description}</span>
                </span>
                <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary sm:absolute sm:right-5 sm:top-6 sm:opacity-0 sm:group-hover:opacity-100" />
              </Link>
            );
          })}
        </div>
      </section>

      {/* ------------------------- How it works ----------------------- */}
      <section className="border-t border-border bg-muted/40">
        <div className="container mx-auto px-4 py-14">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">How it works</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="flex gap-4 rounded-2xl border border-border bg-card p-6">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {i + 1}
                </span>
                <div>
                  <p className="flex items-center gap-2 font-semibold">
                    {title}
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="container mx-auto flex flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
          <span className="flex items-center gap-2 font-medium text-foreground">
            <FileText className="h-4 w-4 text-primary" /> PDF Editor
          </span>
          <span className="text-center">Runs entirely in your browser. Your files are never uploaded.</span>
        </div>
      </footer>
    </div>
  );
};

export default Home;
