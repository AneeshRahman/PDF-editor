/**
 * Edit PDF: find the existing text (with its font, size and colours), then write edits.
 *
 * Existing text can't be retyped in its original font (PDFs usually embed only the letters
 * already used), so an edit covers the old text with its background colour and draws the
 * new text in the closest standard font at the same size, position and colour.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { loadPdfjsDocument } from "./pdfjs";
import { pdfFontName, type StampFont } from "./stamp";
import type { ProgressCallback } from "./pdf-operations";

/** A piece of existing text on a page. Positions are in points, top-left origin. */
export interface TextRun {
  id: string;
  page: number;
  str: string;
  x: number;
  /** Top of the text box. */
  top: number;
  /** Baseline, from the top. */
  baseline: number;
  w: number;
  h: number;
  size: number;
  /** Real font name from the PDF, cleaned up, e.g. "Calibri Bold". */
  fontName: string;
  /** Whether only part of the font is embedded (letters already used). */
  subset: boolean;
  /** Closest standard font for re-typing. */
  family: StampFont;
  bold: boolean;
  italic: boolean;
  /** "#rrggbb" */
  color: string;
  background: string;
}

/** Page geometry needed to convert top-left points back to PDF space. */
export interface PageBox {
  w: number;
  h: number;
  /** PDF-space x of the left edge and y of the top edge. */
  ox: number;
  oy: number;
  /** Text on rotated pages isn't editable. */
  rotated: boolean;
}

const hex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

function guessFamily(name: string): StampFont {
  if (/times|serif|georgia|garamond|cambria|minion|book ?antiqua|palatino/i.test(name) && !/sans/i.test(name)) return "Times";
  if (/courier|mono|consol|menlo/i.test(name)) return "Courier";
  return "Helvetica";
}

const cleanFontName = (raw: string) =>
  raw
    .replace(/^[A-Z]{6}\+/, "")
    .replace(/[-_,]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\bMT\b|\bPS\b/g, "")
    .replace(/\s+/g, " ")
    .trim() || "Unknown font";

/** Background = median of the box's edge pixels; text = average of the pixels most unlike it. */
function sampleColors(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const W = Math.max(1, Math.round(w));
  const H = Math.max(1, Math.round(h));
  const d = ctx.getImageData(Math.round(x), Math.round(y), W, H).data;
  const edge: number[][] = [];
  for (let i = 0; i < W; i++) edge.push([...d.slice(i * 4, i * 4 + 3)], [...d.slice(((H - 1) * W + i) * 4, ((H - 1) * W + i) * 4 + 3)]);
  const lum = (c: number[]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  edge.sort((a, b) => lum(a) - lum(b));
  const bg = edge[Math.floor(edge.length / 2)] ?? [255, 255, 255];
  let maxDist = 0;
  const dist: number[] = [];
  for (let i = 0; i < d.length; i += 4) {
    const dd = Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]);
    dist.push(dd);
    if (dd > maxDist) maxDist = dd;
  }
  let n = 0,
    r = 0,
    g = 0,
    b = 0;
  for (let p = 0; p < dist.length; p++) {
    if (dist[p] >= maxDist * 0.7 && maxDist > 30) {
      r += d[p * 4];
      g += d[p * 4 + 1];
      b += d[p * 4 + 2];
      n++;
    }
  }
  return { color: n ? hex(r / n, g / n, b / n) : "#000000", background: hex(bg[0], bg[1], bg[2]) };
}

/** Finds the text on every page, with font, size and colours. */
export async function extractText(bytes: Uint8Array, onProgress?: ProgressCallback) {
  const doc = await loadPdfjsDocument(bytes);
  const runs: TextRun[] = [];
  const boxes: PageBox[] = [];
  const SCALE = 2;
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const [vx0, , , vy1] = page.view;
      const rotated = page.rotate % 360 !== 0;
      boxes.push({ w: vp.width, h: vp.height, ox: vx0, oy: vy1, rotated });
      if (rotated) {
        onProgress?.(p, doc.numPages);
        continue;
      }

      // Render once to sample colours (also loads the fonts into commonObjs).
      const big = page.getViewport({ scale: SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(big.width);
      canvas.height = Math.ceil(big.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: big, canvas }).promise;

      const content = await page.getTextContent();
      let k = 0;
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const [a, b, , , e, f] = item.transform as number[];
        if (Math.abs(b) > 0.01 || a <= 0) continue; // rotated or mirrored text: not editable
        const size = Math.hypot(a, b);
        const [x, baseline] = vp.convertToViewportPoint(e, f);
        const w = item.width;
        const top = baseline - size * 0.88;
        const h = size * 1.12;

        let raw = "";
        let fontBold = false;
        let fontItalic = false;
        try {
          const font = page.commonObjs.get(item.fontName) as { name?: string; bold?: boolean; black?: boolean; italic?: boolean };
          raw = font?.name ?? "";
          fontBold = !!(font?.bold || font?.black);
          fontItalic = !!font?.italic;
        } catch {
          raw = content.styles[item.fontName]?.fontFamily ?? "";
        }
        const name = cleanFontName(raw);
        const colors = sampleColors(ctx, x * SCALE, top * SCALE, w * SCALE, h * SCALE);
        runs.push({
          id: `p${p - 1}-${k++}`,
          page: p - 1,
          str: item.str,
          x,
          top,
          baseline,
          w,
          h,
          size: Math.round(size * 10) / 10,
          fontName: name,
          subset: /^[A-Z]{6}\+/.test(raw),
          family: guessFamily(name),
          bold: fontBold || /bold|black|heavy|semibold|demi/i.test(name),
          italic: fontItalic || /italic|oblique/i.test(name),
          ...colors,
        });
      }
      page.cleanup();
      onProgress?.(p, doc.numPages);
    }
  } finally {
    await doc.destroy();
  }
  return { runs, boxes };
}

