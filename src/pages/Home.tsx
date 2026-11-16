import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, ArrowUpRight, Loader2, X } from "lucide-react";
import { CATEGORIES, TOOLS, type ToolCategory, type ToolDef } from "../lib/tools";
import { formatSize, isPdfFile, loadPdfFile, setHandoff, MAX_FILE_MB, type LoadedPdf } from "../lib/files";
import { CropMarks } from "../components/brand";
import { cn } from "../lib/utils";

type Filter = "all" | ToolCategory;

const pad = (n: number) => String(n).padStart(2, "0");

const STEPS = [
  { title: "Add a PDF", text: "Drop it in or choose it from your device. It is opened right here, in this tab." },
  { title: "Pick a tool", text: "Merge, split, compress or watermark, with a live preview of every change." },
  { title: "Download", text: "Save the result, or hand it straight to the next tool without re-uploading." },
];

const Home = () => {
  const navigate = useNavigate();
  const { hash } = useLocation();
  const [filter, setFilter] = useState<Filter>("all");
  const [ready, setReady] = useState<LoadedPdf[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);

  // The header's "Tools" link points at /#tools.
  useEffect(() => {
    if (hash === "#tools") document.getElementById("tools")?.scrollIntoView({ behavior: "smooth" });
  }, [hash]);

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

  /** With files added on the home page, a tool opens with them already loaded. */
  const openTool = (tool: ToolDef, e: React.MouseEvent) => {
    if (!ready.length) return; // plain link navigation
    e.preventDefault();
    if (!tool.multiple && ready.length > 1) toast.info(`${tool.name} works on one file, so it will use ${ready[0].name}`);
    setHandoff(tool.multiple ? ready : ready.slice(0, 1));
    navigate(`/${tool.id}`);
  };

  return (
    <div>
      {/* ------------------------------ Hero ------------------------------ */}
      <section className="border-b border-border">
        <div className="container grid gap-12 py-16 md:py-24 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7">
            <p className="label-mono">PDF toolkit · Runs in your browser</p>
            <h1 className="mt-6 text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-6xl lg:text-[4.25rem]">
              Edit PDFs without
              <br />
              sending them <span className="text-muted-foreground">anywhere.</span>
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-muted-foreground">
              Merge, split, compress and watermark documents on your own device. No uploads, no account, no waiting
              on a server.
            </p>

            <dl className="mt-10 grid max-w-md grid-cols-3 border-y border-border">
              {[
                [pad(TOOLS.length), "Tools"],
                ["0", "Uploads"],
                [`${MAX_FILE_MB}MB`, "Per file"],
              ].map(([value, label], i) => (
                <div key={label} className={cn("py-4", i > 0 && "border-l border-border pl-4")}>
                  <dt className="label-mono">{label}</dt>
                  <dd className="mt-1 font-mono text-2xl font-medium tracking-tight">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Drop zone, framed with printer's crop marks */}
          <div className="lg:col-span-5 lg:pt-10">
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
                "group relative flex min-h-[19rem] flex-col justify-between border bg-card p-7 transition-colors",
                dragging ? "border-brand bg-brand/[0.03]" : "border-border hover:border-foreground/30"
              )}
            >
              <CropMarks active={dragging} />
              <input
                type="file"
                multiple
                accept=".pdf,application/pdf"
                aria-label="Select PDF files"
                className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="flex items-start justify-between">
                <span className="label-mono">Start here</span>
                <span className="label-mono">.pdf</span>
              </div>
              <div>
                <p className="text-2xl font-medium tracking-[-0.02em]">
                  {loading ? "Opening…" : dragging ? "Release to add" : "Drop PDF files here"}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Then choose what to do with them below. Up to {MAX_FILE_MB}MB per file.
                </p>
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition group-hover:gap-3">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Choose files
                  <ArrowRight className="h-4 w-4" />
                </span>
                <span className="text-xs text-muted-foreground">or drag and drop</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------ Tools ----------------------------- */}
      <section id="tools" className="scroll-mt-14">
        <div className="container">
          <div className="flex flex-col gap-6 py-10 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="label-mono">Index</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
                {ready.length ? "What would you like to do?" : "Tools"}
              </h2>
            </div>
            <div className="flex gap-6 overflow-x-auto" role="tablist" aria-label="Tool categories">
              {(["all", ...(Object.keys(CATEGORIES) as ToolCategory[])] as Filter[]).map((id) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={filter === id}
                  onClick={() => setFilter(id)}
                  className={cn(
                    "-mb-px flex items-baseline gap-1.5 whitespace-nowrap border-b-2 pb-2 text-sm transition-colors",
                    filter === id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {id === "all" ? "All" : CATEGORIES[id].label}
                  <span className="font-mono text-[11px] text-muted-foreground">{pad(id === "all" ? TOOLS.length : count(id))}</span>
                </button>
              ))}
            </div>
          </div>

          {ready.length > 0 && (
            <div className="mb-6 flex items-center gap-4 border border-border bg-card px-4 py-3">
              <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
              <p className="min-w-0 flex-1 truncate text-sm">
                <span className="font-medium">
                  {ready.length === 1 ? ready[0].name : `${ready.length} files ready`}
                </span>
                <span className="text-muted-foreground">
                  {ready.length === 1
                    ? ` · ${ready[0].pageCount} pages · ${formatSize(ready[0].bytes.byteLength)}`
                    : `: ${ready.map((f) => f.name).join(", ")}`}
                </span>
              </p>
              <span className="label-mono hidden sm:inline">Pick a tool</span>
              <button
                type="button"
                onClick={() => setReady([])}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" /> Clear
              </button>
            </div>
          )}

          {/* The grid: hairline-ruled cells sharing their borders. */}
          <div className="grid grid-cols-2 border-l border-t border-border lg:grid-cols-4">
            {visible.map((tool) => {
              const Icon = tool.icon;
              const index = TOOLS.indexOf(tool) + 1;
              return (
                <Link
                  key={tool.id}
                  to={`/${tool.id}`}
                  onClick={(e) => openTool(tool, e)}
                  className="group relative flex min-h-[9.5rem] flex-col border-b border-r border-border bg-background p-4 transition-colors sm:min-h-[15rem] sm:p-6 hover:bg-card focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between">
                    <span className="font-mono text-xs text-muted-foreground">{pad(index)}</span>
                    <span className="label-mono hidden sm:inline">{CATEGORIES[tool.category].label}</span>
                  </div>
                  <Icon className="mt-6 h-6 w-6 sm:mt-10 sm:h-7 sm:w-7 stroke-[1.5] transition-colors group-hover:text-brand" />
                  <span className="mt-auto block pt-4 text-[15px] font-medium tracking-[-0.015em] sm:mt-5 sm:pt-0 sm:text-lg">{tool.name}</span>
                  <span className="mt-1.5 hidden text-sm leading-relaxed text-muted-foreground sm:block">{tool.description}</span>
                  <ArrowUpRight className="absolute bottom-6 right-6 h-4 w-4 text-muted-foreground opacity-0 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground group-hover:opacity-100" />
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* -------------------------- How it works -------------------------- */}
      <section className="mt-24 border-t border-border">
        <div className="container grid lg:grid-cols-12">
          <div className="py-10 lg:col-span-3 lg:py-12">
            <p className="label-mono">Process</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">How it works</h2>
          </div>
          <ol className="grid border-border sm:grid-cols-3 lg:col-span-9 lg:border-l">
            {STEPS.map((s, i) => (
              <li key={s.title} className={cn("border-t border-border py-8 sm:border-t-0 sm:py-12 sm:pr-8", i > 0 && "sm:border-l sm:pl-8", i === 0 && "lg:pl-8")}>
                <span className="font-mono text-xs text-brand">{pad(i + 1)}</span>
                <p className="mt-4 text-lg font-medium tracking-[-0.015em]">{s.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="container flex flex-col gap-2 py-6 sm:flex-row sm:items-center sm:justify-between">
          <span className="label-mono">PDF Editor</span>
          <span className="label-mono">Files are processed on your device · Never uploaded</span>
        </div>
      </footer>
    </div>
  );
};

export default Home;
