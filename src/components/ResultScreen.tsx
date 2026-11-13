import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Download, FileArchive } from "lucide-react";
import { Button } from "./ui/button";
import { CATEGORIES, TOOLS, type ToolDef } from "../lib/tools";
import { downloadAll, downloadFile, formatSize, type ToolOutput } from "../lib/files";
import { cn } from "../lib/utils";

interface ResultScreenProps {
  tool: ToolDef;
  output: ToolOutput;
  onBack: () => void;
  onStartOver: () => void;
  onContinue: (tool: ToolDef) => void;
}

export const ResultScreen = ({ tool, output, onBack, onStartOver, onContinue }: ResultScreenProps) => {
  const [downloading, setDownloading] = useState(false);
  const { files, inputSize } = output;
  const many = files.length > 1;
  const outSize = files.reduce((n, f) => n + f.bytes.byteLength, 0);
  const change = inputSize > 0 ? Math.round(((outSize - inputSize) / inputSize) * 100) : 0;
  // Tools that can take this output: single-file tools need exactly one PDF.
  const next = TOOLS.filter((t) => t.id !== tool.id && (t.multiple || files.length === 1));

  const download = async () => {
    setDownloading(true);
    try {
      await downloadAll(files, `${tool.id}_files.zip`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
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

      {many && (
        <ul className="mt-8 divide-y divide-border rounded-lg border border-border">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="truncate">{f.name}</span>
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

      {next.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Continue with</h2>
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
