import { useState } from "react";
import { Card } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { Slider } from "../../components/ui/slider";
import { Button } from "../../components/ui/button";
import { Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface WatermarkRemovalToolProps {
  onRemove: (watermarkImage: File, threshold: number) => void;
}

export const WatermarkRemovalTool = ({ onRemove }: WatermarkRemovalToolProps) => {
  const [watermarkImage, setWatermarkImage] = useState<File | null>(null);
  const [threshold, setThreshold] = useState(0.5);
  const [preview, setPreview] = useState<string>("");

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setWatermarkImage(file);
      setPreview(URL.createObjectURL(file));
      toast.success("Watermark image loaded");
    } else {
      toast.error("Please upload a valid image file");
    }
  };

  const handleRemove = () => {
    if (!watermarkImage) {
      toast.error("Please upload a watermark image first");
      return;
    }
    onRemove(watermarkImage, threshold);
  };

  const clearImage = () => {
    setWatermarkImage(null);
    setPreview("");
  };

  return (
    <Card className="p-6 space-y-6">
      <div>
        <Label htmlFor="watermark-upload" className="text-sm font-medium">
          Upload Watermark Screenshot
        </Label>
        <p className="text-xs text-muted-foreground mb-3">
          Take a clear screenshot of the watermark you want to remove
        </p>
        <div className="flex gap-2">
          <Input
            id="watermark-upload"
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="cursor-pointer"
          />
          {watermarkImage && (
            <Button
              variant="outline"
              size="icon"
              onClick={clearImage}
              title="Clear image"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {preview && (
        <div>
          <Label className="text-sm font-medium mb-2 block">Preview</Label>
          <div className="border rounded-lg p-4 bg-muted">
            <img
              src={preview}
              alt="Watermark preview"
              className="max-w-full max-h-48 mx-auto object-contain"
            />
          </div>
        </div>
      )}

      <div>
        <Label className="text-sm font-medium">
          Match Threshold: {threshold.toFixed(2)}
        </Label>
        <p className="text-xs text-muted-foreground mb-3">
          Higher = stricter matching (fewer false positives)
        </p>
        <Slider
          value={[threshold]}
          onValueChange={(value) => setThreshold(value[0])}
          min={0.1}
          max={0.95}
          step={0.05}
          className="w-full"
        />
      </div>

      <Button
        onClick={handleRemove}
        disabled={!watermarkImage}
        className="w-full"
      >
        <Upload className="w-4 h-4 mr-2" />
        Remove Watermarks & Download
      </Button>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>• This process may take a minute for large PDFs</p>
        <p>• Works with watermarks at different scales and rotations</p>
        <p>• Best results with clear, high-contrast watermarks</p>
      </div>
    </Card>
  );
};
