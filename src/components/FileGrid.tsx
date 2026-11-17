import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { PdfThumbnail } from "./PdfThumbnail";
import { formatSize, isPdfFile, type LoadedPdf } from "../lib/files";
import { cn } from "../lib/utils";

interface FileGridProps {
  files: LoadedPdf[];
  onReorder: (files: LoadedPdf[]) => void;
  onRemove: (id: string) => void;
  onAdd: (files: File[]) => void;
}

const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

/** Thumbnails of each file. Drag (or use the arrows) to reorder. */
export const FileGrid = ({ files, onReorder, onRemove, onAdd }: FileGridProps) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4">
      {files.map((file, i) => (
        <div
          key={file.id}
          draggable
          onDragStart={(e) => {
            setDragIndex(i);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => {
            if (dragIndex === null) return; // ignore files dragged in from outside
            e.preventDefault();
            setOverIndex(i);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIndex !== null && dragIndex !== i) onReorder(move(files, dragIndex, i));
            setDragIndex(null);
            setOverIndex(null);
          }}
          onDragEnd={() => {
            setDragIndex(null);
            setOverIndex(null);
          }}
          className={cn(
            "group relative flex cursor-grab flex-col items-center gap-2 rounded-xl border bg-card p-3 transition active:cursor-grabbing",
            dragIndex === i && "opacity-40",
            overIndex === i && dragIndex !== i ? "border-primary ring-2 ring-primary/30" : "border-border"
          )}
        >
          <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
            {i + 1}
          </span>
          <button
            type="button"
            onClick={() => onRemove(file.id)}
            className="absolute right-2 top-2 rounded-full bg-background/90 p-1.5 text-muted-foreground shadow can-hover:p-1 can-hover:opacity-0 transition hover:text-destructive group-hover:opacity-100 focus:opacity-100"
            aria-label={`Remove ${file.name}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>

          <div className="flex h-[190px] items-center">
            <PdfThumbnail bytes={file.bytes} width={130} />
          </div>

          <p className="w-full truncate text-center text-xs font-medium" title={file.name}>
            {file.name}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {file.pageCount} page{file.pageCount === 1 ? "" : "s"} · {formatSize(file.bytes.byteLength)}
          </p>

          <div className="flex gap-1 transition can-hover:opacity-0 group-hover:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              disabled={i === 0}
              onClick={() => onReorder(move(files, i, i - 1))}
              className="rounded p-2 hover:bg-muted disabled:opacity-30 can-hover:p-1"
              aria-label="Move left"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={i === files.length - 1}
              onClick={() => onReorder(move(files, i, i + 1))}
              className="rounded p-2 hover:bg-muted disabled:opacity-30 can-hover:p-1"
              aria-label="Move right"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}

      <label className="flex min-h-[260px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted-foreground transition hover:border-primary hover:text-primary">
        <Plus className="h-8 w-8" />
        <span className="text-sm font-medium">Add more files</span>
        <input
          type="file"
          multiple
          accept=".pdf,application/pdf"
          className="sr-only"
          onChange={(e) => {
            onAdd(Array.from(e.target.files ?? []).filter(isPdfFile));
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
};
