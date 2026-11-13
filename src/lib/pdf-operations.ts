import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { loadPdfjsDocument, type PdfjsDocument } from "./pdfjs";

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
/* Watermark removal: erase selected areas / find similar areas        */
/* ------------------------------------------------------------------ */

/** A rectangle as fractions (0..1) of the displayed page, top-left origin. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Rectangles to act on, keyed by 0-based page index. */
export type PageRects = Record<number, Rect[]>;

/** An area the user dragged on one page of the preview. */
export interface AreaSelection {
  page: number;
  rect: Rect;
}

export const countRects = (areas: PageRects) => Object.values(areas).reduce((n, r) => n + r.length, 0);

const WORK_SCALE = 2; // render pages at 2x for erasing and matching
const SEARCH_DOWNSAMPLE = 4; // match on a 1/4-size copy for speed
const MATCH_SCALES = [0.8, 0.9, 1, 1.12, 1.25]; // tolerate small size differences
const MAX_MATCHES_PER_PAGE = 20;
// Pixels darker than this are treated as real content (body text) and kept.
const KEEP_DARKER_THAN = 100;
// Found matches can be a few pixels off; grow them by this share of their size on each side.
const MATCH_PADDING = 0.06;

async function renderPage(doc: PdfjsDocument, index: number, scale: number) {
  const page = await doc.getPage(index + 1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  page.cleanup();
  return { canvas, ctx, viewport, rotation: page.rotate % 360 };
}

/** Fractional rect -> whole-pixel rect inside the canvas. */
function toPixels(rect: Rect, canvas: HTMLCanvasElement) {
  const x = Math.max(0, Math.floor(rect.x * canvas.width));
  const y = Math.max(0, Math.floor(rect.y * canvas.height));
  const x2 = Math.min(canvas.width, Math.ceil((rect.x + rect.w) * canvas.width));
  const y2 = Math.min(canvas.height, Math.ceil((rect.y + rect.h) * canvas.height));
  return { x, y, w: Math.max(1, x2 - x), h: Math.max(1, y2 - y) };
}

const luminance = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

type PixelBox = { x: number; y: number; w: number; h: number };

// Margin (in WORK_SCALE pixels, so 2px = 1pt) kept see-through around text in a patch.
const PATCH_TEXT_MARGIN = 2;

/** Max filter: each value becomes the largest within `radius` pixels (square window). */
function dilate(src: Float32Array, w: number, h: number, radius: number) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, x - radius); k <= Math.min(w - 1, x + radius); k++) m = Math.max(m, src[y * w + k]);
      tmp[y * w + x] = m;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, y - radius); k <= Math.min(h - 1, y + radius); k++) m = Math.max(m, tmp[k * w + x]);
      out[y * w + x] = m;
    }
  }
  return out;
}

/**
 * Works out how to paint over a region with its own background colour (the median of its
 * border pixels), so it also works on tinted pages. With keepDark, text darker than the
 * background is kept.
 *
 * - "patch": returns a separate canvas: background colour where the watermark was, and
 *   transparent where text is kept, so the original vector text shows through crisply.
 * - "flatten": paints the result straight onto ctx (for pages that become one image).
 */
function cleanRegion(ctx: CanvasRenderingContext2D, px: PixelBox, keepDark: boolean, mode: "patch"): HTMLCanvasElement;
function cleanRegion(ctx: CanvasRenderingContext2D, px: PixelBox, keepDark: boolean, mode: "flatten"): void;
function cleanRegion(ctx: CanvasRenderingContext2D, px: PixelBox, keepDark: boolean, mode: "patch" | "flatten") {
  const img = ctx.getImageData(px.x, px.y, px.w, px.h);
  const d = img.data;

  const border: number[] = [];
  for (let x = 0; x < px.w; x++) border.push(x * 4, ((px.h - 1) * px.w + x) * 4);
  for (let y = 1; y < px.h - 1; y++) border.push(y * px.w * 4, (y * px.w + px.w - 1) * 4);
  border.sort((a, b) => luminance(d, a) - luminance(d, b));
  const m = border[Math.floor(border.length / 2)];
  const [r, g, b] = [d[m], d[m + 1], d[m + 2]];
  const bgLum = luminance(d, m);
  // Below darkCut: kept as-is (text). Above softCut: replaced (watermark).
  // In between: faded toward the background, which keeps text edges smooth.
  const darkCut = Math.min(KEEP_DARKER_THAN, bgLum - 70);
  const softCut = Math.min(darkCut + 50, bgLum - 60);

  // How much of each pixel to keep: 1 = text, 0 = watermark/background.
  let keepMap = new Float32Array(px.w * px.h);
  if (keepDark) {
    for (let p = 0; p < keepMap.length; p++) {
      keepMap[p] = Math.min(1, Math.max(0, (softCut - luminance(d, p * 4)) / (softCut - darkCut)));
    }
    // For patches, widen the see-through area so the original text's soft edges are never
    // covered, whatever zoom the PDF is later viewed at.
    if (mode === "patch") keepMap = dilate(keepMap, px.w, px.h, PATCH_TEXT_MARGIN);
  }

  for (let i = 0; i < d.length; i += 4) {
    const keep = keepMap[i / 4];
    if (mode === "patch") {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = Math.round(255 * (1 - keep));
    } else {
      d[i] = r + (d[i] - r) * keep;
      d[i + 1] = g + (d[i + 1] - g) * keep;
      d[i + 2] = b + (d[i + 2] - b) * keep;
    }
  }

  if (mode === "flatten") {
    ctx.putImageData(img, px.x, px.y);
    return;
  }
  const patch = document.createElement("canvas");
  patch.width = px.w;
  patch.height = px.h;
  patch.getContext("2d")!.putImageData(img, 0, 0);
  return patch;
}

