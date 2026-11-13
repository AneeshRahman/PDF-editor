import { useEffect, useState } from "react";
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Input } from '../../components/ui/input';

interface CropToolProps {
  onCrop: (margins: { top: number; right: number; bottom: number; left: number }) => void;
  /** Called on every edit, for a live preview. */
  onChange?: (margins: { top: number; right: number; bottom: number; left: number }) => void;
}

export const CropTool = ({ onCrop, onChange }: CropToolProps) => {
  const [margins, setMarginsState] = useState({ top: 20, right: 20, bottom: 20, left: 20 });
  const setMargins = (m: typeof margins) => {
    setMarginsState(m);
    onChange?.(m);
  };
  // Show the starting margins straight away.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onChange?.(margins), []);

  const handleCrop = () => {
    onCrop(margins);
  };

  return (
    <div className="space-y-6 p-6 bg-card rounded-lg border border-border">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="top" className="text-sm font-medium">
            Top (pts)
          </Label>
          <Input
            id="top"
            type="number"
            value={margins.top}
            onChange={(e) => setMargins({ ...margins, top: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="right" className="text-sm font-medium">
            Right (pts)
          </Label>
          <Input
            id="right"
            type="number"
            value={margins.right}
            onChange={(e) => setMargins({ ...margins, right: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bottom" className="text-sm font-medium">
            Bottom (pts)
          </Label>
          <Input
            id="bottom"
            type="number"
            value={margins.bottom}
            onChange={(e) => setMargins({ ...margins, bottom: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="left" className="text-sm font-medium">
            Left (pts)
          </Label>
          <Input
            id="left"
            type="number"
            value={margins.left}
            onChange={(e) => setMargins({ ...margins, left: Number(e.target.value) })}
          />
        </div>
      </div>

      <Button onClick={handleCrop} className="w-full">
        Apply Crop
      </Button>
    </div>
  );
};
