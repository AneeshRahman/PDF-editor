import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Slider } from "../ui/slider";
import type { ToolPanelProps } from "./panels";
import { baseName, formatSize } from "../../lib/files";
import { compressAtLevel, estimateSizes, fitToSize, interpolateEstimate } from "../../lib/pdf-operations";
import { cn } from "../../lib/utils";

const LEVELS = [0, 0.2, 0.4, 0.6, 0.8, 1];

/** Estimated sizes across compression levels, computed once per file in the background. */
function useEstimates(bytes: Uint8Array) {
  const [points, setPoints] = useState<{ level: number; bytes: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setPoints(null);
    estimateSizes(bytes, LEVELS)
      .then((p) => live && setPoints(p))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Could not estimate"));
    return () => {
      live = false;
    };
  }, [bytes]);
  return { points, error };
}

/** Original vs estimated size, as a bar. */
const SizeBar = ({ original, estimate }: { original: number; estimate: number | null }) => {
  const pct = estimate === null ? null : Math.round(((estimate - original) / original) * 100);
  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-4" data-testid="size-estimate">
      <div className="flex items-baseline justify-between">
        <span className="label-mono">Estimated size</span>
        {pct !== null && (
          <span className={cn("font-mono text-xs", pct < 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>
            {pct > 0 ? "+" : ""}
            {pct}%
          </span>
        )}
      </div>
      <p className="font-mono text-2xl font-medium tabular-nums">
        {estimate === null ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : `≈ ${formatSize(estimate)}`}
      </p>
      <div className="space-y-1.5">
        <div className="h-1.5 w-full rounded-full bg-muted" title={`Original ${formatSize(original)}`}>
          <div className="h-full rounded-full bg-muted-foreground/40" style={{ width: "100%" }} />
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-foreground transition-all"
            style={{ width: `${estimate === null ? 0 : Math.min(100, (estimate / original) * 100)}%` }}
          />
        </div>
        <p className="flex justify-between text-xs text-muted-foreground">
          <span>Original {formatSize(original)}</span>
          <span>Estimate from a sample of pages</span>
        </p>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Compress                                                             */
/* ------------------------------------------------------------------ */

const PRESETS = [
  { label: "Smallest", hint: "Lowest quality", level: 0.15 },
  { label: "Recommended", hint: "Good balance", level: 0.5 },
  { label: "Best quality", hint: "Light compression", level: 0.85 },
];

export const CompressPanel = ({ files, process }: ToolPanelProps) => {
  const file = files[0];
  const original = file.bytes.byteLength;
  const [level, setLevel] = useState(0.5);
  const { points, error } = useEstimates(file.bytes);
  const estimate = points ? interpolateEstimate(points, level) : null;
  const range = useMemo(
    () => (points ? { min: Math.min(...points.map((p) => p.bytes)), max: Math.max(...points.map((p) => p.bytes)) } : null),
    [points]
  );
  const helps = range ? range.min < original : true;

  return (
    <div className="space-y-6 rounded-lg border border-border bg-card p-5">
      <div className="space-y-2">
        <Label>Compression</Label>
        <div className="divide-y divide-border rounded-md border border-border">
          {PRESETS.map((p) => {
            const on = Math.abs(level - p.level) < 0.001;
            const est = points ? interpolateEstimate(points, p.level) : null;
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={on}
                onClick={() => setLevel(p.level)}
                className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors", on ? "bg-foreground text-background" : "hover:bg-muted")}
              >
                <span className="flex-1">
                  <span className="block text-sm font-medium">{p.label}</span>
                  <span className={cn("block text-xs", on ? "opacity-70" : "text-muted-foreground")}>{p.hint}</span>
                </span>
                <span className="font-mono text-sm tabular-nums">{est === null ? "…" : `≈ ${formatSize(est)}`}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Fine-tune</Label>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{Math.round(level * 100)}%</span>
        </div>
        <Slider aria-label="Compression quality" value={[level * 100]} onValueChange={([v]) => setLevel(v / 100)} min={0} max={100} step={1} />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Smaller file</span>
          <span>Better quality</span>
        </div>
        {range && (
          <p className="text-xs text-muted-foreground" data-testid="size-range">
            Possible range: <span className="font-mono text-foreground">{formatSize(range.min)}</span> to{" "}
            <span className="font-mono text-foreground">{formatSize(range.max)}</span>
          </p>
        )}
      </div>

      <SizeBar original={original} estimate={estimate} />
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!helps && (
        <p className="text-xs text-muted-foreground">
          This PDF is already compact (likely mostly text), so compressing won't make it smaller.
        </p>
      )}

      <div className="space-y-2">
        <Button
          className="w-full"
          size="lg"
          disabled={!helps}
          onClick={() =>
            process(async (onProgress) => {
              const bytes = await compressAtLevel(file.bytes, level, onProgress);
              if (bytes.byteLength >= original) {
                throw new Error(`It would grow to ${formatSize(bytes.byteLength)}, so nothing was changed. Try a lower setting.`);
              }
              return [{ name: `${baseName(file.name)}_compressed.pdf`, bytes }];
            })
          }
        >
          Compress PDF
        </Button>
        <p className="text-xs text-muted-foreground">Pages are saved as images, so text won't be selectable afterwards.</p>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* PDF Size Changer                                                     */
/* ------------------------------------------------------------------ */

type Unit = "KB" | "MB";
const QUICK = [
  [100, "KB"],
  [200, "KB"],
  [500, "KB"],
  [1, "MB"],
  [2, "MB"],
  [5, "MB"],
] as const;

export const SizePanel = ({ files, process }: ToolPanelProps) => {
  const file = files[0];
  const original = file.bytes.byteLength;
  const [value, setValue] = useState(() => {
    const mb = original / 1024 / 1024;
    return mb >= 2 ? String(Math.max(1, Math.floor(mb / 2))) : String(Math.max(50, Math.round(original / 1024 / 2)));
  });
  const [unit, setUnit] = useState<Unit>(original / 1024 / 1024 >= 2 ? "MB" : "KB");
  const [pad, setPad] = useState(false);
  const { points } = useEstimates(file.bytes);

  const target = Math.round((parseFloat(value) || 0) * (unit === "MB" ? 1024 * 1024 : 1024));
  const smallest = points ? Math.min(...points.map((p) => p.bytes)) : null;
  const status =
    target <= 0
      ? { tone: "bad", text: "Enter a size." }
      : target >= original
        ? pad
          ? { tone: "ok", text: `Already smaller. It will be padded up to ${formatSize(target)}.` }
          : { tone: "ok", text: "Already under this size; it will be kept as it is." }
        : smallest === null
          ? { tone: "wait", text: "Checking what's possible…" }
          : target < smallest * 0.9
            ? { tone: "bad", text: `Probably too small: the smallest estimate is about ${formatSize(smallest)}.` }
            : { tone: "ok", text: `Reachable. It will use the best quality that fits.` };

  return (
    <div className="space-y-6 rounded-lg border border-border bg-card p-5">
      <div className="flex items-baseline justify-between rounded-md border border-border bg-background px-4 py-3">
        <span className="label-mono">Current size</span>
        <span className="font-mono text-lg tabular-nums">{formatSize(original)}</span>
      </div>

      <div className="space-y-2">
        <Label htmlFor="target-size">Target size</Label>
        <div className="flex gap-2">
          <Input
            id="target-size"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="font-mono text-lg"
          />
          <div role="radiogroup" aria-label="Unit" className="flex rounded-md bg-muted p-1">
            {(["KB", "MB"] as Unit[]).map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={unit === u}
                onClick={() => setUnit(u)}
                className={cn("rounded px-3 text-xs font-medium", unit === u ? "bg-background shadow-sm" : "text-muted-foreground")}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map(([v, u]) => (
            <button
              key={`${v}${u}`}
              type="button"
              onClick={() => {
                setValue(String(v));
                setUnit(u);
              }}
              className="rounded-full border border-border px-2.5 py-1 font-mono text-xs hover:bg-muted"
            >
              {v} {u}
            </button>
          ))}
        </div>
      </div>

      <p
        data-testid="target-status"
        className={cn(
          "rounded-md px-3 py-2 text-xs",
          status.tone === "bad" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
        )}
      >
        {status.text}
      </p>
      {smallest !== null && (
        <p className="text-xs text-muted-foreground">
          Possible range: <span className="font-mono text-foreground">≈ {formatSize(smallest)}</span> up to{" "}
          <span className="font-mono text-foreground">{formatSize(original)}</span> (or larger with padding).
        </p>
      )}

      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={pad} onCheckedChange={(v) => setPad(v === true)} className="mt-0.5" />
        <span>
          Pad smaller files up to the target
          <span className="block text-xs text-muted-foreground">For upload forms that need a minimum size. Content is unchanged.</span>
        </span>
      </label>

      <div className="space-y-2">
        <Button
          className="w-full"
          size="lg"
          disabled={target <= 0}
          onClick={() =>
            process(async (onProgress) => {
              const r = await fitToSize(file.bytes, target, { pad }, onProgress);
              const label = `${value}${unit.toLowerCase()}`.replace(/\s+/g, "");
              return [{ name: `${baseName(file.name)}_${label}.pdf`, bytes: r.bytes }];
            })
          }
        >
          Change size to {value || "?"} {unit}
        </Button>
        <p className="text-xs text-muted-foreground">
          Tries a lossless rewrite first. If that isn't enough, pages are saved as images at the best quality that fits.
        </p>
      </div>
    </div>
  );
};
