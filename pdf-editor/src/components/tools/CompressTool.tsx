import { useState } from "react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Slider } from "../ui/slider";

interface CompressToolProps {
  onCompress: (quality: number) => void;
}

export const CompressTool = ({ onCompress }: CompressToolProps) => {
  const [quality, setQuality] = useState(75);

  return (
    <div className="space-y-6 p-6 bg-card rounded-lg border border-border">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Compression Quality: {quality}%</Label>
        <Slider
          min={10}
          max={100}
          step={5}
          value={[quality]}
          onValueChange={(values) => setQuality(values[0])}
        />
        <p className="text-xs text-muted-foreground mt-2">Lower quality = smaller file size</p>
        <p className="text-xs text-muted-foreground">
          Pages are converted to images, so text will no longer be selectable. Best for scanned
          or image-heavy PDFs.
        </p>
      </div>

      <Button onClick={() => onCompress(quality / 100)} className="w-full">
        Compress PDF
      </Button>
    </div>
  );
};
