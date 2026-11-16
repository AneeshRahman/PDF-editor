import { useEffect, useState } from "react";
import { Link2, Unlink2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { cn } from "../../lib/utils";

type Margins = { top: number; right: number; bottom: number; left: number };
type Side = keyof Margins;

interface CropToolProps {
  onCrop: (margins: Margins) => void;
  /** Called on every edit, for a live preview. */
  onChange?: (margins: Margins) => void;
}

const SideInput = ({ side, value, onChange }: { side: Side; value: number; onChange: (v: number) => void }) => (
  <label className="flex flex-col items-center gap-1">
    <span className="label-mono">{side}</span>
    <Input
      aria-label={`${side} margin (points)`}
      type="number"
      min={0}
      value={value}
      onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      className="h-9 w-20 text-center font-mono"
    />
  </label>
);

export const CropTool = ({ onCrop, onChange }: CropToolProps) => {
  const [margins, setMarginsState] = useState<Margins>({ top: 20, right: 20, bottom: 20, left: 20 });
  // Linked: one value for all four sides (on by default).
  const [linked, setLinked] = useState(true);

  const setMargins = (m: Margins) => {
    setMarginsState(m);
    onChange?.(m);
  };
  const setSide = (side: Side, v: number) =>
    setMargins(linked ? { top: v, right: v, bottom: v, left: v } : { ...margins, [side]: v });

  // Show the starting margins straight away.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onChange?.(margins), []);

  const toggleLink = () => {
    const next = !linked;
    setLinked(next);
    // Linking snaps every side to the top value.
    if (next) setMargins({ top: margins.top, right: margins.top, bottom: margins.top, left: margins.top });
  };

  return (
    <div className="space-y-6 rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Margins to trim</p>
          <p className="text-xs text-muted-foreground">In points (72 pt = 1 inch). Shaded on the page.</p>
        </div>
        <button
          type="button"
          onClick={toggleLink}
          aria-pressed={linked}
          title={linked ? "Linked: same value on all sides" : "Unlinked: set each side"}
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
            linked ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"
          )}
        >
          {linked ? <Link2 className="h-4 w-4" /> : <Unlink2 className="h-4 w-4" />}
          {linked ? "Linked" : "Unlinked"}
        </button>
      </div>

      {/* The four sides, laid out like the page. */}
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <div />
        <div className="flex justify-center">
          <SideInput side="top" value={margins.top} onChange={(v) => setSide("top", v)} />
        </div>
        <div />
        <SideInput side="left" value={margins.left} onChange={(v) => setSide("left", v)} />
        <div className="relative mx-auto aspect-[3/4] w-16 border border-border bg-background">
          <div
            className="absolute border border-dashed border-foreground/60"
            style={{
              top: `${Math.min(40, margins.top / 8)}%`,
              bottom: `${Math.min(40, margins.bottom / 8)}%`,
              left: `${Math.min(40, margins.left / 6)}%`,
              right: `${Math.min(40, margins.right / 6)}%`,
            }}
          />
        </div>
        <SideInput side="right" value={margins.right} onChange={(v) => setSide("right", v)} />
        <div />
        <div className="flex justify-center">
          <SideInput side="bottom" value={margins.bottom} onChange={(v) => setSide("bottom", v)} />
        </div>
        <div />
      </div>

      <Button onClick={() => onCrop(margins)} className="w-full">
        Apply crop
      </Button>
    </div>
  );
};
