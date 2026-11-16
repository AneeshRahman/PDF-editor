import { useCallback, useState } from "react";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { isPdfFile, MAX_FILE_MB } from "../lib/files";
import { CropMarks } from "./brand";

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
        "group relative flex h-64 w-full cursor-pointer flex-col items-center justify-center border bg-card transition-colors",
        dragging ? "border-brand bg-brand/[0.03]" : "border-border hover:border-foreground/30",
        className
      )}
    >
      <CropMarks active={dragging} />
      <input
        type="file"
        accept=".pdf,application/pdf"
        multiple={multiple}
        onChange={(e) => {
          accept(e.target.files);
          e.target.value = ""; // allow picking the same file again
        }}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        aria-label={multiple ? "Select PDF files" : "Select a PDF file"}
      />
      <p className="text-xl font-medium tracking-[-0.02em]">
        {dragging ? "Release to add" : multiple ? "Drop PDF files here" : "Drop a PDF here"}
      </p>
      <span className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-all group-hover:gap-3">
        {multiple ? "Choose files" : "Choose a file"}
        <ArrowRight className="h-4 w-4" />
      </span>
      <p className="label-mono mt-5">.pdf · up to {MAX_FILE_MB}MB{multiple ? " each" : ""}</p>
    </div>
  );
};
