import { Button } from '../../components/ui/button';

interface InvertToolProps {
  onInvert: () => void;
}

export const InvertTool = ({ onInvert }: InvertToolProps) => {
  return (
    <div className="space-y-6 p-6 bg-card rounded-lg border border-border">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          This will invert all colors in your PDF, turning light colors dark and vice versa.
        </p>
      </div>

      <Button onClick={onInvert} className="w-full">
        Invert Colors
      </Button>
    </div>
  );
};
