import { useCallback } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";

const MAX_SIZE_MB = 20;

const isPdf = (file: File) =>
  file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
}

export const FileUploader = ({ onFileSelect }: FileUploaderProps) => {
  const accept = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      if (!isPdf(file)) {
        toast.error("Please upload a PDF file");
      } else if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        toast.error(`File is too large (max ${MAX_SIZE_MB}MB)`);
      } else {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      accept(e.dataTransfer.files[0]);
    },
    [accept]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      accept(e.target.files?.[0]);
      e.target.value = ""; // allow picking the same file again
    },
    [accept]
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
        accept=".pdf,application/pdf"
        onChange={handleFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      <Upload className="w-12 h-12 mb-4 text-muted-foreground" />
      <p className="mb-2 text-sm text-foreground font-medium">Click to upload or drag and drop</p>
      <p className="text-xs text-muted-foreground">PDF files only (Max {MAX_SIZE_MB}MB)</p>
    </div>
  );
};
