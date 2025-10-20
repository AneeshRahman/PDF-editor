import { useState } from "react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Slider } from "../ui/slider";

interface CompressToolProps {
  onCompress: (quality: number) => void;
}

export const CompressTool = ({ onCompress }: CompressToolProps) => {
  const [quality, setQuality] = useState(75);

  const handleCompress = () => {
    onCompress(quality / 100);
  };

  return (
    <div className="space-y-6 p-6 bg-card rounded-lg border border-border">
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          Compression Quality: {quality}%
        </Label>
        <Slider
          min={10}
          max={100}
          step={5}
          value={[quality]}
          onValueChange={(values) => setQuality(values[0])}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground mt-2">
          Lower quality = smaller file size
        </p>
      </div>

      <Button onClick={handleCompress} className="w-full">
        Compress PDF
      </Button>
    </div>
  );
};
