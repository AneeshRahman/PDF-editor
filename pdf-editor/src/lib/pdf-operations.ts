import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { loadPdfjsDocument } from "./pdfjs";

export type WatermarkPosition = "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface WatermarkSettings {
  text: string;
  opacity: number; // 0..1
  position: WatermarkPosition;
}

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// Shared by the preview and the real watermark so they line up.
export const WATERMARK_FONT_SIZE = 32;
export const WATERMARK_EDGE_X = 70;
export const WATERMARK_EDGE_Y = 40;

/** Centre point of the watermark in top-left-origin coordinates (what a canvas uses). */
export function watermarkAnchor(position: WatermarkPosition, width: number, height: number) {
  switch (position) {
    case "top-left":
      return { x: WATERMARK_EDGE_X, y: WATERMARK_EDGE_Y };
    case "top-right":
      return { x: width - WATERMARK_EDGE_X, y: WATERMARK_EDGE_Y };
    case "bottom-left":
      return { x: WATERMARK_EDGE_X, y: height - WATERMARK_EDGE_Y };
    case "bottom-right":
      return { x: width - WATERMARK_EDGE_X, y: height - WATERMARK_EDGE_Y };
    default:
      return { x: width / 2, y: height / 2 };
  }
}

/* ------------------------------------------------------------------ */
/* Vector operations (pdf-lib): text stays selectable                  */
/* ------------------------------------------------------------------ */

export async function addTextWatermark(bytes: Uint8Array, settings: WatermarkSettings) {
  const doc = await PDFDocument.load(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = WATERMARK_FONT_SIZE;
  const textWidth = font.widthOfTextAtSize(settings.text, size);
  const textHeight = font.heightAtSize(size, { descender: false });

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const anchor = watermarkAnchor(settings.position, width, height);
    // pdf-lib uses a bottom-left origin and draws from the text baseline.
    page.drawText(settings.text, {
      x: anchor.x - textWidth / 2,
      y: height - anchor.y - textHeight / 2,
      size,
      font,
      color: rgb(0.4, 0.4, 0.4),
      opacity: settings.opacity,
    });
  }
  return doc.save();
}

export async function cropPages(bytes: Uint8Array, margins: Margins) {
  const doc = await PDFDocument.load(bytes);
  for (const page of doc.getPages()) {
    const box = page.getCropBox();
    const width = box.width - margins.left - margins.right;
    const height = box.height - margins.top - margins.bottom;
    if (width <= 0 || height <= 0) {
      throw new Error("Margins are larger than the page");
    }
    const x = box.x + margins.left;
    const y = box.y + margins.bottom;
    page.setCropBox(x, y, width, height);
    page.setMediaBox(x, y, width, height);
  }
  return doc.save();
}

/** Fits every page into the target size, keeping its aspect ratio and centring it. */
export async function resizePages(bytes: Uint8Array, size: { width: number; height: number }) {
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  // embedPdf() only embeds page 0 unless given the indices.
  const embedded = await out.embedPdf(src, src.getPageIndices());

  for (const embeddedPage of embedded) {
    // Keep landscape pages landscape.
    const landscape = embeddedPage.width > embeddedPage.height;
    const targetW = landscape ? Math.max(size.width, size.height) : size.width;
    const targetH = landscape ? Math.min(size.width, size.height) : size.height;
    const scale = Math.min(targetW / embeddedPage.width, targetH / embeddedPage.height);
    const w = embeddedPage.width * scale;
    const h = embeddedPage.height * scale;

    const page = out.addPage([targetW, targetH]);
    page.drawPage(embeddedPage, { x: (targetW - w) / 2, y: (targetH - h) / 2, width: w, height: h });
  }
  return out.save();
}

/* ------------------------------------------------------------------ */
/* Raster operations (pdf.js -> canvas -> pdf-lib)                     */
/* Pages become images, so text is no longer selectable.               */
/* ------------------------------------------------------------------ */

export type ProgressCallback = (page: number, total: number) => void;

type PixelTransform =(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void | Promise<void>;

async function rasterize(
  bytes: Uint8Array,
  {
    scale,
    quality,
    transform,
    onProgress,
  }: { scale: number; quality: number; transform?: PixelTransform; onProgress?: ProgressCallback }
) {
  const src = await loadPdfjsDocument(bytes);
  const out = await PDFDocument.create();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: Boolean(transform) })!;

  try {
    for (let i = 1; i <= src.numPages; i++) {
      const page = await src.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale });

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      if (transform) await transform(ctx, canvas);

      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode page"))), "image/jpeg", quality)
      );
      const image = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
      const outPage = out.addPage([base.width, base.height]);
      outPage.drawImage(image, { x: 0, y: 0, width: base.width, height: base.height });
      page.cleanup();
      onProgress?.(i, src.numPages);
    }
  } finally {
    await src.destroy();
  }
  return out.save();
}

/** quality is 0.1..1. Lower quality also lowers resolution. */
export function compressPdf(bytes: Uint8Array, quality: number, onProgress?: ProgressCallback) {
  const scale = 0.75 + quality * 1.25; // 0.875x .. 2x
  return rasterize(bytes, { scale, quality, onProgress });
}

export function invertPdf(bytes: Uint8Array, onProgress?: ProgressCallback) {
  return rasterize(bytes, {
    scale: 2,
    quality: 0.92,
    onProgress,
    transform: (ctx, canvas) => {
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 255 - d[i];
        d[i + 1] = 255 - d[i + 1];
        d[i + 2] = 255 - d[i + 2];
      }
      ctx.putImageData(img, 0, 0);
    },
  });
}

