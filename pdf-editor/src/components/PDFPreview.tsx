import { useEffect, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
// Import the worker via Vite to avoid CDN issues
  import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

  // Configure worker by providing a Worker instance (most reliable in Vite)
  pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();

interface PDFPreviewProps {
  pdfData: Uint8Array | null;
  watermarkText?: string;
  watermarkOpacity?: number;
  watermarkPosition?: "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

export const PDFPreview = ({
  pdfData,
  watermarkText = "",
  watermarkOpacity = 0.3,
  watermarkPosition = "center"
}: PDFPreviewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pdfData || !containerRef.current) return;

    const renderPDF = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(pdfData),
          verbosity: 0, // Suppress warnings, show only errors
        });
        const pdf = await loadingTask.promise;
        const numPages = pdf.numPages;

        const container = containerRef.current!;
        container.innerHTML = ''; // Clear previous content
        container.style.position = 'relative'; // Ensure relative positioning

        let totalHeight = 0;

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.0 });

          const canvas = document.createElement('canvas');
          const context = canvas.getContext("2d")!;

          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.position = 'absolute';
          canvas.style.top = totalHeight + 'px';
          canvas.style.left = '50%';
          canvas.style.transform = 'translateX(-50%)';
          canvas.style.display = 'block';

          container.appendChild(canvas);

          const renderContext = {
            canvasContext: context,
            viewport: viewport,
            canvas: canvas,
          };

          await page.render(renderContext).promise;

        // Add watermark if text is provided and not empty
        if (watermarkText && watermarkText.trim()) {
          context.save();
          context.globalAlpha = watermarkOpacity;
          context.font = "32px Arial";
          context.fillStyle = "#666666";
          context.textAlign = "center";
          context.textBaseline = "middle";

          let x = viewport.width / 2;
          let y = viewport.height / 2;

          switch (watermarkPosition) {
            case "top-left":
              x = 70;
              y = 40;
              break;
            case "top-right":
              x = viewport.width - 70;
              y = 40;
              break;
            case "bottom-left":
              x = 70;
              y = viewport.height - 40;
              break;
            case "bottom-right":
              x = viewport.width - 70;
              y = viewport.height - 40;
              break;
          }

          context.fillText(watermarkText, x, y);
          context.restore();
        }

          totalHeight += viewport.height;
        }

        container.style.height = totalHeight + 'px';
      } catch (error) {
        console.error("Error rendering PDF:", error);
      }
    };

    renderPDF();
  }, [pdfData, watermarkText, watermarkOpacity, watermarkPosition]);

  return (
    <div className="w-full h-full overflow-y-auto bg-muted rounded-lg">
      <div ref={containerRef} className="w-full" />
    </div>
  );
};
