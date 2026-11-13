import { useEffect, useRef, useState } from "react";
import { loadPdfjsDocument, type PdfjsDocument } from "../lib/pdfjs";
import {
  WATERMARK_FONT_SIZE,
  watermarkAnchor,
  type WatermarkPosition,
} from "../lib/pdf-operations";

interface PDFPreviewProps {
  pdfData: Uint8Array | null;
  watermarkText?: string;
  watermarkOpacity?: number;
  watermarkPosition?: WatermarkPosition;
}

interface RenderedPage {
  overlay: HTMLCanvasElement;
  width: number; // CSS px == PDF points at scale 1
  height: number;
}

const PAGE_GAP = 16;

export const PDFPreview = ({
  pdfData,
  watermarkText = "",
  watermarkOpacity = 0.3,
  watermarkPosition = "center",
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
          rendered.push({ overlay, width: viewport.width, height: viewport.height });
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

  return (
    <div className="w-full h-full overflow-auto bg-muted rounded-lg p-4">
      {error && <p className="text-sm text-destructive text-center py-8">{error}</p>}
      <div ref={containerRef} className="w-max min-w-full" />
    </div>
  );
};
