import { useEffect, useMemo, useState } from "react";
import { RotateCcw, RotateCw } from "lucide-react";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { CompressTool } from "./CompressTool";
import { CropTool } from "./CropTool";
import { InvertTool } from "./InvertTool";
import { ResizeTool } from "./ResizeTool";
import { WatermarkTool } from "./WatermarkTool";
import { baseName, formatSize, type LoadedPdf, type OutputFile } from "../../lib/files";
import { cn } from "../../lib/utils";
import type { PageStroke, PreviewOptions } from "../PDFPreview";
import {
  addTextWatermark,
  compressPdf,
  cropPages,
  describeRange,
  fixedRanges,
  invertPdf,
  mergePdfs,
  parsePageRanges,
  resizePages,
  rotatePdf,
  splitPdf,
  type PageRange,
  type ProgressCallback,
  type WatermarkSettings,
  type AreaSelection,
} from "../../lib/pdf-operations";

export interface ToolPanelProps {
  files: LoadedPdf[];
  /** Runs the operation with a busy state, progress and error handling, then shows the result screen. */
  process: (op: (onProgress: ProgressCallback) => Promise<OutputFile[]>) => void;
  /** Live watermark preview (only the watermark tool uses it). */
  onPreviewWatermark?: (settings: WatermarkSettings) => void;
  /** The area dragged on the preview (tools with areaSelect only). */
  selection?: AreaSelection | null;
  setSelection?: (selection: AreaSelection | null) => void;
  /** Brush strokes painted on the preview. */
  strokes?: PageStroke[];
  setStrokes?: (strokes: PageStroke[] | ((all: PageStroke[]) => PageStroke[])) => void;
  /** Ask the canvas for a tool, a live effect, highlights, a CSS filter, etc. Merged into the current options. */
  setPreview?: (options: PreviewOptions) => void;
}

const named = (file: LoadedPdf, suffix: string) => `${baseName(file.name)}_${suffix}.pdf`;

const Panel = ({ children }: { children: React.ReactNode }) => (
  <div className="space-y-6 p-6 bg-card rounded-lg border border-border">{children}</div>
);

/* ---------------------------- Organize ---------------------------- */

export const MergePanel = ({ files, process }: ToolPanelProps) => {
  const pages = files.reduce((n, f) => n + f.pageCount, 0);
  const size = files.reduce((n, f) => n + f.bytes.byteLength, 0);
  return (
    <Panel>
      <div className="space-y-1 text-sm">
        <p>
          <span className="font-medium">{files.length}</span> files · {pages} pages · {formatSize(size)}
        </p>
        <p className="text-muted-foreground">
          Files are merged in the order shown. Drag them, or use the arrows, to reorder.
        </p>
      </div>
      {files.length < 2 && <p className="text-sm text-destructive">Add at least one more PDF to merge.</p>}
      <Button
        className="w-full"
        size="lg"
        disabled={files.length < 2}
        onClick={() =>
          process(async () => [{ name: "merged.pdf", bytes: await mergePdfs(files.map((f) => f.bytes)) }])
        }
      >
        Merge PDF
      </Button>
    </Panel>
  );
};

type SplitMode = "ranges" | "fixed" | "all";

