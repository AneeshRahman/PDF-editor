import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";

import { FileGrid } from "../components/FileGrid";
import { FileUploader } from "../components/FileUploader";
import { PDFPreview, type PageStroke, type PreviewOptions } from "../components/PDFPreview";
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
import type { AreaSelection, ProgressCallback } from "../lib/pdf-operations";
import { CATEGORIES, type ToolDef } from "../lib/tools";
import { cn } from "../lib/utils";
import { recordEdit } from "../lib/stats";
import { HOME_SEO, seoForPath } from "../lib/seo";
import { useSeo } from "../lib/useSeo";


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
  const [selection, setSelection] = useState<AreaSelection | null>(null);
  const [strokes, setStrokes] = useState<PageStroke[]>([]);
  // What the tool panel wants the canvas to show (tool, live effect, highlights, ...).
  const [preview, setPreviewState] = useState<PreviewOptions>({});
  // State a tool's custom workspace and its side panel share (e.g. Organize's page list).
  const [shared, setShared] = useState<unknown>(null);
  const setPreview = useCallback((p: PreviewOptions) => setPreviewState((prev) => ({ ...prev, ...p })), []);

  useEffect(() => clearHandoff(), []);

  useSeo(seoForPath(`/${tool.id}`) ?? { ...HOME_SEO, path: `/${tool.id}`, name: tool.name, title: tool.name, description: tool.description });

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
      const inputSize = files.reduce((n, f) => n + f.bytes.byteLength, 0);
      setResult({ files: out, inputSize });
      recordEdit(out.length, inputSize);
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

  /**
   * Runs an operation with the busy state, progress and error toast, but no results page:
   * the panel uses the returned value itself (e.g. to download straight away).
   */
  const runTask = async <T,>(op: (onProgress: ProgressCallback) => Promise<T>): Promise<T | undefined> => {
    if (busy) return undefined;
    setBusy(true);
    setProgress(null);
    try {
      const value = await op((page, total) => setProgress((page / total) * 100));
      recordEdit(1, files.reduce((n, f) => n + f.bytes.byteLength, 0));
      return value;
    } catch (err) {
      console.error(err);
      toast.error(`${tool.name} failed`, {
        description: err instanceof Error ? err.message : "Unknown error",
      });
      return undefined;
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
    setSelection(null);
    setStrokes([]);
    setPreviewState({});
    setShared(null);
  };

  const Icon = tool.icon;
  const { Panel } = tool;

  // The workspace stays mounted (just hidden) while the result shows,
  // so "Back to options" returns with every setting and selection intact.
  return (
    <>
      {result && (
        <ResultScreen
          tool={tool}
          input={files}
          output={result}
          onBack={() => setResult(null)}
          onStartOver={startOver}
          onContinue={continueWith}
        />
      )}
      <div hidden={!!result}>{renderWorkspace()}</div>
    </>
  );

  function renderWorkspace() {
    if (!files.length) {
      return (
        <div className="container max-w-3xl py-16 md:py-20">
          <p className="label-mono flex items-center gap-2">
            <Icon className="h-3.5 w-3.5" /> {CATEGORIES[tool.category].label}
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">{tool.name}</h1>
          <p className="mt-3 max-w-xl text-lg text-muted-foreground">{tool.description}</p>
          <div className="mt-10">
            {loading ? (
              <div className="flex h-64 items-center justify-center border border-border bg-card">
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
          {tool.Workspace ? (
            <tool.Workspace
              files={files}
              process={process}
              runTask={runTask}
              setPreview={setPreview}
              shared={shared}
              setShared={setShared}
            />
          ) : tool.multiple ? (
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
                {...preview}
                selection={selection}
                onSelectionChange={setSelection}
                strokes={strokes}
                onStroke={(s) => setStrokes((all) => [...all, s])}
              />
            </div>
          )}
        </section>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
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
            <Panel
              files={files}
              process={process}
              runTask={runTask}
              selection={selection}
              setSelection={setSelection}
              strokes={strokes}
              setStrokes={setStrokes}
              setPreview={setPreview}
              shared={shared}
              setShared={setShared}
            />
          </fieldset>
        </aside>
      </div>
    );
  }
};