/* ------------------------------------------------------------------ */
/* Watermark removal by template matching (experimental)               */
/* ------------------------------------------------------------------ */

const SEARCH_DOWNSAMPLE = 4; // match on a 1/4-size copy for speed
const TEMPLATE_SCALES = [0.5, 0.65, 0.8, 1, 1.25, 1.5, 2];
const MAX_MATCHES_PER_PAGE = 20;
// Pixels darker than this are treated as real content (body text) and kept.
const KEEP_DARKER_THAN = 90;

interface Gray {
  data: Float32Array;
  width: number;
  height: number;
}

function toGray(img: ImageData, step = 1): Gray {
  const width = Math.floor(img.width / step);
  const height = Math.floor(img.height / step);
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * step * img.width + x * step) * 4;
      data[y * width + x] = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
    }
  }
  return { data, width, height };
}

async function loadImageGray(file: File, scale: number): Promise<Gray> {
  const bitmap = await createImageBitmap(file);
  const w = Math.max(4, Math.round(bitmap.width * scale));
  const h = Math.max(4, Math.round(bitmap.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return toGray(ctx.getImageData(0, 0, w, h));
}

/** Normalised cross-correlation of template over image. Returns best-scoring non-overlapping boxes. */
function findMatches(image: Gray, tpl: Gray, threshold: number) {
  const { width: W, height: H, data: I } = image;
  const { width: tw, height: th, data: T } = tpl;
  if (tw >= W || th >= H) return [];

  const n = tw * th;
  let tMean = 0;
  for (let i = 0; i < n; i++) tMean += T[i];
  tMean /= n;
  const tc = new Float32Array(n);
  let tVar = 0;
  for (let i = 0; i < n; i++) {
    tc[i] = T[i] - tMean;
    tVar += tc[i] * tc[i];
  }
  if (tVar < 1e-3) return []; // blank template

  // Integral images for fast window mean / variance.
  const iw = W + 1;
  const S = new Float64Array(iw * (H + 1));
  const S2 = new Float64Array(iw * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    let row2 = 0;
    for (let x = 0; x < W; x++) {
      const v = I[y * W + x];
      row += v;
      row2 += v * v;
      S[(y + 1) * iw + x + 1] = S[y * iw + x + 1] + row;
      S2[(y + 1) * iw + x + 1] = S2[y * iw + x + 1] + row2;
    }
  }

  const hits: { x: number; y: number; score: number }[] = [];
  for (let y = 0; y <= H - th; y++) {
    for (let x = 0; x <= W - tw; x++) {
      const a = y * iw + x;
      const b = y * iw + x + tw;
      const c = (y + th) * iw + x;
      const d = (y + th) * iw + x + tw;
      const sum = S[d] - S[b] - S[c] + S[a];
      const sum2 = S2[d] - S2[b] - S2[c] + S2[a];
      const wVar = sum2 - (sum * sum) / n;
      if (wVar < 1e-3) continue;

      let cross = 0;
      for (let ty = 0; ty < th; ty++) {
        const ir = (y + ty) * W + x;
        const tr = ty * tw;
        for (let tx = 0; tx < tw; tx++) cross += I[ir + tx] * tc[tr + tx];
      }
      const score = cross / Math.sqrt(wVar * tVar);
      if (score >= threshold) hits.push({ x, y, score });
    }
  }

  // Keep the strongest, non-overlapping hits.
  hits.sort((p, q) => q.score - p.score);
  const kept: typeof hits = [];
  for (const h of hits) {
    if (kept.length >= MAX_MATCHES_PER_PAGE) break;
    if (kept.every((k) => Math.abs(k.x - h.x) >= tw / 2 || Math.abs(k.y - h.y) >= th / 2)) kept.push(h);
  }
  return kept.map((k) => ({ x: k.x, y: k.y, w: tw, h: th, score: k.score }));
}

/**
 * Finds the watermark (from a screenshot) on each page and paints its light pixels white.
 * Works at several scales but not rotations. Dark content inside the match is kept.
 */
export async function removeWatermarkByImage(
  bytes: Uint8Array,
  watermark: File,
  threshold: number,
  onProgress?: ProgressCallback
) {
  const templates = await Promise.all(
    TEMPLATE_SCALES.map((s) => loadImageGray(watermark, s / SEARCH_DOWNSAMPLE))
  );
  let totalMatches = 0;

  const result = await rasterize(bytes, {
    scale: 2,
    quality: 0.92,
    onProgress,
    transform: async (ctx, canvas) => {
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const small = toGray(img, SEARCH_DOWNSAMPLE);

      // Pick the scale whose best match is strongest, then use all of its hits.
      let best: ReturnType<typeof findMatches> = [];
      for (const tpl of templates) {
        const m = findMatches(small, tpl, threshold);
        if (m.length && (!best.length || m[0].score > best[0].score)) best = m;
        await new Promise((r) => setTimeout(r)); // keep the UI responsive
      }

      const d = img.data;
      for (const box of best) {
        const x0 = box.x * SEARCH_DOWNSAMPLE;
        const y0 = box.y * SEARCH_DOWNSAMPLE;
        const x1 = Math.min(canvas.width, x0 + box.w * SEARCH_DOWNSAMPLE);
        const y1 = Math.min(canvas.height, y0 + box.h * SEARCH_DOWNSAMPLE);
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = (y * canvas.width + x) * 4;
            const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            if (lum > KEEP_DARKER_THAN) {
              d[i] = d[i + 1] = d[i + 2] = 255;
            }
          }
        }
      }
      totalMatches += best.length;
      ctx.putImageData(img, 0, 0);
    },
  });

  return { bytes: result, matches: totalMatches };
}
