import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Download, FileArchive } from "lucide-react";
import { Button } from "./ui/button";
import { PDFPreview } from "./PDFPreview";
import { PdfThumbnail } from "./PdfThumbnail";
import { CATEGORIES, TOOLS, type ToolDef } from "../lib/tools";
import { downloadAll, downloadFile, formatSize, type LoadedPdf, type ToolOutput } from "../lib/files";
import { cn } from "../lib/utils";

interface ResultScreenProps {
  tool: ToolDef;
  /** The files the tool started from, for the before/after comparison. */
  input: LoadedPdf[];
  output: ToolOutput;
  onBack: () => void;
  onStartOver: () => void;
  onContinue: (tool: ToolDef) => void;
}

export const ResultScreen = ({ tool, input, output, onBack, onStartOver, onContinue }: ResultScreenProps) => {
  const [downloading, setDownloading] = useState(false);
  const [showing, setShowing] = useState<"after" | "before">("after");
  const { files, inputSize } = output;
  const many = files.length > 1;
  const outSize = files.reduce((n, f) => n + f.bytes.byteLength, 0);
  const change = inputSize > 0 ? Math.round(((outSize - inputSize) / inputSize) * 100) : 0;
  // Tools that can take this output: single-file tools need exactly one PDF.
  const usable = (t: ToolDef) => t.id !== tool.id && (t.multiple || files.length === 1);
  // Hand-picked next steps for this tool first, then everything else.
  const related = (tool.related ?? []).map((id) => TOOLS.find((t) => t.id === id)).filter((t): t is ToolDef => !!t && usable(t));
  const next = TOOLS.filter((t) => usable(t) && !related.includes(t));

  const download = async () => {
    setDownloading(true);
    try {
      await downloadAll(files, `${tool.id}_files.zip`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
        <h1 className="mt-4 text-2xl md:text-3xl font-bold">
          {many ? `${files.length} PDFs are ready` : "Your PDF is ready"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {formatSize(inputSize)} → {formatSize(outSize)}
          {/* Only worth calling out when the file got smaller. */}
          {change < 0 && (
            <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
              {change}%
            </span>
          )}
        </p>

        <Button size="lg" className="mt-6 h-14 px-10 text-base" onClick={download} disabled={downloading}>
          {many ? <FileArchive className="mr-2 h-5 w-5" /> : <Download className="mr-2 h-5 w-5" />}
          {many ? "Download all (.zip)" : "Download PDF"}
        </Button>

        <div className="mt-4 flex justify-center gap-2 text-sm">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to options
          </Button>
          <Button variant="ghost" size="sm" onClick={onStartOver}>
            Start over
          </Button>
        </div>
      </div>

      {!many && (
        <section className="mt-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">Preview</h2>
            {input.length === 1 && (
              <div className="inline-flex rounded-lg bg-muted p-1 text-sm" role="tablist" aria-label="Compare">
                {(["after", "before"] as const).map((v) => (
                  <button
                    key={v}
                    role="tab"
                    aria-selected={showing === v}
                    onClick={() => setShowing(v)}
                    className={cn(
                      "rounded-md px-3 py-1 capitalize transition",
                      showing === v ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="h-[70vh] min-h-[420px]">
            <PDFPreview pdfData={showing === "before" && input.length === 1 ? input[0].bytes : files[0].bytes} />
          </div>
        </section>
      )}

      {many && (
        <ul className="mt-8 divide-y divide-border rounded-lg border border-border">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="flex min-w-0 items-center gap-3">
                <PdfThumbnail bytes={f.bytes} width={36} className="shrink-0 border border-border" />
                <span className="truncate">{f.name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3 text-muted-foreground">
                {formatSize(f.bytes.byteLength)}
                <Button variant="outline" size="sm" onClick={() => downloadFile(f)}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {related.length > 0 && (
        <section className="mt-12" data-testid="related-tools">
          <p className="label-mono">Related tools</p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em]">Keep going with this file</h2>
          <div className="mt-4 grid gap-0 border-l border-t border-border sm:grid-cols-3">
            {related.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onContinue(t)}
                  className="group flex flex-col items-start gap-3 border-b border-r border-border bg-card p-4 text-left transition-colors hover:bg-muted"
                >
                  <Icon className="h-5 w-5 stroke-[1.5] transition-colors group-hover:text-brand" />
                  <span className="text-sm font-medium">{t.name}</span>
                  <span className="text-xs leading-relaxed text-muted-foreground">{t.description}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {next.length > 0 && (
        <section className={related.length ? "mt-8" : "mt-12"}>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{related.length ? "All other tools" : "Continue with"}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {next.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onContinue(t)}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-left text-sm transition hover:border-primary/40 hover:bg-muted"
                >
                  <span className={cn("rounded-md p-1.5", CATEGORIES[t.category].tint)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  {t.name}
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            or go back to <Link to="/" className="underline underline-offset-2">all tools</Link>
          </p>
        </section>
      )}
    </div>
  );
};
