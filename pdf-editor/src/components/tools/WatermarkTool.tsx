import { useState } from "react";
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Slider } from '../../components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';

interface WatermarkToolProps {
  onWatermarkChange: (settings: {
    text: string;
    opacity: number;
    position: "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
  }) => void;
}

export const WatermarkTool = ({ onWatermarkChange }: WatermarkToolProps) => {
  const [text, setText] = useState("");
  const [opacity, setOpacity] = useState(30);
  const [position, setPosition] = useState<"center" | "top-left" | "top-right" | "bottom-left" | "bottom-right">("center");

  const handleTextChange = (newText: string) => {
    setText(newText);
    onWatermarkChange({
      text: newText,
      opacity: opacity / 100,
      position: position,
    });
  };

  const handleOpacityChange = (newOpacity: number) => {
    setOpacity(newOpacity);
    onWatermarkChange({
      text: text,
      opacity: newOpacity / 100,
      position: position,
    });
  };

  const handlePositionChange = (newPosition: "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right") => {
    setPosition(newPosition);
    onWatermarkChange({
      text: text,
      opacity: opacity / 100,
      position: newPosition,
    });
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
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="opacity" className="text-sm font-medium">
          Opacity: {opacity}%
        </Label>
        <Slider
          id="opacity"
          min={10}
          max={100}
          step={5}
          value={[opacity]}
          onValueChange={([value]) => handleOpacityChange(value)}
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="position" className="text-sm font-medium">
          Position
        </Label>
        <Select
          value={position}
          onValueChange={(value: any) => handlePositionChange(value)}
        >
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

      <Button
        variant="outline"
        onClick={() => {
          setText("");
          setOpacity(30);
          setPosition("center");
          onWatermarkChange({ text: "", opacity: 0.3, position: "center" });
        }}
        className="w-full"
      >
        Remove Watermark
      </Button>
    </div>
  );
};
