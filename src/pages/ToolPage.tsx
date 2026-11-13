import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";

import { FileGrid } from "../components/FileGrid";
import { FileUploader } from "../components/FileUploader";
import { PDFPreview } from "../components/PDFPreview";
import { ResultScreen } from "../components/ResultScreen";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import {
  clearHandoff,
  formatSize,
  loadPdfFile,
  peekHandoff,
  setHandoff,
  toLoadedPdf,
  type LoadedPdf,
  type OutputFile,
  type ToolOutput,
} from "../lib/files";
import type { ProgressCallback, WatermarkSettings } from "../lib/pdf-operations";
import { CATEGORIES, type ToolDef } from "../lib/tools";
import { cn } from "../lib/utils";

const NO_WATERMARK: WatermarkSettings = { text: "", opacity: 0.3, position: "center" };

export const ToolPage = ({ tool }: { tool: ToolDef }) => {
  const navigate = useNavigate();
  // Files handed over from another tool's result ("Continue with ...").
  const [files, setFiles] = useState<LoadedPdf[]>(() => {
    const handed = peekHandoff() ?? [];
    return tool.multiple ? handed : handed.slice(0, 1);
  });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<ToolOutput | null>(null);
  const [watermark, setWatermark] = useState<WatermarkSettings>(NO_WATERMARK);

  useEffect(() => clearHandoff(), []);

  useEffect(() => {
    document.title = `${tool.name} · PDF Editor`;
    return () => {
      document.title = "PDF Editor";
    };
  }, [tool.name]);

  const addFiles = async (picked: File[]) => {
    setLoading(true);
    const loaded: LoadedPdf[] = [];
    for (const file of picked) {
      try {
        loaded.push(await loadPdfFile(file));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Could not open ${file.name}`);
      }
    }
    setLoading(false);
    if (!loaded.length) return;
    setFiles((current) => (tool.multiple ? [...current, ...loaded] : loaded.slice(0, 1)));
  };

  const process = async (op: (onProgress: ProgressCallback) => Promise<OutputFile[]>) => {
    if (busy) return;
    setBusy(true);
    setProgress(null);
    try {
      const out = await op((page, total) => setProgress((page / total) * 100));
      setResult({ files: out, inputSize: files.reduce((n, f) => n + f.bytes.byteLength, 0) });
      window.scrollTo({ top: 0 });
    } catch (err) {
      console.error(err);
      toast.error(`${tool.name} failed`, {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const continueWith = async (next: ToolDef) => {
    if (!result) return;
    setHandoff(await Promise.all(result.files.map(toLoadedPdf)));
    navigate(`/${next.id}`);
  };

  const startOver = () => {
    setResult(null);
    setFiles([]);
    setWatermark(NO_WATERMARK);
  };

  const Icon = tool.icon;
  const { Panel } = tool;

  if (result) {
    return (
      <ResultScreen
        tool={tool}
        output={result}
        onBack={() => setResult(null)}
        onStartOver={startOver}
        onContinue={continueWith}
      />
    );
  }

  if (!files.length) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-12 text-center">
        <div className={cn("mx-auto mb-4 inline-flex rounded-xl p-3", CATEGORIES[tool.category].tint)}>
          <Icon className="h-8 w-8" />
        </div>
        <h1 className="text-3xl font-bold">{tool.name}</h1>
        <p className="mt-2 text-muted-foreground">{tool.description}</p>
        <div className="mt-8">
          {loading ? (
            <div className="flex h-64 items-center justify-center rounded-xl border-2 border-dashed border-border">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <FileUploader multiple={tool.multiple} onFilesSelect={addFiles} />
          )}
        </div>
      </div>
    );
  }

  const file = files[0];

  return (
    <div className="container mx-auto grid gap-6 px-4 py-6 lg:grid-cols-[1fr_380px]">
      <section className="min-w-0">
        {tool.multiple ? (
          <FileGrid
            files={files}
            onReorder={setFiles}
            onRemove={(id) => setFiles((fs) => fs.filter((f) => f.id !== id))}
            onAdd={addFiles}
          />
        ) : (
          <div className="h-[calc(100vh-8rem)] min-h-[500px]">
            <PDFPreview
              pdfData={file.bytes}
              watermarkText={tool.watermarkPreview ? watermark.text : ""}
              watermarkOpacity={watermark.opacity}
              watermarkPosition={watermark.position}
            />
          </div>
        )}
      </section>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <span className={cn("rounded-lg p-2", CATEGORIES[tool.category].tint)}>
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="font-semibold">{tool.name}</h1>
              {!tool.multiple && (
                <p className="truncate text-xs text-muted-foreground" title={file.name}>
                  {file.name} · {file.pageCount} pages · {formatSize(file.bytes.byteLength)}
                </p>
              )}
            </div>
            {!tool.multiple && (
              <Button variant="ghost" size="icon" onClick={startOver} disabled={busy} title="Choose another file">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {(busy || loading) && (
            <div className="mt-3 space-y-2">
              <p className="flex items-center text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                {loading ? "Opening files…" : "Working…"}
              </p>
              {progress !== null && <Progress value={progress} className="h-1.5" />}
            </div>
          )}
        </div>

        {/* A disabled fieldset disables every button inside while an operation runs. */}
        <fieldset disabled={busy} className="disabled:opacity-60">
          <Panel files={files} process={process} onPreviewWatermark={setWatermark} />
        </fieldset>
      </aside>
    </div>
  );
};
