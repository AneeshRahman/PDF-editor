/**
 * "Add watermark": a text or image stamp, placed by a centre point or tiled (mosaic).
 *
 * The same layout code drives the live preview (SVG over the page) and the export
 * (pdf-lib), and text is measured with the PDF's own font metrics, so the preview
 * matches the saved file.
 */
import { PDFDocument, PDFName, PDFArray, StandardFontEmbedder, StandardFonts, degrees, rgb, type PDFPage } from "pdf-lib";

export type StampFont = "Helvetica" | "Times" | "Courier";

export interface StampSpec {
  kind: "text" | "image";
  text: string;
  font: StampFont;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** Font size in points. */
  size: number;
  /** "#rrggbb" */
  color: string;
  image: { url: string; bytes: Uint8Array; type: "png" | "jpg"; width: number; height: number } | null;
  /** Image width as a fraction of the page width. */
  imageScale: number;
  /** 0..1 */
  opacity: number;
  /** Degrees, counter-clockwise (45 = rising diagonal). */
  rotation: number;
  /** Centre of the stamp as page fractions (top-left origin). */
  position: { x: number; y: number };
  /** Repeat across the whole page. */
  mosaic: boolean;
  /** Draw underneath the page's content instead of on top. */
  below: boolean;
  /** 0-based page indices it goes on (null = all). */
  pages: number[] | null;
}

export const DEFAULT_STAMP: StampSpec = {
  kind: "text",
  text: "CONFIDENTIAL",
  font: "Helvetica",
  bold: true,
  italic: false,
  underline: false,
  size: 54,
  color: "#d32f2f",
  image: null,
  imageScale: 0.35,
  opacity: 0.35,
  rotation: 45,
  position: { x: 0.5, y: 0.5 },
  mosaic: false,
  below: false,
  pages: null,
};

export const isStampEmpty = (s: StampSpec) => (s.kind === "text" ? !s.text.trim() : !s.image);

/* ------------------------------------------------------------------ */
/* Fonts                                                                */
/* ------------------------------------------------------------------ */

export function pdfFontName(s: Pick<StampSpec, "font" | "bold" | "italic">): StandardFonts {
  const { font, bold, italic } = s;
  if (font === "Times") {
    return bold && italic ? StandardFonts.TimesRomanBoldItalic : bold ? StandardFonts.TimesRomanBold : italic ? StandardFonts.TimesRomanItalic : StandardFonts.TimesRoman;
  }
  if (font === "Courier") {
    return bold && italic ? StandardFonts.CourierBoldOblique : bold ? StandardFonts.CourierBold : italic ? StandardFonts.CourierOblique : StandardFonts.Courier;
  }
  return bold && italic ? StandardFonts.HelveticaBoldOblique : bold ? StandardFonts.HelveticaBold : italic ? StandardFonts.HelveticaOblique : StandardFonts.Helvetica;
}

export const cssFontFamily = (f: StampFont) =>
  f === "Times" ? '"Times New Roman", Times, serif' : f === "Courier" ? '"Courier New", Courier, monospace' : "Helvetica, Arial, sans-serif";

const metricsCache = new Map<string, StandardFontEmbedder>();
const embedderFor = (name: StandardFonts) => {
  let e = metricsCache.get(name);
  if (!e) metricsCache.set(name, (e = StandardFontEmbedder.for(name as unknown as Parameters<typeof StandardFontEmbedder.for>[0])));
  return e;
};

/* ------------------------------------------------------------------ */
/* Layout                                                               */
/* ------------------------------------------------------------------ */

/** Size of the stamp's box in points (before rotation). */
export function stampSize(s: StampSpec, pageW: number): { w: number; h: number } {
  if (s.kind === "text") {
    const w = embedderFor(pdfFontName(s)).widthOfTextAtSize(s.text || " ", s.size);
    return { w, h: s.size };
  }
  if (!s.image) return { w: 0, h: 0 };
  const w = pageW * s.imageScale;
  return { w, h: (w * s.image.height) / s.image.width };
}

