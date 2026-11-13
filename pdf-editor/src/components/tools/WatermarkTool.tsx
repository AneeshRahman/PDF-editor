import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Slider } from "../ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import type { WatermarkPosition, WatermarkSettings } from "../../lib/pdf-operations";

interface WatermarkToolProps {
  /** Called on every change so the preview can update live. */
  onWatermarkChange: (settings: WatermarkSettings) => void;
  /** Called when the user wants the watermark written into the PDF. */
  onApply: (settings: WatermarkSettings) => void;
}

const DEFAULTS: WatermarkSettings = { text: "", opacity: 0.3, position: "center" };

export const WatermarkTool = ({ onWatermarkChange, onApply }: WatermarkToolProps) => {
  const [settings, setSettings] = useState<WatermarkSettings>(DEFAULTS);

  const update = (patch: Partial<WatermarkSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    onWatermarkChange(next);
  };

  const reset = () => {
    setSettings(DEFAULTS);
    onWatermarkChange(DEFAULTS);
  };

  return (
    <div className="space-y-6 p-6 bg-card rounded-lg border border-border">
      <div className="space-y-2">
        <Label htmlFor="watermark-text" className="text-sm font-medium">
          Watermark Text
        </Label>
        <Input
          id="watermark-text"
          placeholder="Enter watermark text"
          value={settings.text}
          onChange={(e) => update({ text: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="opacity" className="text-sm font-medium">
          Opacity: {Math.round(settings.opacity * 100)}%
        </Label>
        <Slider
          id="opacity"
          min={10}
          max={100}
          step={5}
          value={[Math.round(settings.opacity * 100)]}
          onValueChange={([value]) => update({ opacity: value / 100 })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="position" className="text-sm font-medium">
          Position
        </Label>
        <Select value={settings.position} onValueChange={(value) => update({ position: value as WatermarkPosition })}>
          <SelectTrigger id="position">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="center">Center</SelectItem>
            <SelectItem value="top-left">Top Left</SelectItem>
            <SelectItem value="top-right">Top Right</SelectItem>
            <SelectItem value="bottom-left">Bottom Left</SelectItem>
            <SelectItem value="bottom-right">Bottom Right</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={reset}>
          Clear
        </Button>
        <Button
          disabled={!settings.text.trim()}
          onClick={() => {
            onApply(settings);
            reset();
          }}
        >
          Apply Watermark
        </Button>
      </div>
    </div>
  );
};