function canvasToBytes(canvas: HTMLCanvasElement, type: "image/png" | "image/jpeg", quality?: number) {
  return new Promise<Uint8Array>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? b.arrayBuffer().then((a) => resolve(new Uint8Array(a))) : reject(new Error("Could not encode image"))),
      type,
      quality
    )
  );
}

function cropCanvas(source: HTMLCanvasElement, px: { x: number; y: number; w: number; h: number }, scale = 1) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(px.w * scale));
  c.height = Math.max(1, Math.round(px.h * scale));
  c.getContext("2d")!.drawImage(source, px.x, px.y, px.w, px.h, 0, 0, c.width, c.height);
  return c;
}

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

const yieldToUi = () => new Promise((r) => setTimeout(r));

/**
 * Uses the selected area as a template and finds similar-looking areas on the given pages.
 * Handles small size differences, but not rotation. The selection itself is always included.
 */
export async function findSimilarAreas(
  bytes: Uint8Array,
  selection: AreaSelection,
  threshold: number,
  pageIndices: number[],
  onProgress?: ProgressCallback
): Promise<PageRects> {
  const doc = await loadPdfjsDocument(bytes);
  try {
    const source = await renderPage(doc, selection.page, WORK_SCALE);
    const px = toPixels(selection.rect, source.canvas);
    const templates = MATCH_SCALES.map((s) => {
      const c = cropCanvas(source.canvas, px, s / SEARCH_DOWNSAMPLE);
      return toGray(c.getContext("2d")!.getImageData(0, 0, c.width, c.height));
    });
    if (templates[2].width < 8 || templates[2].height < 4) {
      throw new Error("The selected area is too small to match. Draw a slightly bigger box.");
    }

    const found: PageRects = {};
    for (const [n, index] of pageIndices.entries()) {
      const { canvas, ctx } = index === selection.page ? source : await renderPage(doc, index, WORK_SCALE);
      const gray = toGray(ctx.getImageData(0, 0, canvas.width, canvas.height), SEARCH_DOWNSAMPLE);

      // Use the scale whose best match is strongest.
      let best: ReturnType<typeof findMatches> = [];
      for (const tpl of templates) {
        const m = findMatches(gray, tpl, threshold);
        if (m.length && (!best.length || m[0].score > best[0].score)) best = m;
        await yieldToUi();
      }

      const rects = best.map((b) => {
        const w = (b.w * SEARCH_DOWNSAMPLE) / canvas.width;
        const h = (b.h * SEARCH_DOWNSAMPLE) / canvas.height;
        const x = (b.x * SEARCH_DOWNSAMPLE) / canvas.width - w * MATCH_PADDING;
        const y = (b.y * SEARCH_DOWNSAMPLE) / canvas.height - h * MATCH_PADDING;
        const pw = w * (1 + 2 * MATCH_PADDING);
        const ph = h * (1 + 2 * MATCH_PADDING);
        // Clamp to the page.
        const cx = Math.max(0, x);
        const cy = Math.max(0, y);
        return { x: cx, y: cy, w: Math.min(1, x + pw) - cx, h: Math.min(1, y + ph) - cy };
      });
      if (index === selection.page) {
        // Guarantee the user's own selection is in the result, replacing any near-duplicate.
        const s = selection.rect;
        const others = rects.filter((r) => Math.abs(r.x - s.x) > s.w / 2 || Math.abs(r.y - s.y) > s.h / 2);
        found[index] = [s, ...others];
      } else if (rects.length) {
        found[index] = rects;
      }
      onProgress?.(n + 1, pageIndices.length);
    }
    return found;
  } finally {
    await doc.destroy();
  }
}

/**
 * Erases the given areas. Only the areas are replaced (by a cleaned image patch), so
 * everything else on the page stays as real, selectable text. Rotated pages are the
 * exception: they are flattened to an image.
 *
 * Note: the patch covers the watermark. If the watermark is text, it may still be
 * present (hidden) in the file's text layer.
 */
