import { useEffect, useMemo, useRef, useState } from "react";
import { Brush, Loader2, ScanSearch, SquareDashed, Undo2, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Progress } from "../ui/progress";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Slider } from "../ui/slider";
import type { ToolPanelProps } from "./panels";
import type { PreviewEffect } from "../PDFPreview";
import { baseName } from "../../lib/files";
import { cn } from "../../lib/utils";
import {
  estimateWatermarkColors,
  findSimilarAreas,
  parsePageRanges,
  removeWatermark,
  type PageRects,
} from "../../lib/pdf-operations";
import { cleanPage, type Region, type WatermarkColors } from "../../lib/watermark";

type Method = "brush" | "box";
type Spread = "painted" | "page" | "all";
type BoxMode = "erase" | "similar";
type Scope = "all" | "this" | "custom";

const METHODS = [
  { value: "brush" as const, label: "Brush", hint: "Paint over the watermark", icon: Brush },
  { value: "box" as const, label: "Box", hint: "Drag a box around it", icon: SquareDashed },
];

const SPREADS: { value: Spread; label: string; hint: string }[] = [
  { value: "painted", label: "Only where I paint", hint: "Precise. Text you paint over is kept." },
  { value: "page", label: "Whole page", hint: "Finds the rest of the watermark on that page." },
  { value: "all", label: "All pages", hint: "Same colour watermark anywhere in the document." },
];

