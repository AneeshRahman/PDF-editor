import { useCallback } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
}

export const FileUploader = ({ onFileSelect }: FileUploaderProps) => {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type === "application/pdf") {
        onFileSelect(file);
      } else {
        toast.error("Please upload a PDF file");
      }
    },
    [onFileSelect]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        if (file.type === "application/pdf") {
          onFileSelect(file);
        } else {
          toast.error("Please upload a PDF file");
        }
      }
    },
    [onFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className="relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer bg-card hover:bg-secondary/50 transition-colors border-border"
    >
      <input
        type="file"
        accept=".pdf"
        onChange={handleFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      <Upload className="w-12 h-12 mb-4 text-muted-foreground" />
      <p className="mb-2 text-sm text-foreground font-medium">
        Click to upload or drag and drop
      </p>
      <p className="text-xs text-muted-foreground">PDF files only (Max 20MB)</p>
    </div>
  );
};
