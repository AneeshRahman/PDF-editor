import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Undo2, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Slider } from "../ui/slider";
import type { PageStroke, PreviewEffect, PreviewOptions } from "../PDFPreview";
import type { LoadedPdf } from "../../lib/files";
import { estimateWatermarkColors } from "../../lib/pdf-operations";
import { cleanPage, type Region, type WatermarkColors } from "../../lib/watermark";
import { removeVectorWatermark, type VectorRemovalResult } from "../../lib/vector-watermark";

type Spread = "painted" | "page" | "all";

const SPREADS: { value: Spread; label: string; hint: string }[] = [
  { value: "painted", label: "Only where I paint", hint: "Precise. Text you paint over is kept." },
  { value: "page", label: "Whole page", hint: "Finds the rest of the watermark on that page." },
  { value: "all", label: "All pages", hint: "Same colour watermark anywhere in the document." },
];

/** Everything the Download button needs to remove the watermark. */
export interface RemovalPlan {
  regions: Record<number, Region[]>;
  colors: WatermarkColors | null;
  tolerance: number;
}

interface RemoveSectionProps {
  file: LoadedPdf;
  /** This section's tab is showing (brush shortcuts only work then). */
  active: boolean;
  strokes: PageStroke[];
  setStrokes?: (strokes: PageStroke[] | ((all: PageStroke[]) => PageStroke[])) => void;
  setPreview?: (options: PreviewOptions) => void;
  onBrushSize: (size: number) => void;
  /** Reports what would be removed (null = nothing yet). */
  onPlan: (plan: RemovalPlan | null) => void;
}