/** Centres (in points, top-left origin) where the stamp is drawn on a page. */
export function stampCenters(s: StampSpec, pageW: number, pageH: number): { x: number; y: number }[] {
  if (!s.mosaic) return [{ x: s.position.x * pageW, y: s.position.y * pageH }];
  const { w, h } = stampSize(s, pageW);
  // Spacing from the rotated box, with breathing room.
  const r = (s.rotation * Math.PI) / 180;
  const bw = Math.abs(w * Math.cos(r)) + Math.abs(h * Math.sin(r));
  const bh = Math.abs(w * Math.sin(r)) + Math.abs(h * Math.cos(r));
  const dx = Math.max(bw * 1.3, 60);
  const dy = Math.max(bh * 1.6, 60);
  const out: { x: number; y: number }[] = [];
  let row = 0;
  for (let y = dy / 2; y < pageH + dy / 2; y += dy, row++) {
    const shift = row % 2 ? dx / 2 : 0; // brick pattern
    for (let x = dx / 2 - shift; x < pageW + dx / 2; x += dx) out.push({ x, y });
  }
  return out;
}

export const appliesToPage = (s: StampSpec, page: number) => !s.pages || s.pages.includes(page);

/** 3x3 grid positions, with a margin from the edges. */
export const GRID_POSITIONS = [0.18, 0.5, 0.82];

/* ------------------------------------------------------------------ */
/* Export                                                               */
/* ------------------------------------------------------------------ */

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/** Rotates (dx, dy) counter-clockwise by `deg` (PDF, y-up). */
const rot = (dx: number, dy: number, deg: number) => {
  const r = (deg * Math.PI) / 180;
  return { x: dx * Math.cos(r) - dy * Math.sin(r), y: dx * Math.sin(r) + dy * Math.cos(r) };
};

/** Moves whatever was just drawn on `page` underneath the page's original content. */
function sendNewContentToBack(page: PDFPage, before: Set<string>) {
  const contents = page.node.Contents();
  if (!(contents instanceof PDFArray)) return;
  const all = contents.asArray();
  const added = all.filter((r) => !before.has(r.toString()));
  const rest = all.filter((r) => before.has(r.toString()));
  page.node.set(PDFName.of("Contents"), page.doc.context.obj([...added, ...rest]));
}

export async function addStamp(bytes: Uint8Array, s: StampSpec): Promise<Uint8Array> {
  if (isStampEmpty(s)) return bytes;
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = s.kind === "text" ? await doc.embedFont(pdfFontName(s)) : null;
  const image = s.kind === "image" && s.image ? await (s.image.type === "png" ? doc.embedPng(s.image.bytes) : doc.embedJpg(s.image.bytes)) : null;
  const color = hexToRgb(s.color);

  doc.getPages().forEach((page, index) => {
    if (!appliesToPage(s, index)) return;
    const { width: W, height: H } = page.getSize();
    const { w, h } = stampSize(s, W);
    // Remember the existing content streams so "below" can reorder afterwards.
    page.node.normalize();
    const contents = page.node.Contents();
    const before = new Set((contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : []).map((r) => r.toString()));

    for (const c of stampCenters(s, W, H)) {
      const cx = c.x;
      const cy = H - c.y; // to PDF's bottom-left origin
      if (font) {
        // Baseline sits 0.35 * size below the visual centre (matches the SVG preview).
        const o = rot(-w / 2, -0.35 * s.size, s.rotation);
        page.drawText(s.text, {
          x: cx + o.x,
          y: cy + o.y,
          size: s.size,
          font,
          color,
          opacity: s.opacity,
          rotate: degrees(s.rotation),
        });
        if (s.underline) {
          const a = rot(-w / 2, -0.47 * s.size, s.rotation);
          const b = rot(w / 2, -0.47 * s.size, s.rotation);
          page.drawLine({
            start: { x: cx + a.x, y: cy + a.y },
            end: { x: cx + b.x, y: cy + b.y },
            thickness: Math.max(0.5, s.size * 0.06),
            color,
            opacity: s.opacity,
          });
        }
      } else if (image) {
        const o = rot(-w / 2, -h / 2, s.rotation);
        page.drawImage(image, { x: cx + o.x, y: cy + o.y, width: w, height: h, opacity: s.opacity, rotate: degrees(s.rotation) });
      }
    }
    if (s.below) sendNewContentToBack(page, before);
  });
  return doc.save();
}

/** Width in points of `text` in a standard font (same metrics the PDF export uses). */
export const measureText = (s: Pick<StampSpec, "font" | "bold" | "italic">, text: string, size: number) =>
  embedderFor(pdfFontName(s)).widthOfTextAtSize(text || " ", size);