export async function eraseAreas(
  bytes: Uint8Array,
  areas: PageRects,
  { keepDark = true }: { keepDark?: boolean } = {},
  onProgress?: ProgressCallback
) {
  const out = await loadPdf(bytes);
  const js = await loadPdfjsDocument(bytes);
  const pages = Object.keys(areas)
    .map(Number)
    .filter((i) => areas[i]?.length)
    .sort((a, b) => a - b);

  try {
    for (const [n, index] of pages.entries()) {
      const { canvas, ctx, viewport, rotation } = await renderPage(js, index, WORK_SCALE);
      const boxes = areas[index].map((r) => toPixels(r, canvas));

      if (rotation === 0) {
        const page = out.getPage(index);
        for (const px of boxes) {
          // Transparent where text is kept, so the original vector text stays crisp underneath.
          const patch = await out.embedPng(await canvasToBytes(cleanRegion(ctx, px, keepDark, "patch"), "image/png"));
          // Map the patch corners from canvas pixels to PDF user space (handles crop-box offsets).
          const [x1, y1] = viewport.convertToPdfPoint(px.x, px.y);
          const [x2, y2] = viewport.convertToPdfPoint(px.x + px.w, px.y + px.h);
          page.drawImage(patch, {
            x: Math.min(x1, x2),
            y: Math.min(y1, y2),
            width: Math.abs(x2 - x1),
            height: Math.abs(y2 - y1),
          });
        }
      } else {
        // Rotated page: replace it with the cleaned image of the whole page.
        boxes.forEach((px) => cleanRegion(ctx, px, keepDark, "flatten"));
        const image = await out.embedJpg(await canvasToBytes(canvas, "image/jpeg", 0.92));
        const w = viewport.width / WORK_SCALE;
        const h = viewport.height / WORK_SCALE;
        out.removePage(index);
        out.insertPage(index, [w, h]).drawImage(image, { x: 0, y: 0, width: w, height: h });
      }
      onProgress?.(n + 1, pages.length);
      await yieldToUi();
    }
  } finally {
    await js.destroy();
  }
  return out.save();
}


/* ------------------------------------------------------------------ */
/* Organize: merge, split, rotate                                       */
/* ------------------------------------------------------------------ */

/** Loads with pdf-lib, tolerating owner-password (permissions-only) encryption. */
export function loadPdf(bytes: Uint8Array) {
  return PDFDocument.load(bytes, { ignoreEncryption: true });
}

export async function getPageCount(bytes: Uint8Array) {
  return (await loadPdf(bytes)).getPageCount();
}

export async function mergePdfs(files: Uint8Array[]) {
  const out = await PDFDocument.create();
  for (const bytes of files) {
    const src = await loadPdf(bytes);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return out.save();
}

/** A 1-based, inclusive page range. */
export interface PageRange {
  from: number;
  to: number;
}

/**
 * Parses "1-3, 5, 8-" into ranges. An open end ("8-") runs to the last page.
 * Throws a readable error for anything invalid or out of bounds.
 */
export function parsePageRanges(input: string, pageCount: number): PageRange[] {
  const parts = input.split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) throw new Error("Enter at least one page or range, e.g. 1-3, 5");

  return parts.map((part) => {
    const m = part.match(/^(\d+)?\s*(-)?\s*(\d+)?$/);
    if (!m || (!m[1] && !m[3])) throw new Error(`"${part}" is not a page or range`);
    const from = m[1] ? Number(m[1]) : 1;
    const to = m[2] ? (m[3] ? Number(m[3]) : pageCount) : from;
    if (from < 1 || to > pageCount || from > to) {
      throw new Error(`"${part}" is outside pages 1-${pageCount}`);
    }
    return { from, to };
  });
}

/** Every N pages: [1-N], [N+1-2N], ... */
export function fixedRanges(pageCount: number, every: number): PageRange[] {
  const n = Math.max(1, Math.floor(every));
  const ranges: PageRange[] = [];
  for (let from = 1; from <= pageCount; from += n) {
    ranges.push({ from, to: Math.min(pageCount, from + n - 1) });
  }
  return ranges;
}

async function extractPages(src: PDFDocument, indices: number[]) {
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  pages.forEach((p) => out.addPage(p));
  return out.save();
}

const rangeIndices = (r: PageRange) =>
  Array.from({ length: r.to - r.from + 1 }, (_, i) => r.from - 1 + i);

/** One output PDF per range, or a single PDF containing all ranges when merge is true. */
export async function splitPdf(bytes: Uint8Array, ranges: PageRange[], merge = false) {
  const src = await loadPdf(bytes);
  if (merge) {
    return [{ range: ranges, bytes: await extractPages(src, ranges.flatMap(rangeIndices)) }];
  }
  const outputs: { range: PageRange[]; bytes: Uint8Array }[] = [];
  for (const r of ranges) {
    outputs.push({ range: [r], bytes: await extractPages(src, rangeIndices(r)) });
  }
  return outputs;
}

export const describeRange = (r: PageRange) => (r.from === r.to ? `${r.from}` : `${r.from}-${r.to}`);

/** Adds `angle` (a multiple of 90) to each page's current rotation. */
export async function rotatePdf(bytes: Uint8Array, angle: number, pageIndices?: number[]) {
  const doc = await loadPdf(bytes);
  const targets = new Set(pageIndices ?? doc.getPageIndices());
  doc.getPages().forEach((page, i) => {
    if (!targets.has(i)) return;
    const current = page.getRotation().angle;
    page.setRotation(degrees((((current + angle) % 360) + 360) % 360));
  });
  return doc.save();
}
