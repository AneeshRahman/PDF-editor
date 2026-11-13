import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadPdfjsDocument, type PdfjsDocument } from "../lib/pdfjs";
import {
  WATERMARK_FONT_SIZE,
  watermarkAnchor,
  type AreaSelection,
  type PageRects,
  type Rect,
  type WatermarkPosition,
} from "../lib/pdf-operations";
import { cn } from "../lib/utils";

interface PDFPreviewProps {
  pdfData: Uint8Array | null;
  watermarkText?: string;
  watermarkOpacity?: number;
  watermarkPosition?: WatermarkPosition;
  /** Let the user drag a box on a page. */
  selectable?: boolean;
  selection?: AreaSelection | null;
  onSelectionChange?: (selection: AreaSelection | null) => void;
  /** Boxes to outline, e.g. areas that will be erased. */
  highlights?: PageRects | null;
  className?: string;
}

interface RenderedPage {
  wrapper: HTMLDivElement;
  overlay: HTMLCanvasElement;
  width: number; // CSS px == PDF points at scale 1
  height: number;
}

const PAGE_GAP = 16;
const MIN_SELECTION_PX = 6;

export const PDFPreview = ({
  pdfData,
  watermarkText = "",
  watermarkOpacity = 0.3,
  watermarkPosition = "center",
  selectable = false,
  selection = null,
  onSelectionChange,
  highlights = null,
  className,
}: PDFPreviewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Render the PDF pages. Only re-runs when the document itself changes.
  useEffect(() => {
    const container = containerRef.current;
    if (!pdfData || !container) return;

    let cancelled = false;
    let doc: PdfjsDocument | null = null;
    const dpr = window.devicePixelRatio || 1;

    const render = async () => {
      try {
        setError(null);
        doc = await loadPdfjsDocument(pdfData);
        if (cancelled) return;

        container.innerHTML = "";
        setPages([]);
        const rendered: RenderedPage[] = [];

        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: 1 });
          const hiDpi = page.getViewport({ scale: dpr });

          const wrapper = document.createElement("div");
          wrapper.className = "relative mx-auto bg-white shadow-md";
          wrapper.style.width = `${viewport.width}px`;
          wrapper.style.height = `${viewport.height}px`;
          wrapper.style.marginBottom = `${PAGE_GAP}px`;
          wrapper.dataset.page = String(n);

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(hiDpi.width);
          canvas.height = Math.floor(hiDpi.height);
          canvas.className = "absolute inset-0 w-full h-full";

          const overlay = document.createElement("canvas");
          overlay.width = canvas.width;
          overlay.height = canvas.height;
          overlay.className = "absolute inset-0 w-full h-full pointer-events-none";

          wrapper.append(canvas, overlay);
          container.appendChild(wrapper);

          await page.render({ canvasContext: canvas.getContext("2d")!, viewport: hiDpi, canvas }).promise;
          if (cancelled) return;
          rendered.push({ wrapper, overlay, width: viewport.width, height: viewport.height });
        }
        setPages(rendered);
      } catch (err) {
        if (!cancelled) {
          console.error("Error rendering PDF:", err);
          setError("Could not render this PDF.");
        }
      }
    };

    render();
    return () => {
      cancelled = true;
      doc?.destroy();
    };
  }, [pdfData]);

  // Draw the watermark preview on the overlay canvases (cheap, no re-render of pages).
  useEffect(() => {
    for (const { overlay, width, height } of pages) {
      const ctx = overlay.getContext("2d")!;
      const scale = overlay.width / width;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      if (!watermarkText.trim()) continue;

      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.globalAlpha = watermarkOpacity;
      ctx.font = `${WATERMARK_FONT_SIZE}px Helvetica, Arial, sans-serif`;
      ctx.fillStyle = "#666666";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const { x, y } = watermarkAnchor(watermarkPosition, width, height);
      ctx.fillText(watermarkText, x, y);
    }
  }, [pages, watermarkText, watermarkOpacity, watermarkPosition]);

  const interactive = selectable || (highlights && Object.keys(highlights).length > 0);

  return (
    <div className={cn("w-full h-full overflow-auto bg-muted rounded-lg p-4", className)}>
      {error && <p className="text-sm text-destructive text-center py-8">{error}</p>}
      <div ref={containerRef} className="w-max min-w-full" />
      {interactive &&
        pages.map((p, i) =>
          createPortal(
            <PageLayer
              pageIndex={i}
              selectable={selectable}
              selection={selection?.page === i ? selection.rect : null}
              highlights={highlights?.[i] ?? []}
              onSelect={(rect) => onSelectionChange?.(rect ? { page: i, rect } : null)}
            />,
            p.wrapper,
            `layer-${i}`
          )
        )}
    </div>
  );
};

/* ------------------------------------------------------------------ */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const boxStyle = (r: Rect) => ({
  left: `${r.x * 100}%`,
  top: `${r.y * 100}%`,
  width: `${r.w * 100}%`,
  height: `${r.h * 100}%`,
});

interface PageLayerProps {
  pageIndex: number;
  selectable: boolean;
  selection: Rect | null;
  highlights: Rect[];
  onSelect: (rect: Rect | null) => void;
}

/** Sits on top of one rendered page: drag-to-select plus highlight boxes. */
const PageLayer = ({ pageIndex, selectable, selection, highlights, onSelect }: PageLayerProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);

  const point = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
  };
  const between = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  });

  const shown = draft ?? selection;

  return (
    <div
      ref={ref}
      data-testid={`page-layer-${pageIndex}`}
      className={cn("absolute inset-0", selectable && "cursor-crosshair touch-none select-none")}
      onPointerDown={(e) => {
        if (!selectable || e.button !== 0) return;
        e.preventDefault();
        ref.current!.setPointerCapture(e.pointerId);
        start.current = point(e);
        setDraft({ ...start.current, w: 0, h: 0 });
      }}
      onPointerMove={(e) => {
        if (start.current) setDraft(between(start.current, point(e)));
      }}
      onPointerUp={(e) => {
        if (!start.current) return;
        const rect = between(start.current, point(e));
        start.current = null;
        setDraft(null);
        const size = ref.current!.getBoundingClientRect();
        const tooSmall = rect.w * size.width < MIN_SELECTION_PX || rect.h * size.height < MIN_SELECTION_PX;
        onSelect(tooSmall ? null : rect);
      }}
    >
      {highlights.map((r, i) => (
        <div
          key={i}
          className="pointer-events-none absolute border-2 border-rose-500 bg-rose-500/15"
          style={boxStyle(r)}
        />
      ))}
      {shown && (
        <div
          className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/10"
          style={boxStyle(shown)}
        />
      )}
    </div>
  );
};