/* ------------------------------------------------------------------ */
/* Edits                                                                */
/* ------------------------------------------------------------------ */

export interface TextStyle {
  font: StampFont;
  bold: boolean;
  italic: boolean;
  size: number;
  color: string;
}

/** A change to an existing run: new text and/or style, or deleted. */
export interface RunEdit extends TextStyle {
  text: string;
  deleted: boolean;
}

export type ShapeKind = "rect" | "ellipse" | "line";

export type EditObject =
  | ({ id: string; kind: "text"; page: number; x: number; baseline: number; text: string } & TextStyle)
  | {
      id: string;
      kind: ShapeKind;
      page: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stroke: string | null;
      fill: string | null;
      strokeWidth: number;
      opacity: number;
    };

const toRgb = (h: string) => {
  const n = parseInt(h.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/** Standard fonts only cover Western European letters; anything else becomes "?". */
const safeText = (font: PDFFont, text: string) => {
  try {
    font.encodeText(text);
    return text;
  } catch {
    return [...text].map((ch) => {
      try {
        font.encodeText(ch);
        return ch;
      } catch {
        return "?";
      }
    }).join("");
  }
};

export async function applyEdits(
  bytes: Uint8Array,
  runs: TextRun[],
  boxes: PageBox[],
  runEdits: Record<string, RunEdit>,
  objects: EditObject[]
) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const fonts = new Map<StandardFonts, PDFFont>();
  const fontFor = async (s: TextStyle) => {
    const name = pdfFontName(s);
    if (!fonts.has(name)) fonts.set(name, await doc.embedFont(name));
    return fonts.get(name)!;
  };
  // Top-left points -> PDF space for a page.
  const X = (p: number, x: number) => boxes[p].ox + x;
  const Y = (p: number, y: number) => boxes[p].oy - y;

  for (const run of runs) {
    const e = runEdits[run.id];
    if (!e) continue;
    const page = doc.getPage(run.page);
    // Cover the original text with its own background colour.
    page.drawRectangle({
      x: X(run.page, run.x - 1),
      y: Y(run.page, run.top + run.h + 1),
      width: run.w + 2,
      height: run.h + 2,
      color: toRgb(run.background),
    });
    if (!e.deleted && e.text.trim()) {
      const font = await fontFor(e);
      page.drawText(safeText(font, e.text), {
        x: X(run.page, run.x),
        y: Y(run.page, run.baseline),
        size: e.size,
        font,
        color: toRgb(e.color),
      });
    }
  }

  for (const o of objects) {
    const page = doc.getPage(o.page);
    if (o.kind === "text") {
      if (!o.text.trim()) continue;
      const font = await fontFor(o);
      page.drawText(safeText(font, o.text), { x: X(o.page, o.x), y: Y(o.page, o.baseline), size: o.size, font, color: toRgb(o.color) });
      continue;
    }
    const x = Math.min(o.x1, o.x2);
    const y = Math.min(o.y1, o.y2);
    const w = Math.abs(o.x2 - o.x1);
    const h = Math.abs(o.y2 - o.y1);
    const stroke = o.stroke ? { borderColor: toRgb(o.stroke), borderWidth: o.strokeWidth, borderOpacity: o.opacity } : {};
    const fill = o.fill ? { color: toRgb(o.fill), opacity: o.opacity } : {};
    if (o.kind === "rect") {
      page.drawRectangle({ x: X(o.page, x), y: Y(o.page, y + h), width: w, height: h, ...stroke, ...fill });
    } else if (o.kind === "ellipse") {
      page.drawEllipse({ x: X(o.page, x + w / 2), y: Y(o.page, y + h / 2), xScale: w / 2, yScale: h / 2, ...stroke, ...fill });
    } else {
      page.drawLine({
        start: { x: X(o.page, o.x1), y: Y(o.page, o.y1) },
        end: { x: X(o.page, o.x2), y: Y(o.page, o.y2) },
        thickness: o.strokeWidth,
        color: toRgb(o.stroke ?? "#000000"),
        opacity: o.opacity,
      });
    }
  }
  return doc.save();
}
