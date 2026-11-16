import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Contrast, RotateCcw } from "lucide-react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Slider } from "../ui/slider";
import type { ToolPanelProps } from "./panels";
import type { PreviewEffect } from "../PDFPreview";
import { baseName } from "../../lib/files";
import { adjustColorsPdf } from "../../lib/pdf-operations";
import {
  DEFAULT_COLORS,
  PRESETS,
  adjustPixels,
  isUnchanged,
  sameSettings,
  type ColorMode,
  type ColorSettings,
} from "../../lib/color-adjust";
import { cn } from "../../lib/utils";

const MODES: { value: ColorMode; label: string }[] = [
  { value: "color", label: "Colour" },
  { value: "grayscale", label: "Grayscale" },
  { value: "bw", label: "Black & white" },
];

const SliderRow = ({
  label,
  value,
  onChange,
  min = -100,
  max = 100,
  format = (v: number) => (v > 0 ? `+${v}` : `${v}`),
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  format?: (v: number) => string;
}) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <Label>{label}</Label>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">{format(value)}</span>
    </div>
    <Slider aria-label={label} value={[value]} onValueChange={([v]) => onChange(v)} min={min} max={max} step={1} />
  </div>
);

/** "Adjust Colors": presets, colour / grayscale / black & white, levels and invert, all live. */
export const ColorsPanel = ({ files, process, setPreview }: ToolPanelProps) => {
  const file = files[0];
  const [params] = useSearchParams();
  const [s, setS] = useState<ColorSettings>(
    () => PRESETS.find((p) => p.id === params.get("preset"))?.settings ?? DEFAULT_COLORS
  );
  const set = (patch: Partial<ColorSettings>) => setS((prev) => ({ ...prev, ...patch }));

  // Live preview: the exact pixel function the export uses, applied to the rendered pages.
  const effect = useMemo((): PreviewEffect | null => {
    if (isUnchanged(s)) return null;
    return {
      key: JSON.stringify(s),
      apply: (_page, img) => {
        const out = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
        adjustPixels(out.data, s);
        return { x: 0, y: 0, image: out };
      },
    };
  }, [s]);
  useEffect(() => setPreview?.({ effect }), [effect, setPreview]);
  useEffect(() => () => setPreview?.({ effect: null }), [setPreview]);

  return (
    <div className="space-y-6 rounded-lg border border-border bg-card p-5">
      <div className="space-y-2">
        <Label>Presets</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map((p) => {
            const on = sameSettings(s, p.settings);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() => setS(p.settings)}
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  on ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Mode</Label>
        <div role="radiogroup" aria-label="Colour mode" className="flex rounded-lg bg-muted p-1">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={s.mode === m.value}
              onClick={() => set({ mode: m.value })}
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition",
                s.mode === m.value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <SliderRow label="Brightness" value={s.brightness} onChange={(brightness) => set({ brightness })} />
      <SliderRow label="Contrast" value={s.contrast} onChange={(contrast) => set({ contrast })} />
      {s.mode === "color" && (
        <SliderRow label="Saturation" value={s.saturation} onChange={(saturation) => set({ saturation })} />
      )}
      {s.mode === "bw" && (
        <SliderRow
          label="Black & white cut-off"
          value={s.threshold}
          onChange={(threshold) => set({ threshold })}
          min={20}
          max={235}
          format={(v) => `${Math.round((v / 255) * 100)}%`}
        />
      )}

      <button
        type="button"
        aria-pressed={s.invert}
        onClick={() => set({ invert: !s.invert })}
        className={cn(
          "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors",
          s.invert ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"
        )}
      >
        <Contrast className="h-4 w-4" />
        Invert colours
        <span className="ml-auto font-mono text-[11px] uppercase tracking-wider opacity-70">{s.invert ? "On" : "Off"}</span>
      </button>

      <div className="space-y-2 border-t border-border pt-4">
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setS(DEFAULT_COLORS)} disabled={isUnchanged(s)} title="Back to original">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            className="flex-1"
            disabled={isUnchanged(s)}
            onClick={() =>
              process(async (onProgress) => [
                { name: `${baseName(file.name)}_colors.pdf`, bytes: await adjustColorsPdf(file.bytes, s, onProgress) },
              ])
            }
          >
            Apply colours
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          The page shows the result live. Pages are saved as high-resolution images, so text won't be selectable afterwards.
        </p>
      </div>
    </div>
  );
};