export const RemoveWatermarkPanel = ({
  files,
  process,
  selection,
  setSelection,
  strokes = [],
  setStrokes,
  setPreview,
}: ToolPanelProps) => {
  const file = files[0];
  const [method, setMethod] = useState<Method>("brush");
  const [brushSize, setBrushSize] = useState(28);
  const [spread, setSpread] = useState<Spread>("page");
  const [boxMode, setBoxMode] = useState<BoxMode>("erase");
  const [scope, setScope] = useState<Scope>("all");
  const [customPages, setCustomPages] = useState(`1-${file.pageCount}`);
  const [keepText, setKeepText] = useState(true);
  const [tolerance, setTolerance] = useState(0.5);
  const [threshold, setThreshold] = useState(0.6);

  const [colors, setColors] = useState<WatermarkColors | null>(null);
  const [learning, setLearning] = useState(false);
  const [learnError, setLearnError] = useState<string | null>(null);
  const [matches, setMatches] = useState<PageRects | null>(null);
  const [finding, setFinding] = useState(false);
  const [findProgress, setFindProgress] = useState<number | null>(null);
  const [findError, setFindError] = useState<string | null>(null);
  const runId = useRef(0);
  const learnId = useRef(0);

  const allPages = useMemo(() => Array.from({ length: file.pageCount }, (_, i) => i), [file.pageCount]);

  /* --------------------------- What to clean -------------------------- */

  // Pages for box "erase this area".
  const boxPages = useMemo((): { pages: number[] } | { error: string } => {
    if (scope === "this") return { pages: selection ? [selection.page] : [] };
    if (scope === "all") return { pages: allPages };
    try {
      const set = new Set<number>();
      for (const r of parsePageRanges(customPages, file.pageCount)) for (let p = r.from; p <= r.to; p++) set.add(p - 1);
      return { pages: [...set].sort((a, b) => a - b) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Invalid pages" };
    }
  }, [scope, customPages, file.pageCount, selection, allPages]);

  // The marks the watermark's colour is learned from: the last page painted, or the box.
  const sample = useMemo((): { page: number; regions: Region[] } | null => {
    if (method === "brush") {
      if (!strokes.length) return null;
      const page = strokes[strokes.length - 1].page;
      return { page, regions: [{ kind: "strokes", strokes: strokes.filter((s) => s.page === page).map((s) => s.stroke) }] };
    }
    return selection ? { page: selection.page, regions: [{ kind: "rect", rect: selection.rect }] } : null;
  }, [method, strokes, selection]);
  const sampleKey = JSON.stringify(sample);

  // Regions to clean, per page.
  const regions = useMemo((): Record<number, Region[]> => {
    const out: Record<number, Region[]> = {};
    if (method === "brush") {
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
    }
    if (!selection) return out;
    if (boxMode === "similar") {
      for (const [p, rects] of Object.entries(matches ?? {})) out[+p] = rects.map((rect) => ({ kind: "rect", rect }));
      return out;
    }
    if ("pages" in boxPages) boxPages.pages.forEach((p) => (out[p] = [{ kind: "rect", rect: selection.rect }]));
    return out;
  }, [method, strokes, spread, allPages, selection, boxMode, matches, boxPages]);

  const keep = method === "brush" ? true : keepText; // the brush always protects text
  const needsColors = keep;
  const regionCount = Object.keys(regions).length;
  const ready = regionCount > 0 && (!needsColors || !!colors);

  /* ------------------------- Learn the colours ------------------------ */

  useEffect(() => {
    const id = ++learnId.current;
    setLearnError(null);
    if (!sample || !needsColors) {
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
          setLearnError(
            method === "brush"
              ? "Couldn't pick out a watermark colour. Paint over the watermark itself, not just the white page."
              : "Couldn't pick out a watermark colour in the box. Draw it over the watermark, or untick “Keep text”."
          );
        }
      } catch (e) {
        if (learnId.current === id) setLearnError(e instanceof Error ? e.message : "Could not analyse the page");
      } finally {
        if (learnId.current === id) setLearning(false);
      }
    }, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sampleKey stands in for sample
  }, [sampleKey, needsColors, file.bytes]);

  /* ---------------------------- Live preview -------------------------- */

  const effect = useMemo((): PreviewEffect | null => {
    if (!ready) return null;
    const opts = { keepText: keep, tolerance };
    return {
      key: JSON.stringify({ regions, colors, opts }),
      apply: (page, img, pxPerPt) => (regions[page] ? cleanPage(img, regions[page], colors, opts, pxPerPt) : null),
    };
  }, [ready, regions, colors, keep, tolerance]);

  const highlights = useMemo((): PageRects | null => {
    if (method !== "box" || !selection) return null;
    const out: PageRects = {};
    for (const [p, list] of Object.entries(regions)) {
      out[+p] = list.flatMap((r) => (r.kind === "rect" ? [r.rect] : []));
    }
    return out;
  }, [method, selection, regions]);

  useEffect(() => {
    setPreview?.({ tool: method, brushSize, effect, highlights });
  }, [setPreview, method, brushSize, effect, highlights]);
  useEffect(() => () => setPreview?.({ tool: "none", effect: null, highlights: null }), [setPreview]);

  // Ctrl/⌘+Z undoes the last brush stroke.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && method === "brush") {
        e.preventDefault();
        setStrokes?.((all) => all.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [method, setStrokes]);

  /* --------------------------- Find similar --------------------------- */

  useEffect(() => {
    runId.current++;
    setMatches(null);
    setFindError(null);
    setFinding(false);
    setFindProgress(null);
  }, [selection, threshold, boxMode, scope, customPages]);

  const findMatches = async () => {
    if (!selection || !("pages" in boxPages)) return;
    const id = ++runId.current;
    setFinding(true);
    setFindError(null);
    setFindProgress(0);
    try {
      const found = await findSimilarAreas(file.bytes, selection, threshold, boxPages.pages, (n, total) => {
        if (runId.current === id) setFindProgress((n / total) * 100);
      });
      if (runId.current === id) setMatches(found);
    } catch (e) {
      if (runId.current === id) setFindError(e instanceof Error ? e.message : "Search failed");
    } finally {
      if (runId.current === id) {
        setFinding(false);
        setFindProgress(null);
      }
    }
  };

  const apply = () => {
    if (!ready) return;
    process(async (onProgress) => [
      {
        name: `${baseName(file.name)}_cleaned.pdf`,
        bytes: await removeWatermark(file.bytes, regions, colors, { keepText: keep, tolerance }, onProgress),
      },
    ]);
  };

  const matchCount = matches ? Object.values(matches).reduce((n, r) => n + r.length, 0) : 0;

  /* -------------------------------- UI -------------------------------- */

  return (
    <div className="space-y-6 p-6 bg-card rounded-lg border border-border">
      <div className="grid grid-cols-2 gap-2">
        {METHODS.map(({ value, label, hint, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setMethod(value)}
            aria-pressed={method === value}
            className={cn(
              "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition",
              method === value ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
            )}
          >
            <Icon className={cn("h-5 w-5", method === value ? "text-primary" : "text-muted-foreground")} />
            <span className="text-sm font-medium">{label}</span>
            <span className="text-xs text-muted-foreground">{hint}</span>
          </button>
        ))}
      </div>

      {method === "brush" ? (
        <>
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
                <span className="font-medium">Paint over part of the watermark</span> on the page. It doesn't need to be
                exact: the brush learns the watermark's colour and keeps the text.
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
        </>
      ) : (
        <>
          {selection ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              <span>
                Box on <span className="font-medium">page {selection.page + 1}</span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => setSelection?.(null)}>
                Clear
              </Button>
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-primary/50 bg-primary/5 p-3 text-sm">
              <span className="font-medium">Drag a box around the watermark</span> on the page.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["erase", "Same spot", "On each chosen page", SquareDashed],
                ["similar", "Find similar", "Copies anywhere", ScanSearch],
              ] as const
            ).map(([value, label, hint, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setBoxMode(value)}
                aria-pressed={boxMode === value}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition",
                  boxMode === value ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                )}
              >
                <Icon className={cn("h-4 w-4", boxMode === value ? "text-primary" : "text-muted-foreground")} />
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-muted-foreground">{hint}</span>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label>Pages</Label>
            <RadioGroup value={scope} onValueChange={(v) => setScope(v as Scope)} className="gap-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="scope-all" />
                <Label htmlFor="scope-all" className="cursor-pointer font-normal">
                  All {file.pageCount} pages
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="this" id="scope-this" />
                <Label htmlFor="scope-this" className="cursor-pointer font-normal">
                  Only the page with the box{selection ? ` (${selection.page + 1})` : ""}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="custom" id="scope-custom" />
                <Label htmlFor="scope-custom" className="cursor-pointer font-normal">
                  Custom
                </Label>
              </div>
            </RadioGroup>
            {scope === "custom" && (
              <Input aria-label="Custom pages" value={customPages} onChange={(e) => setCustomPages(e.target.value)} placeholder="e.g. 1-3, 5" />
            )}
            {"error" in boxPages && <p className="text-xs text-destructive">{boxPages.error}</p>}
          </div>

          {boxMode === "similar" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Match sensitivity: {Math.round(threshold * 100)}%</Label>
                <Slider value={[threshold]} onValueChange={([v]) => setThreshold(v)} min={0.3} max={0.95} step={0.05} />
              </div>
              <Button variant="outline" className="w-full" disabled={!selection || finding} onClick={findMatches}>
                {finding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-2 h-4 w-4" />}
                {finding ? "Searching…" : matches ? "Search again" : "Find matches"}
              </Button>
              {findProgress !== null && <Progress value={findProgress} className="h-1.5" />}
              {findError && <p className="text-xs text-destructive">{findError}</p>}
              {matches && (
                <p className="text-xs">
                  Found <span className="font-semibold">{matchCount}</span> area{matchCount === 1 ? "" : "s"}, outlined in red.
                </p>
              )}
            </div>
          )}

          <div className="flex items-start space-x-2">
            <Checkbox id="keep-text" checked={keepText} onCheckedChange={(v) => setKeepText(v === true)} className="mt-0.5" />
            <Label htmlFor="keep-text" className="cursor-pointer font-normal leading-snug">
              Keep text (only remove the watermark's colour)
              <span className="block text-xs text-muted-foreground">Untick to wipe the whole box, e.g. for a logo.</span>
            </Label>
          </div>
        </>
      )}

      {needsColors && (
        <div className="space-y-2">
          <Label>Colour tolerance: {Math.round(tolerance * 100)}%</Label>
          <Slider value={[tolerance]} onValueChange={([v]) => setTolerance(v)} min={0} max={1} step={0.05} />
          <p className="text-xs text-muted-foreground">Raise it if bits of watermark remain; lower it if text gets lighter.</p>
        </div>
      )}

      {/* Status */}
      {learning && (
        <p className="flex items-center text-xs text-muted-foreground">
          <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Analysing the watermark…
        </p>
      )}
      {learnError && <p className="text-xs text-destructive">{learnError}</p>}
      {colors && !learning && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className="inline-block h-4 w-4 rounded border border-border"
            style={{ background: `rgb(${colors.mark.map(Math.round).join(",")})` }}
          />
          Watermark colour detected. The page shows a live preview; hold “Hold for original” to compare.
        </p>
      )}

      <Button className="w-full" size="lg" disabled={!ready || learning} onClick={apply}>
        Remove watermark
      </Button>

      <ul className="space-y-1 text-xs text-muted-foreground">
        <li>• Zoom with Ctrl + scroll or pinch; hold Space and drag to pan.</li>
        <li>• Only changed pixels are replaced; the rest stays as real, selectable text.</li>
        <li>• A text watermark may still exist, hidden, in the text layer.</li>
      </ul>
    </div>
  );
};