export const SplitPanel = ({ files, process }: ToolPanelProps) => {
  const file = files[0];
  const [mode, setMode] = useState<SplitMode>("ranges");
  const [rangeText, setRangeText] = useState(file.pageCount > 1 ? `1-${Math.ceil(file.pageCount / 2)}` : "1");
  const [every, setEvery] = useState(1);
  const [mergeOutput, setMergeOutput] = useState(false);

  const plan = useMemo((): { ranges: PageRange[] } | { error: string } => {
    try {
      if (mode === "ranges") return { ranges: parsePageRanges(rangeText, file.pageCount) };
      if (mode === "fixed") return { ranges: fixedRanges(file.pageCount, every) };
      return { ranges: fixedRanges(file.pageCount, 1) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Invalid ranges" };
    }
  }, [mode, rangeText, every, file.pageCount]);

  const ranges = "ranges" in plan ? plan.ranges : [];
  const merge = mode === "ranges" && mergeOutput;
  const outputCount = merge ? 1 : ranges.length;

  return (
    <Panel>
      <p className="text-sm text-muted-foreground">
        {file.name} has <span className="font-medium text-foreground">{file.pageCount}</span> pages.
      </p>

      <RadioGroup value={mode} onValueChange={(v) => setMode(v as SplitMode)} className="gap-3">
        {(
          [
            ["ranges", "Custom ranges"],
            ["fixed", "Every N pages"],
            ["all", "Extract every page"],
          ] as const
        ).map(([value, label]) => (
          <div key={value} className="flex items-center space-x-2">
            <RadioGroupItem value={value} id={`split-${value}`} />
            <Label htmlFor={`split-${value}`} className="font-normal cursor-pointer">
              {label}
            </Label>
          </div>
        ))}
      </RadioGroup>

      {mode === "ranges" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="ranges">Pages</Label>
            <Input
              id="ranges"
              value={rangeText}
              onChange={(e) => setRangeText(e.target.value)}
              placeholder="e.g. 1-3, 5, 8-"
            />
            <p className="text-xs text-muted-foreground">
              Separate ranges with commas. Each range becomes its own PDF. "8-" means page 8 to the end.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="merge-ranges" checked={mergeOutput} onCheckedChange={(v) => setMergeOutput(v === true)} />
            <Label htmlFor="merge-ranges" className="font-normal cursor-pointer">
              Merge all ranges into one PDF
            </Label>
          </div>
        </div>
      )}

      {mode === "fixed" && (
        <div className="space-y-2">
          <Label htmlFor="every">Pages per file</Label>
          <Input
            id="every"
            type="number"
            min={1}
            max={file.pageCount}
            value={every}
            onChange={(e) => setEvery(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
      )}

      <div className="rounded-md bg-muted px-3 py-2 text-xs">
        {"error" in plan ? (
          <span className="text-destructive">{plan.error}</span>
        ) : (
          <>
            Creates <span className="font-semibold">{outputCount}</span> PDF{outputCount === 1 ? "" : "s"}
            {!merge && ranges.length <= 8 && <>: pages {ranges.map(describeRange).join(" | ")}</>}
            {outputCount > 1 && " (downloaded as a .zip)"}
          </>
        )}
      </div>

      <Button
        className="w-full"
        size="lg"
        disabled={"error" in plan}
        onClick={() =>
          process(async () => {
            const parts = await splitPdf(file.bytes, ranges, merge);
            return parts.map((p) => ({
              name: named(file, merge ? "extracted" : `pages_${p.range.map(describeRange).join("_")}`),
              bytes: p.bytes,
            }));
          })
        }
      >
        Split PDF
      </Button>
    </Panel>
  );
};

export const RotatePanel = ({ files, process, setPreview }: ToolPanelProps) => {
  const file = files[0];
  const [angle, setAngle] = useState(90);
  // Live preview: the canvas shows the pages already rotated.
  useEffect(() => setPreview?.({ rotation: angle }), [angle, setPreview]);
  useEffect(() => () => setPreview?.({ rotation: 0 }), [setPreview]);
  const options = [
    { value: 270, label: "Left 90°", icon: RotateCcw },
    { value: 90, label: "Right 90°", icon: RotateCw },
    { value: 180, label: "180°", icon: RotateCw },
  ];
  return (
    <Panel>
      <div className="space-y-2">
        <Label>Rotate all pages</Label>
        <div className="grid grid-cols-3 gap-2">
          {options.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setAngle(value)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition",
                angle === value ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted"
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
      </div>
      <Button
        className="w-full"
        size="lg"
        onClick={() => process(async () => [{ name: named(file, "rotated"), bytes: await rotatePdf(file.bytes, angle) }])}
      >
        Rotate PDF
      </Button>
    </Panel>
  );
};

/* ------------------------- Optimize / Edit ------------------------ */

export const CompressPanel = ({ files, process }: ToolPanelProps) => {
  const file = files[0];
  return (
    <CompressTool
      onCompress={(quality) =>
        process(async (onProgress) => {
          const bytes = await compressPdf(file.bytes, quality, onProgress);
          if (bytes.byteLength >= file.bytes.byteLength) {
            throw new Error(
              `It would grow to ${formatSize(bytes.byteLength)}, so nothing was changed. ` +
                "Text-only PDFs are already small; try a lower quality or a scanned PDF."
            );
          }
          return [{ name: named(file, "compressed"), bytes }];
        })
      }
    />
  );
};

export const WatermarkPanel = ({ files, process, onPreviewWatermark }: ToolPanelProps) => {
  const file = files[0];
  return (
    <WatermarkTool
      onWatermarkChange={(s) => onPreviewWatermark?.(s)}
      onApply={(s) =>
        process(async () => [{ name: named(file, "watermarked"), bytes: await addTextWatermark(file.bytes, s) }])
      }
    />
  );
};

export const CropPanel = ({ files, process, setPreview }: ToolPanelProps) => {
  const file = files[0];
  useEffect(() => () => setPreview?.({ cropMargins: null }), [setPreview]);
  return (
    <CropTool
      onChange={(m) => setPreview?.({ cropMargins: m })}
      onCrop={(m) => process(async () => [{ name: named(file, "cropped"), bytes: await cropPages(file.bytes, m) }])}
    />
  );
};

export const ResizePanel = ({ files, process }: ToolPanelProps) => {
  const file = files[0];
  return (
    <ResizeTool
      onResize={(s) =>
        process(async () => [{ name: named(file, "resized"), bytes: await resizePages(file.bytes, s) }])
      }
    />
  );
};

export const InvertPanel = ({ files, process, setPreview }: ToolPanelProps) => {
  const file = files[0];
  // Live preview with a CSS filter; the real inversion happens on export.
  useEffect(() => {
    setPreview?.({ cssFilter: "invert(1)" });
    return () => setPreview?.({ cssFilter: undefined });
  }, [setPreview]);
  return (
    <InvertTool
      onInvert={() =>
        process(async (onProgress) => [{ name: named(file, "inverted"), bytes: await invertPdf(file.bytes, onProgress) }])
      }
    />
  );
};