/** "Remove" tab: paint over a watermark with the brush; the result shows live. */
export const RemoveSection = ({ file, active, strokes, setStrokes, setPreview, onBrushSize, onPlan }: RemoveSectionProps) => {
  const [brushSize, setBrushSize] = useState(28);
  const [spread, setSpread] = useState<Spread>("page");
  const [tolerance, setTolerance] = useState(0.5);

  const [colors, setColors] = useState<WatermarkColors | null>(null);
  const [learning, setLearning] = useState(false);
  const [learnError, setLearnError] = useState<string | null>(null);
  const [vector, setVector] = useState<VectorRemovalResult | null>(null);
  const [vectorBusy, setVectorBusy] = useState(false);
  const learnId = useRef(0);
  const vectorId = useRef(0);

  const allPages = useMemo(() => Array.from({ length: file.pageCount }, (_, i) => i), [file.pageCount]);

  useEffect(() => onBrushSize(brushSize), [brushSize, onBrushSize]);

  /* --------------------------- What to clean -------------------------- */

  // The marks the watermark's colour is learned from: the last page painted.
  const sample = useMemo((): { page: number; regions: Region[] } | null => {
    if (!strokes.length) return null;
    const page = strokes[strokes.length - 1].page;
    return { page, regions: [{ kind: "strokes", strokes: strokes.filter((s) => s.page === page).map((s) => s.stroke) }] };
  }, [strokes]);
  const sampleKey = JSON.stringify(sample);

  // Regions to clean, per page.
  const regions = useMemo((): Record<number, Region[]> => {
    const out: Record<number, Region[]> = {};
    if (!strokes.length) return out;
    if (spread === "all") allPages.forEach((p) => (out[p] = [{ kind: "page" }]));
    else
      for (const s of strokes) {
        if (spread === "page") out[s.page] = [{ kind: "page" }];
        else (out[s.page] ??= [{ kind: "strokes", strokes: [] }]);
      }
    if (spread === "painted") {
      for (const s of strokes) (out[s.page][0] as Extract<Region, { kind: "strokes" }>).strokes.push(s.stroke);
    }
    return out;
  }, [strokes, spread, allPages]);

  const keep = true; // the brush always protects text
  const regionCount = Object.keys(regions).length;
  const ready = regionCount > 0 && !!colors;

  useEffect(() => {
    onPlan(ready ? { regions, colors, tolerance } : null);
  }, [ready, regions, colors, tolerance, onPlan]);

  /* ------------------------- Learn the colours ------------------------ */

  useEffect(() => {
    const id = ++learnId.current;
    setLearnError(null);
    if (!sample) {
      setColors(null);
      setLearning(false);
      return;
    }
    setLearning(true);
    const timer = setTimeout(async () => {
      try {
        const found = await estimateWatermarkColors(file.bytes, sample.page, sample.regions);
        if (learnId.current !== id) return;
        setColors(found);
        if (!found) {
          setLearnError("Couldn't pick out a watermark colour. Paint over the watermark itself, not just the white page.");
        }
      } catch (e) {
        if (learnId.current === id) setLearnError(e instanceof Error ? e.message : "Could not analyse the page");
      } finally {
        if (learnId.current === id) setLearning(false);
      }
    }, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sampleKey stands in for sample
  }, [sampleKey, file.bytes]);

  /* ------------------- Vector pass (the PDF's own drawing) ------------ */

  // Most watermarks are drawn as text or shapes. Remove that drawing from the PDF itself
  // and preview the real result; the pixel pass below only handles what is left.
  const regionPages = Object.keys(regions).map(Number).sort((a, b) => a - b);
  const regionPagesKey = regionPages.join(",");
  useEffect(() => {
    const id = ++vectorId.current;
    if (!colors || !keep || !regionPages.length) {
      setVector(null);
      setVectorBusy(false);
      return;
    }
    setVectorBusy(true);
    const timer = setTimeout(async () => {
      try {
        const r = await removeVectorWatermark(file.bytes, regionPages, colors, tolerance);
        if (vectorId.current === id) setVector(r.total ? r : null);
      } catch (e) {
        console.error(e);
        if (vectorId.current === id) setVector(null);
      } finally {
        if (vectorId.current === id) setVectorBusy(false);
      }
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- regionPagesKey stands in for regionPages
  }, [colors, keep, regionPagesKey, tolerance, file.bytes]);

  /* ---------------------------- Live preview -------------------------- */

  const effect = useMemo((): PreviewEffect | null => {
    if (!ready) return null;
    const opts = { keepText: keep, tolerance };
    return {
      key: JSON.stringify({ regions, colors, opts }),
      apply: (page, img, pxPerPt) => (regions[page] ? cleanPage(img, regions[page], colors, opts, pxPerPt) : null),
    };
  }, [ready, regions, colors, keep, tolerance]);

  useEffect(() => {
    setPreview?.({ effect, pdfOverride: vector?.bytes ?? null });
  }, [setPreview, effect, vector]);
  useEffect(() => () => setPreview?.({ effect: null, pdfOverride: null }), [setPreview]);

  // Ctrl/⌘+Z undoes the last brush stroke.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setStrokes?.((all) => all.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, setStrokes]);

  /* -------------------------------- UI -------------------------------- */

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Brush size: {brushSize}pt</Label>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={!strokes.length}
              onClick={() => setStrokes?.((all) => all.slice(0, -1))}
              title="Undo stroke (Ctrl+Z)"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" disabled={!strokes.length} onClick={() => setStrokes?.([])} title="Clear all strokes">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Slider value={[brushSize]} onValueChange={([v]) => setBrushSize(v)} min={6} max={120} step={2} />
        {!strokes.length && (
          <p className="rounded-md border border-dashed border-primary/50 bg-primary/5 p-3 text-sm">
            <span className="font-medium">Paint over part of the watermark</span> on the page. It's removed as you paint,
            and the text is kept.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Remove the watermark from</Label>
        <RadioGroup value={spread} onValueChange={(v) => setSpread(v as Spread)} className="gap-2">
          {SPREADS.map((s) => (
            <div key={s.value} className="flex items-start space-x-2">
              <RadioGroupItem value={s.value} id={`spread-${s.value}`} className="mt-0.5" />
              <Label htmlFor={`spread-${s.value}`} className="cursor-pointer font-normal leading-snug">
                {s.label}
                <span className="block text-xs text-muted-foreground">{s.hint}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label>Colour tolerance: {Math.round(tolerance * 100)}%</Label>
        <Slider value={[tolerance]} onValueChange={([v]) => setTolerance(v)} min={0} max={1} step={0.05} />
        <p className="text-xs text-muted-foreground">Raise it if bits of watermark remain; lower it if text gets lighter.</p>
      </div>

      {learning && (
        <p className="flex items-center text-xs text-muted-foreground">
          <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Analysing the watermark…
        </p>
      )}
      {learnError && <p className="text-xs text-destructive">{learnError}</p>}
      {colors && !learning && (
        <div className="space-y-1.5 rounded-md bg-muted/60 p-3 text-xs">
          <p className="flex items-center gap-2">
            <span
              className="inline-block h-4 w-4 rounded border border-border"
              style={{ background: `rgb(${colors.mark.map(Math.round).join(",")})` }}
            />
            Watermark colour detected.
          </p>
          {vectorBusy ? (
            <p className="flex items-center text-muted-foreground">
              <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Looking for it in the PDF's drawing…
            </p>
          ) : vector ? (
            <p data-testid="vector-status">
              <span className="font-medium text-emerald-700 dark:text-emerald-400">Removed from the PDF itself</span>
              {" "}({vector.total} drawing{vector.total === 1 ? "" : "s"} on {Object.keys(vector.removed).length} page
              {Object.keys(vector.removed).length === 1 ? "" : "s"}). Text is untouched and stays sharp.
            </p>
          ) : (
            <p data-testid="vector-status" className="text-muted-foreground">
              The watermark is part of an image (e.g. a scan), so its pixels are cleaned instead.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
