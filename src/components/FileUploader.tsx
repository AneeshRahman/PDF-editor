import { useCallback, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { isPdfFile, MAX_FILE_MB } from "../lib/files";

interface FileUploaderProps {
  onFilesSelect: (files: File[]) => void;
  multiple?: boolean;
  className?: string;
}

export const FileUploader = ({ onFilesSelect, multiple = false, className }: FileUploaderProps) => {
  const [dragging, setDragging] = useState(false);

  const accept = useCallback(
    (list: FileList | null | undefined) => {
      const all = Array.from(list ?? []);
      if (!all.length) return;
      const pdfs = all.filter(isPdfFile);
      if (pdfs.length < all.length) toast.error("Only PDF files can be added");
      if (!pdfs.length) return;
      onFilesSelect(multiple ? pdfs : pdfs.slice(0, 1));
    },
    [multiple, onFilesSelect]
  );

  return (
    <div
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        accept(e.dataTransfer.files);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      className={cn(
        "relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-xl cursor-pointer bg-card transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/50",
        className
      )}
    >
      <input
        type="file"
        accept=".pdf,application/pdf"
        multiple={multiple}
        onChange={(e) => {
          accept(e.target.files);
          e.target.value = ""; // allow picking the same file again
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        aria-label={multiple ? "Select PDF files" : "Select a PDF file"}
      />
      <div className="mb-4 rounded-full bg-primary/10 p-4">
        <Upload className="w-8 h-8 text-primary" />
      </div>
      <p className="mb-1 text-base text-foreground font-semibold">
        {multiple ? "Select PDF files" : "Select a PDF file"}
      </p>
      <p className="text-sm text-muted-foreground">or drop {multiple ? "them" : "it"} here</p>
      <p className="mt-3 text-xs text-muted-foreground">Max {MAX_FILE_MB}MB per file</p>
    </div>
  );
};
