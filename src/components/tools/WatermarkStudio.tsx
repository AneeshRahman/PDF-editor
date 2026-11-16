import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bold, Brush, Download, Grid3x3, ImagePlus, Italic, Stamp, Trash2, Type, Underline } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Slider } from "../ui/slider";
import type { ToolPanelProps } from "./panels";
import { RemoveSection, type RemovalPlan } from "./RemoveWatermarkPanel";
import { baseName, downloadFile } from "../../lib/files";
import { removeWatermark } from "../../lib/pdf-operations";
import { addStamp, DEFAULT_STAMP, GRID_POSITIONS, isStampEmpty, type StampFont, type StampSpec } from "../../lib/stamp";
import { cn } from "../../lib/utils";

type Tab = "remove" | "add";

const COLORS = ["#d32f2f", "#1565c0", "#2e7d32", "#000000", "#757575", "#f57c00"];
const ROTATIONS = [0, 45, 90, 180, 270];
const FONTS: StampFont[] = ["Helvetica", "Times", "Courier"];

/** A small segmented control. */
function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: React.ReactNode; title?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-muted p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition",
            value === o.value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const ToggleIcon = ({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: React.ReactNode }) => (
  <button
    type="button"
    aria-pressed={on}
    aria-label={label}
    title={label}
    onClick={onClick}
    className={cn(
      "flex h-9 w-9 items-center justify-center rounded-md border transition",
      on ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
    )}
  >
    {children}
  </button>
);

/* ------------------------------------------------------------------ */
/* Add                                                                  */
/* ------------------------------------------------------------------ */

