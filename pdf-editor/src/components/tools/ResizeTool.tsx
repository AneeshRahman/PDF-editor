import { useState } from "react";
import { Button } from '../../components/ui/button'
import { Label } from '../../components/ui/label';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';

interface ResizeToolProps {
  onResize: (size: { width: number; height: number }) => void;
}

const presetSizes = [
  { name: "A4", width: 595, height: 842 },
  { name: "Letter", width: 612, height: 792 },
  { name: "Legal", width: 612, height: 1008 },
  { name: "A3", width: 842, height: 1191 },
];

export const ResizeTool = ({ onResize }: ResizeToolProps) => {
  const [selectedSize, setSelectedSize] = useState("A4");

  const handleResize = () => {
    const size = presetSizes.find((s) => s.name === selectedSize);
    if (size) {
      onResize({ width: size.width, height: size.height });
    }
  };

  return (
    <div className="space-y-6 p-6 bg-card rounded-lg border border-border">
      <div className="space-y-4">
        <Label className="text-sm font-medium">Select Page Size</Label>
        <RadioGroup value={selectedSize} onValueChange={setSelectedSize}>
          {presetSizes.map((size) => (
            <div key={size.name} className="flex items-center space-x-2">
              <RadioGroupItem value={size.name} id={size.name} />
              <Label htmlFor={size.name} className="font-normal cursor-pointer">
                {size.name} ({size.width} x {size.height} pts)
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <Button onClick={handleResize} className="w-full">
        Apply Resize
      </Button>
    </div>
  );
};
