import { useCallback, useState } from "react";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import { Download, FileText, Loader2, RotateCcw, X } from "lucide-react";

import { FileUploader } from "../components/FileUploader";
import { PDFPreview } from "../components/PDFPreview";
import { CompressTool } from "../components/tools/CompressTool";
import { CropTool } from "../components/tools/CropTool";
import { InvertTool } from "../components/tools/InvertTool";
import { ResizeTool } from "../components/tools/ResizeTool";
import { WatermarkRemovalTool } from "../components/tools/WatermarkRemovalTool";
import { WatermarkTool } from "../components/tools/WatermarkTool";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  addTextWatermark,
  compressPdf,
  cropPages,
  invertPdf,
  removeWatermarkByImage,
  resizePages,
  type ProgressCallback,
  type WatermarkSettings,
} from "../lib/pdf-operations";

interface LoadedFile {
  name: string;
  original: Uint8Array;
}

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;

const Index = () => {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [current, setCurrent] = useState<Uint8Array | null>(null);
  const [edits, setEdits] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [watermark, setWatermark] = useState<WatermarkSettings>({
    text: "",
    opacity: 0.3,
    position: "center",
  });

  const handleFileSelect = useCallback(async (selected: File) => {
    const bytes = new Uint8Array(await selected.arrayBuffer());
    setFile({ name: selected.name, original: bytes });
    setCurrent(bytes);
    setEdits([]);
  }, []);

  /** Runs an operation on the current PDF and replaces it with the result. */
  const run = async (
    label: string,
    op: (bytes: Uint8Array, onProgress: ProgressCallback) => Promise<Uint8Array>
  ) => {
    if (!current || busy) return;
    setBusy(label);
    setProgress(null);
    try {
      const before = current.byteLength;
      const result = await op(current, (page, total) => setProgress((page / total) * 100));
      setCurrent(result);
      setEdits((e) => [...e, label]);
      toast.success(`${label} applied`, {
        description: `${formatSize(before)} → ${formatSize(result.byteLength)}`,
      });
    } catch (err) {
      console.error(err);
      toast.error(`${label} failed`, {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const download = () => {
    if (!current || !file) return;
    const base = file.name.replace(/\.pdf$/i, "");
    const name = edits.length ? `${base}-edited.pdf` : file.name;
    saveAs(new Blob([current as BlobPart], { type: "application/pdf" }), name);
  };

  const closeFile = () => {
    setFile(null);
    setCurrent(null);
    setEdits([]);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto flex items-center gap-3 px-4 py-4">
          <FileText className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold">PDF Editor</h1>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Everything runs in your browser. Files are never uploaded.
          </span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {!file || !current ? (
          <div className="mx-auto max-w-xl pt-12">
            <FileUploader onFileSelect={handleFileSelect} />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
            <aside className="space-y-4">
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatSize(current.byteLength)}
                      {edits.length > 0 && ` · ${edits.join(" → ")}`}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={closeFile} title="Close file" disabled={!!busy}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCurrent(file.original);
                      setEdits([]);
                    }}
                    disabled={!!busy || edits.length === 0}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Reset
                  </Button>
                  <Button onClick={download} disabled={!!busy}>
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </div>
                {busy && (
                  <div className="space-y-2">
                    <p className="flex items-center text-xs text-muted-foreground">
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      {busy}…
                    </p>
                    {progress !== null && <Progress value={progress} className="h-1.5" />}
                  </div>
                )}
              </div>

              <Tabs defaultValue="watermark">
                <TabsList className="grid h-auto w-full grid-cols-3">
                  <TabsTrigger value="watermark">Watermark</TabsTrigger>
                  <TabsTrigger value="crop">Crop</TabsTrigger>
                  <TabsTrigger value="resize">Resize</TabsTrigger>
                  <TabsTrigger value="compress">Compress</TabsTrigger>
                  <TabsTrigger value="invert">Invert</TabsTrigger>
                  <TabsTrigger value="remove">Remove WM</TabsTrigger>
                </TabsList>

                {/* A disabled fieldset disables every button inside while an operation runs. */}
                <fieldset disabled={!!busy} className="mt-4 disabled:opacity-60">
                  <TabsContent value="watermark" className="mt-0">
                    <WatermarkTool
                      onWatermarkChange={setWatermark}
                      onApply={(s) => run("Watermark", (b) => addTextWatermark(b, s))}
                    />
                  </TabsContent>
                  <TabsContent value="crop" className="mt-0">
                    <CropTool onCrop={(m) => run("Crop", (b) => cropPages(b, m))} />
                  </TabsContent>
                  <TabsContent value="resize" className="mt-0">
                    <ResizeTool onResize={(s) => run("Resize", (b) => resizePages(b, s))} />
                  </TabsContent>
                  <TabsContent value="compress" className="mt-0">
                    <CompressTool
                      onCompress={(q) =>
                        run("Compress", async (b, p) => {
                          const result = await compressPdf(b, q, p);
                          if (result.byteLength >= b.byteLength) {
                            throw new Error(
                              `It would grow to ${formatSize(result.byteLength)}, so the original was kept. ` +
                                "Text-only PDFs are already small; try a lower quality or a scanned PDF."
                            );
                          }
                          return result;
                        })
                      }
                    />
                  </TabsContent>
                  <TabsContent value="invert" className="mt-0">
                    <InvertTool onInvert={() => run("Invert", (b, p) => invertPdf(b, p))} />
                  </TabsContent>
                  <TabsContent value="remove" className="mt-0">
                    <WatermarkRemovalTool
                      onRemove={(image, threshold) =>
                        run("Watermark removal", async (b, p) => {
                          const { bytes, matches } = await removeWatermarkByImage(b, image, threshold, p);
                          if (matches === 0) {
                            throw new Error("No matches found. Try lowering the threshold or a tighter screenshot.");
                          }
                          toast.info(`Removed ${matches} watermark match${matches === 1 ? "" : "es"}`);
                          return bytes;
                        })
                      }
                    />
                  </TabsContent>
                </fieldset>
              </Tabs>
            </aside>

            <section className="h-[calc(100vh-10rem)] min-h-[500px]">
              <PDFPreview
                pdfData={current}
                watermarkText={watermark.text}
                watermarkOpacity={watermark.opacity}
                watermarkPosition={watermark.position}
              />
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