const AddSection = ({ spec, set, pageCount }: { spec: StampSpec; set: (p: Partial<StampSpec>) => void; pageCount: number }) => {
  const [allPages, setAllPages] = useState(true);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(pageCount);

  useEffect(() => {
    if (allPages) set({ pages: null });
    else {
      const a = Math.max(1, Math.min(from, to));
      const b = Math.min(pageCount, Math.max(from, to));
      set({ pages: Array.from({ length: b - a + 1 }, (_, i) => a - 1 + i) });
    }
  }, [allPages, from, to, pageCount, set]);

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    const type = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : null;
    if (!type) {
      toast.error("Please choose a PNG or JPG image");
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const bmp = await createImageBitmap(file);
    if (spec.image) URL.revokeObjectURL(spec.image.url);
    set({ image: { url: URL.createObjectURL(file), bytes, type, width: bmp.width, height: bmp.height } });
    bmp.close();
  };

  const onGrid = (x: number, y: number) => !spec.mosaic && Math.abs(spec.position.x - x) < 0.01 && Math.abs(spec.position.y - y) < 0.01;

  return (
    <div className="space-y-5">
      <Segmented
        label="Watermark type"
        value={spec.kind}
        onChange={(kind) => set({ kind })}
        options={[
          { value: "text", label: <><Type className="h-3.5 w-3.5" /> Text</> },
          { value: "image", label: <><ImagePlus className="h-3.5 w-3.5" /> Image</> },
        ]}
      />

      {spec.kind === "text" ? (
        <div className="space-y-3">
          <Input
            aria-label="Watermark text"
            placeholder="Type your watermark text"
            value={spec.text}
            onChange={(e) => set({ text: e.target.value })}
          />
          <div className="flex items-center gap-1.5">
            <select
              aria-label="Font"
              value={spec.font}
              onChange={(e) => set({ font: e.target.value as StampFont })}
              className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
            >
              {FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <ToggleIcon on={spec.bold} onClick={() => set({ bold: !spec.bold })} label="Bold">
              <Bold className="h-4 w-4" />
            </ToggleIcon>
            <ToggleIcon on={spec.italic} onClick={() => set({ italic: !spec.italic })} label="Italic">
              <Italic className="h-4 w-4" />
            </ToggleIcon>
            <ToggleIcon on={spec.underline} onClick={() => set({ underline: !spec.underline })} label="Underline">
              <Underline className="h-4 w-4" />
            </ToggleIcon>
          </div>
          <div className="space-y-2">
            <Label>Size: {spec.size}pt</Label>
            <Slider value={[spec.size]} onValueChange={([v]) => set({ size: v })} min={8} max={160} step={1} />
          </div>
          <div className="flex items-center gap-2">
            <Label className="mr-1">Colour</Label>
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${c}`}
                onClick={() => set({ color: c })}
                className={cn("h-6 w-6 rounded-full border-2", spec.color === c ? "border-foreground" : "border-transparent")}
                style={{ background: c }}
              />
            ))}
            <input
              type="color"
              aria-label="Custom colour"
              value={spec.color}
              onChange={(e) => set({ color: e.target.value })}
              className="h-7 w-7 cursor-pointer rounded border border-border bg-transparent p-0"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {spec.image ? (
            <div className="flex items-center gap-3 rounded-md border border-border p-2">
              <img src={spec.image.url} alt="" className="h-12 w-12 rounded object-contain" />
              <span className="flex-1 text-xs text-muted-foreground">
                {spec.image.width} × {spec.image.height}px
              </span>
              <Button variant="ghost" size="icon" title="Remove image" onClick={() => set({ image: null })}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <label className="flex cursor-pointer flex-col items-center gap-1 rounded-md border-2 border-dashed border-border p-4 text-sm text-muted-foreground hover:border-primary hover:text-primary">
              <ImagePlus className="h-6 w-6" />
              Choose a PNG or JPG
              <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => pickImage(e.target.files?.[0])} />
            </label>
          )}
          <div className="space-y-2">
            <Label>Size: {Math.round(spec.imageScale * 100)}% of page width</Label>
            <Slider value={[spec.imageScale]} onValueChange={([v]) => set({ imageScale: v })} min={0.05} max={1} step={0.01} />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Position</Label>
        <div className="flex items-start gap-4">
          <div className="grid grid-cols-3 gap-1 rounded-md border border-border p-1" role="group" aria-label="Position">
            {GRID_POSITIONS.map((y) =>
              GRID_POSITIONS.map((x) => (
                <button
                  key={`${x}-${y}`}
                  type="button"
                  aria-label={`Position ${Math.round(x * 100)}% ${Math.round(y * 100)}%`}
                  aria-pressed={onGrid(x, y)}
                  onClick={() => set({ position: { x, y }, mosaic: false })}
                  className={cn("h-6 w-6 rounded-sm transition", onGrid(x, y) ? "bg-primary" : "bg-muted hover:bg-primary/30")}
                />
              ))
            )}
          </div>
          <div className="flex-1 space-y-2">
            <button
              type="button"
              aria-pressed={spec.mosaic}
              onClick={() => set({ mosaic: !spec.mosaic })}
              className={cn(
                "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm transition",
                spec.mosaic ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
              )}
            >
              <Grid3x3 className="h-4 w-4" /> Mosaic (tile)
            </button>
            <p className="text-xs text-muted-foreground">Or drag it anywhere on the page.</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Transparency: {Math.round((1 - spec.opacity) * 100)}%</Label>
        <Slider value={[1 - spec.opacity]} onValueChange={([v]) => set({ opacity: 1 - v })} min={0} max={0.95} step={0.05} />
      </div>

      <div className="space-y-2">
        <Label>Rotation: {spec.rotation}°</Label>
        <Segmented
          label="Rotation"
          value={ROTATIONS.includes(spec.rotation) ? spec.rotation : -1}
          onChange={(rotation) => rotation >= 0 && set({ rotation })}
          options={ROTATIONS.map((r) => ({ value: r, label: r === 0 ? "None" : `${r}°` }))}
        />
        <Slider value={[spec.rotation]} onValueChange={([v]) => set({ rotation: v })} min={-180} max={360} step={1} />
      </div>

      <div className="space-y-2">
        <Label>Layer</Label>
        <Segmented
          label="Layer"
          value={spec.below ? "below" : "over"}
          onChange={(v) => set({ below: v === "below" })}
          options={[
            { value: "over", label: "Over content" },
            { value: "below", label: "Below content" },
          ]}
        />
      </div>

      <div className="space-y-2">
        <Label>Pages</Label>
        <Segmented
          label="Pages"
          value={allPages ? "all" : "range"}
          onChange={(v) => setAllPages(v === "all")}
          options={[
            { value: "all", label: `All ${pageCount}` },
            { value: "range", label: "Range" },
          ]}
        />
        {!allPages && (
          <div className="flex items-center gap-2 text-sm">
            From
            <Input aria-label="From page" type="number" min={1} max={pageCount} value={from} onChange={(e) => setFrom(Number(e.target.value) || 1)} className="h-8 w-20" />
            to
            <Input aria-label="To page" type="number" min={1} max={pageCount} value={to} onChange={(e) => setTo(Number(e.target.value) || 1)} className="h-8 w-20" />
          </div>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* The combined tool                                                    */
/* ------------------------------------------------------------------ */

export const WatermarkStudio = ({ files, runTask, strokes = [], setStrokes, setPreview }: ToolPanelProps) => {
  const file = files[0];
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get("tab") === "add" ? "add" : "remove");
  const [plan, setPlan] = useState<RemovalPlan | null>(null);
  const [brushSize, setBrushSize] = useState(28);
  const [spec, setSpec] = useState<StampSpec>({ ...DEFAULT_STAMP, text: "" });
  const set = useCallback((p: Partial<StampSpec>) => setSpec((s) => ({ ...s, ...p })), []);

  const adding = !isStampEmpty(spec);
  const removing = !!plan;
  const stamp = useMemo(() => (adding ? spec : null), [adding, spec]);

  // Canvas: brush on the Remove tab, drag-to-place on the Add tab; Before/After always offered.
  useEffect(() => {
    setPreview?.({
      tool: tab === "remove" ? "brush" : "stamp",
      brushSize,
      stamp,
      compare: true,
      onStampMove: (position) => setSpec((s) => ({ ...s, position, mosaic: false })),
    });
  }, [setPreview, tab, brushSize, stamp]);
  useEffect(() => () => setPreview?.({ tool: "none", stamp: null, compare: false, onStampMove: undefined }), [setPreview]);

  const download = async () => {
    const bytes = await runTask?.(async (onProgress) => {
      let out = file.bytes;
      if (plan) out = await removeWatermark(out, plan.regions, plan.colors, { keepText: true, tolerance: plan.tolerance }, onProgress);
      if (adding) out = await addStamp(out, spec);
      return out;
    });
    if (bytes) {
      const suffix = adding ? "watermarked" : "cleaned";
      downloadFile({ name: `${baseName(file.name)}_${suffix}.pdf`, bytes });
      toast.success("Downloaded", { description: removing && adding ? "Old watermark removed, new one added." : undefined });
    }
  };

  return (
    <div className="space-y-5 rounded-lg border border-border bg-card p-5">
      <Segmented
        label="Mode"
        value={tab}
        onChange={setTab}
        options={[
          { value: "remove", label: <><Brush className="h-3.5 w-3.5" /> Remove</>, title: "Remove a watermark" },
          { value: "add", label: <><Stamp className="h-3.5 w-3.5" /> Add</>, title: "Add a watermark" },
        ]}
      />

      {/* Both stay mounted so switching tabs keeps your work. */}
      <div hidden={tab !== "remove"}>
        <RemoveSection
          file={file}
          active={tab === "remove"}
          strokes={strokes}
          setStrokes={setStrokes}
          setPreview={setPreview}
          onBrushSize={setBrushSize}
          onPlan={setPlan}
        />
      </div>
      <div hidden={tab !== "add"}>
        <AddSection spec={spec} set={set} pageCount={file.pageCount} />
      </div>

      {/* Pinned to the bottom of the scrolling side panel so Download is always in reach. */}
      <div className="sticky bottom-0 -mx-5 -mb-5 space-y-2 rounded-b-lg border-t border-border bg-card px-5 pb-5 pt-4">
        <p className="text-xs text-muted-foreground" data-testid="download-summary">
          {removing && adding
            ? "Download removes the old watermark and adds the new one."
            : removing
              ? "Download saves the PDF with the watermark removed."
              : adding
                ? "Download saves the PDF with your watermark."
                : "Brush over a watermark to remove it, or add your own."}
        </p>
        <Button className="w-full" size="lg" disabled={!removing && !adding} onClick={download}>
          <Download className="mr-2 h-4 w-4" />
          Download PDF
        </Button>
        <p className="text-xs text-muted-foreground">Tip: “Before / After” in the toolbar compares with the original.</p>
      </div>
    </div>
  );
};

