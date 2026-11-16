import { useMemo, useState } from "react";
import { RectangleHorizontal, RectangleVertical } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { cn } from "../../lib/utils";

type Unit = "mm" | "in" | "pt";
const PT_PER: Record<Unit, number> = { mm: 72 / 25.4, in: 72, pt: 1 };

/** Paper sizes in points (portrait). */
const PRESETS = [
  { name: "A5", w: 420, h: 595 },
  { name: "A4", w: 595, h: 842 },
  { name: "A3", w: 842, h: 1191 },
  { name: "Letter", w: 612, h: 792 },
  { name: "Legal", w: 612, h: 1008 },
  { name: "Tabloid", w: 792, h: 1224 },
];

const fmt = (pt: number, unit: Unit) => {
  const v = pt / PT_PER[unit];
  return unit === "pt" ? Math.round(v).toString() : v.toFixed(unit === "mm" ? 0 : 2);
};

interface ResizeToolProps {
  /** Size of the PDF's first page, in points (for the size reference). */
  current: { width: number; height: number } | null;
  onResize: (size: { width: number; height: number }) => void;
}

/** A small to-scale outline of a page size. */
const PageIcon = ({ w, h, max = 26 }: { w: number; h: number; max?: number }) => {
  const s = max / Math.max(w, h);
  return <span className="inline-block border border-current" style={{ width: w * s, height: h * s }} />;
};

export const ResizeTool = ({ current, onResize }: ResizeToolProps) => {
  const [choice, setChoice] = useState<string>("A4");
  const [landscape, setLandscape] = useState(false);
  const [unit, setUnit] = useState<Unit>("mm");
  const [custom, setCustom] = useState({ w: "210", h: "297" }); // in `unit`

  const target = useMemo(() => {
    let w: number, h: number;
    if (choice === "custom") {
      w = (parseFloat(custom.w) || 0) * PT_PER[unit];
      h = (parseFloat(custom.h) || 0) * PT_PER[unit];
    } else {
      const p = PRESETS.find((x) => x.name === choice)!;
      [w, h] = [p.w, p.h];
    }
    if (landscape !== w > h) [w, h] = [h, w];
    return { width: w, height: h };
  }, [choice, custom, unit, landscape]);

  const valid = target.width >= 36 && target.height >= 36 && target.width <= 14400 && target.height <= 14400;

  const changeUnit = (u: Unit) => {
    // Keep the same physical size when switching units.
    const w = (parseFloat(custom.w) || 0) * PT_PER[unit];
    const h = (parseFloat(custom.h) || 0) * PT_PER[unit];
    setCustom({ w: fmt(w, u), h: fmt(h, u) });
    setUnit(u);
  };

  // Size reference: current page (dashed) and the new size (solid), to the same scale.
  const ref = useMemo(() => {
    const cur = current ?? { width: 595, height: 842 };
    const box = 150;
    const scale = box / Math.max(cur.width, cur.height, target.width, target.height);
    return { cur, scale };
  }, [current, target]);

  return (
    <div className="space-y-6 rounded-lg border border-border bg-card p-5">
      <div className="space-y-2">
        <Label>Page size</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {[...PRESETS.map((p) => p.name), "custom"].map((name) => {
            const p = PRESETS.find((x) => x.name === name);
            const on = choice === name;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                onClick={() => setChoice(name)}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1.5 rounded-md border text-xs transition-colors",
                  on ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"
                )}
              >
                {p ? <PageIcon w={landscape ? p.h : p.w} h={landscape ? p.w : p.h} /> : <span className="font-mono text-base leading-none">W×H</span>}
                {p ? p.name : "Custom"}
              </button>
            );
          })}
        </div>
      </div>

      {choice === "custom" && (
        <div className="space-y-2">
          <div className="flex items-end gap-2">
            <label className="flex-1 space-y-1">
              <span className="label-mono">Width</span>
              <Input aria-label="Custom width" inputMode="decimal" value={custom.w} onChange={(e) => setCustom({ ...custom, w: e.target.value })} className="font-mono" />
            </label>
            <span className="pb-2 text-muted-foreground">×</span>
            <label className="flex-1 space-y-1">
              <span className="label-mono">Height</span>
              <Input aria-label="Custom height" inputMode="decimal" value={custom.h} onChange={(e) => setCustom({ ...custom, h: e.target.value })} className="font-mono" />
            </label>
            <select
              aria-label="Unit"
              value={unit}
              onChange={(e) => changeUnit(e.target.value as Unit)}
              className="h-10 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="mm">mm</option>
              <option value="in">in</option>
              <option value="pt">pt</option>
            </select>
          </div>
          {!valid && <p className="text-xs text-destructive">Enter a size between 0.5 in and 200 in (13–5080 mm).</p>}
        </div>
      )}

      <div className="space-y-2">
        <Label>Orientation</Label>
        <div role="radiogroup" aria-label="Orientation" className="flex rounded-lg bg-muted p-1">
          {[
            [false, "Portrait", RectangleVertical],
            [true, "Landscape", RectangleHorizontal],
          ].map(([value, label, Icon]) => {
            const I = Icon as typeof RectangleVertical;
            return (
              <button
                key={String(value)}
                type="button"
                role="radio"
                aria-checked={landscape === value}
                onClick={() => setLandscape(value as boolean)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition",
                  landscape === value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <I className="h-3.5 w-3.5" /> {label as string}
              </button>
            );
          })}
        </div>
      </div>

      {/* Size reference */}
      <div className="space-y-2">
        <Label>Size reference</Label>
        <div className="flex items-end justify-center gap-6 rounded-md border border-border bg-background px-4 py-5" data-testid="size-reference">
          <figure className="flex flex-col items-center gap-2">
            <div
              className="border border-dashed border-muted-foreground"
              style={{ width: ref.cur.width * ref.scale, height: ref.cur.height * ref.scale }}
            />
            <figcaption className="label-mono text-center">
              Now
              <br />
              {fmt(ref.cur.width, unit)}×{fmt(ref.cur.height, unit)} {unit}
            </figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-2">
            <div
              className="border-2 border-foreground bg-card"
              style={{ width: Math.max(4, target.width * ref.scale), height: Math.max(4, target.height * ref.scale) }}
            />
            <figcaption className="label-mono text-center text-foreground">
              New
              <br />
              {fmt(target.width, unit)}×{fmt(target.height, unit)} {unit}
            </figcaption>
          </figure>
        </div>
        <p className="text-xs text-muted-foreground">Content is scaled to fit and centred; text stays selectable.</p>
      </div>

      <Button onClick={() => onResize(target)} disabled={!valid} className="w-full">
        Apply resize
      </Button>
    </div>
  );
};
