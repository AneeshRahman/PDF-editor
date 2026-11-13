import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MousePointerSquareDashed, ScanSearch, SquareDashed } from "lucide-react";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Progress } from "../ui/progress";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Slider } from "../ui/slider";
import type { ToolPanelProps } from "./panels";
import { baseName } from "../../lib/files";
import { cn } from "../../lib/utils";
import {
  countRects,
  eraseAreas,
  findSimilarAreas,
  parsePageRanges,
  type PageRects,
} from "../../lib/pdf-operations";

type Mode = "erase" | "similar";
type Scope = "all" | "this" | "custom";

const MODES = [
  { value: "erase" as const, label: "Erase this area", hint: "Same spot on every page", icon: SquareDashed },
  { value: "similar" as const, label: "Find similar", hint: "Finds copies anywhere", icon: ScanSearch },
];

export const RemoveWatermarkPanel = ({ files, process, selection, setSelection, setHighlights }: ToolPanelProps) => {
  const file = files[0];
  const [mode, setMode] = useState<Mode>("erase");
  const [scope, setScope] = useState<Scope>("all");
  const [customPages, setCustomPages] = useState(`1-${file.pageCount}`);
  const [keepDark, setKeepDark] = useState(true);
  const [threshold, setThreshold] = useState(0.6);
  const [matches, setMatches] = useState<PageRects | null>(null);
  const [finding, setFinding] = useState(false);
  const [findProgress, setFindProgress] = useState<number | null>(null);
  const [findError, setFindError] = useState<string | null>(null);
  const runId = useRef(0);

  // Which pages to act on.
  const target = useMemo((): { pages: number[] } | { error: string } => {
    if (scope === "this") return { pages: selection ? [selection.page] : [] };
    if (scope === "all") return { pages: Array.from({ length: file.pageCount }, (_, i) => i) };
    try {
      const set = new Set<number>();
      for (const r of parsePageRanges(customPages, file.pageCount)) {
        for (let p = r.from; p <= r.to; p++) set.add(p - 1);
      }
      return { pages: [...set].sort((a, b) => a - b) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Invalid pages" };
    }
  }, [scope, customPages, file.pageCount, selection]);
  const pages = "pages" in target ? target.pages : [];
  const pagesKey = pages.join(",");

  // The areas that will be erased.
  const areas = useMemo((): PageRects | null => {
    if (!selection) return null;
    if (mode === "similar") return matches;
    return Object.fromEntries(pages.map((p) => [p, [selection.rect]]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pagesKey stands in for pages
  }, [mode, matches, selection, pagesKey]);
  const areaCount = areas ? countRects(areas) : 0;

  // Any change invalidates earlier matches (and cancels a running search).
  useEffect(() => {
    runId.current++;
    setMatches(null);
    setFindError(null);
    setFinding(false);
    setFindProgress(null);
  }, [selection, threshold, pagesKey, mode]);

  // Show what will be erased on the preview.
  useEffect(() => {
    setHighlights?.(areas);
  }, [areas, setHighlights]);
  useEffect(() => () => setHighlights?.(null), [setHighlights]);

  const findMatches = async () => {
    if (!selection) return;
    const id = ++runId.current;
    setFinding(true);
    setFindError(null);
    setFindProgress(0);
    try {
      const found = await findSimilarAreas(file.bytes, selection, threshold, pages, (n, total) => {
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

  const remove = () => {
    if (!areas || !areaCount) return;
    process(async (onProgress) => [
      {
        name: `${baseName(file.name)}_cleaned.pdf`,
        bytes: await eraseAreas(file.bytes, areas, { keepDark }, onProgress),
      },
    ]);
  };

  const matchedPages = matches ? Object.keys(matches).length : 0;

  return (
    <div className="space-y-6 p-6 bg-card rounded-lg border border-border">
      {/* Step 1: select */}
      {selection ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span>
            Area selected on <span className="font-medium">page {selection.page + 1}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={() => setSelection?.(null)}>
            Clear
          </Button>
        </div>
      ) : (
        <div className="flex gap-3 rounded-md border border-dashed border-primary/50 bg-primary/5 p-3 text-sm">
          <MousePointerSquareDashed className="h-5 w-5 shrink-0 text-primary" />
          <p>
            <span className="font-medium">Drag a box around the watermark</span> on the page preview. Draw it snugly
            around one copy.
          </p>
        </div>
      )}

      {/* Step 2: mode */}
      <div className="grid grid-cols-2 gap-2">
        {MODES.map(({ value, label, hint, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            aria-pressed={mode === value}
            className={cn(
              "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition",
              mode === value ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
            )}
          >
            <Icon className={cn("h-5 w-5", mode === value ? "text-primary" : "text-muted-foreground")} />
            <span className="text-sm font-medium">{label}</span>
            <span className="text-xs text-muted-foreground">{hint}</span>
          </button>
        ))}
      </div>

      {/* Step 3: pages */}
      <div className="space-y-2">
        <Label>Pages</Label>
        <RadioGroup value={scope} onValueChange={(v) => setScope(v as Scope)} className="gap-2">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="all" id="scope-all" />
            <Label htmlFor="scope-all" className="font-normal cursor-pointer">
              All {file.pageCount} pages
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="this" id="scope-this" />
            <Label htmlFor="scope-this" className="font-normal cursor-pointer">
              Only the selected page{selection ? ` (${selection.page + 1})` : ""}
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="custom" id="scope-custom" />
            <Label htmlFor="scope-custom" className="font-normal cursor-pointer">
              Custom
            </Label>
          </div>
        </RadioGroup>
        {scope === "custom" && (
          <Input
            aria-label="Custom pages"
            value={customPages}
            onChange={(e) => setCustomPages(e.target.value)}
            placeholder="e.g. 1-3, 5"
          />
        )}
        {"error" in target && <p className="text-xs text-destructive">{target.error}</p>}
      </div>

      {mode === "similar" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Match sensitivity: {Math.round(threshold * 100)}%</Label>
            <Slider
              value={[threshold]}
              onValueChange={([v]) => setThreshold(v)}
              min={0.3}
              max={0.95}
              step={0.05}
            />
            <p className="text-xs text-muted-foreground">Higher is stricter: fewer, more exact matches.</p>
          </div>
          <Button
            variant="outline"
            className="w-full"
            disabled={!selection || finding || !pages.length}
            onClick={findMatches}
          >
            {finding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-2 h-4 w-4" />}
            {finding ? "Searching…" : matches ? "Search again" : "Find matches"}
          </Button>
          {findProgress !== null && <Progress value={findProgress} className="h-1.5" />}
          {findError && <p className="text-xs text-destructive">{findError}</p>}
          {matches && (
            <p className="text-xs">
              Found <span className="font-semibold">{countRects(matches)}</span> area
              {countRects(matches) === 1 ? "" : "s"} on {matchedPages} page{matchedPages === 1 ? "" : "s"}, outlined in
              red. Not right? Adjust the sensitivity or redraw the box.
            </p>
          )}
        </div>
      )}

      <div className="flex items-start space-x-2">
        <Checkbox id="keep-dark" checked={keepDark} onCheckedChange={(v) => setKeepDark(v === true)} className="mt-0.5" />
        <Label htmlFor="keep-dark" className="font-normal cursor-pointer leading-snug">
          Keep dark text inside the area
          <span className="block text-xs text-muted-foreground">
            Turn off to clear the area completely (for dark watermarks or logos).
          </span>
        </Label>
      </div>

      <Button className="w-full" size="lg" disabled={!areaCount} onClick={remove}>
        {areaCount ? `Erase ${areaCount} area${areaCount === 1 ? "" : "s"}` : "Remove watermark"}
      </Button>

      <ul className="space-y-1 text-xs text-muted-foreground">
        <li>• The rest of each page stays as real, selectable text.</li>
        <li>• Erased areas are covered with a clean patch. A text watermark may still exist, hidden, in the text layer.</li>
        <li>• Doesn't detect rotated copies of a watermark.</li>
      </ul>
    </div>
  );
};
