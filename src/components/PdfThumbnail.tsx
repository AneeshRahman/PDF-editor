import { useEffect, useRef, useState } from "react";
import { loadPdfjsDocument } from "../lib/pdfjs";
import { cn } from "../lib/utils";

interface PdfThumbnailProps {
  bytes: Uint8Array;
  /** 1-based page number. */
  page?: number;
  /** Rendered width in CSS px. */
  width?: number;
  className?: string;
}

export const PdfThumbnail = ({ bytes, page = 1, width = 140, className }: PdfThumbnailProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;

    (async () => {
      try {
        const doc = await loadPdfjsDocument(bytes);
        destroy = () => void doc.destroy();
        if (cancelled) return destroy();
        const p = await doc.getPage(page);
        const base = p.getViewport({ scale: 1 });
        const dpr = window.devicePixelRatio || 1;
        const viewport = p.getViewport({ scale: (width / base.width) * dpr });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await p.render({ canvasContext: canvas.getContext("2d")!, viewport, canvas }).promise;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [bytes, page, width]);

  return failed ? (
    <div
      className={cn("flex items-center justify-center bg-muted text-xs text-muted-foreground", className)}
      style={{ width, height: width * 1.3 }}
    >
      No preview
    </div>
  ) : (
    <canvas ref={canvasRef} className={cn("bg-white shadow-sm", className)} style={{ width }} />
  );
};
