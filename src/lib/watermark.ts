/**
 * Watermark detection and removal on raw pixels.
 *
 * Shared by the live preview (on the on-screen canvas) and the export (on a high-res
 * render), so what you see is what you get. All sizes are given in PDF points and
 * converted with `pxPerPt`, so results match at any zoom.
 *
 * Model: a watermark is treated as a see-through layer of colour `mark` over paper of
 * colour `paper`. Removing it divides that layer back out, per channel:
 *
 *     original = observed * paper / mark      (clamped to paper)
 *
 * so watermark-over-paper becomes paper, while text under or over the watermark keeps
 * its darkness and its smooth anti-aliased edges.
 */

export type RGB = [number, number, number];

/** A rectangle as fractions (0..1) of the displayed page, top-left origin. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A brush stroke: points as page fractions, radius as a fraction of the page width. */
export interface Stroke {
  points: { x: number; y: number }[];
  radius: number;
}

/** Where on a page cleaning is allowed. */
export type Region = { kind: "rect"; rect: Rect } | { kind: "strokes"; strokes: Stroke[] } | { kind: "page" };

export interface WatermarkColors {
  mark: RGB;
  paper: RGB;
  /** Rough half-width of the watermark's strokes, in points. */
  strokeHalfPt: number;
}

export interface CleanOptions {
  /** Only change watermark-coloured pixels (keeps text). Off = paint the whole region with paper. */
  keepText: boolean;
  /** 0..1: how far a pixel's colour may stray from the watermark's and still count. */
  tolerance: number;
}

/** A cleaned piece of the page: transparent everywhere except the pixels that changed. */
export interface Patch {
  x: number;
  y: number;
  image: ImageData;
}

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/* ------------------------------------------------------------------ */
/* Masks                                                                */
/* ------------------------------------------------------------------ */

/** Rasterises regions into a 0/1 mask the size of the image. */
export function regionMask(w: number, h: number, regions: Region[]): Uint8Array {
  const mask = new Uint8Array(w * h);
  const strokes: Stroke[] = [];

  for (const r of regions) {
    if (r.kind === "page") {
      mask.fill(1);
      return mask;
    }
    if (r.kind === "strokes") {
      strokes.push(...r.strokes);
      continue;
    }
    const x0 = Math.max(0, Math.floor(r.rect.x * w));
    const y0 = Math.max(0, Math.floor(r.rect.y * h));
    const x1 = Math.min(w, Math.ceil((r.rect.x + r.rect.w) * w));
    const y1 = Math.min(h, Math.ceil((r.rect.y + r.rect.h) * h));
    for (let y = y0; y < y1; y++) mask.fill(1, y * w + x0, y * w + x1);
  }

  if (strokes.length) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.strokeStyle = "#000";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of strokes) {
      if (!s.points.length) continue;
      ctx.lineWidth = Math.max(1, s.radius * 2 * w);
      ctx.beginPath();
      ctx.moveTo(s.points[0].x * w, s.points[0].y * h);
      for (const p of s.points) ctx.lineTo(p.x * w, p.y * h);
      if (s.points.length === 1) ctx.lineTo(s.points[0].x * w + 0.01, s.points[0].y * h);
      ctx.stroke();
    }
    const d = ctx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < mask.length; i++) if (d[i * 4 + 3] > 127) mask[i] = 1;
  }
  return mask;
}

/** Square-window binary dilate/erode, separable, O(pixels) regardless of radius. */
function morph(src: Uint8Array, w: number, h: number, r: number, op: "dilate" | "erode"): Uint8Array {
  if (r <= 0) return src;
  const pass = (input: Uint8Array, horizontal: boolean): Uint8Array => {
    const out = new Uint8Array(input.length);
    const lines = horizontal ? h : w;
    const len = horizontal ? w : h;
    const at = (line: number, k: number) => (horizontal ? line * w + k : k * w + line);
    for (let line = 0; line < lines; line++) {
      let count = 0;
      for (let k = 0; k < Math.min(r, len); k++) count += input[at(line, k)];
      for (let k = 0; k < len; k++) {
        if (k + r < len) count += input[at(line, k + r)];
        if (k - r - 1 >= 0) count -= input[at(line, k - r - 1)];
        const window = Math.min(len - 1, k + r) - Math.max(0, k - r) + 1;
        out[at(line, k)] = op === "dilate" ? (count > 0 ? 1 : 0) : count === window ? 1 : 0;
      }
    }
    return out;
  };
  return pass(pass(src, true), false);
}

/** Flood fill from `seeds`, through pixels set in `within` (8-connected). */
function reconstruct(seeds: Uint8Array, within: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(within.length);
  const stack = new Int32Array(within.length);
  let top = 0;
  for (let p = 0; p < seeds.length; p++) {
    if (seeds[p] && within[p]) {
      out[p] = 1;
      stack[top++] = p;
    }
  }
  while (top > 0) {
    const p = stack[--top];
    const x = p % w;
    const y = (p - x) / w;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= w) continue;
        const q = ny * w + nx;
        if (within[q] && !out[q]) {
          out[q] = 1;
          stack[top++] = q;
        }
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Colour estimation                                                    */
/* ------------------------------------------------------------------ */

/** The page's paper colour: the most common light colour. */
export function estimatePaper(img: ImageData): RGB {
  const bins = new Float64Array(64 * 4); // per bin: count, r, g, b
  const d = img.data;
  const step = Math.max(1, Math.floor(Math.sqrt((img.width * img.height) / 200000)));
  for (let y = 0; y < img.height; y += step) {
    for (let x = 0; x < img.width; x += step) {
      const i = (y * img.width + x) * 4;
      const l = lum(d[i], d[i + 1], d[i + 2]);
      if (l < 100) continue;
      const b = Math.min(63, Math.floor(l / 4)) * 4;
      bins[b]++;
      bins[b + 1] += d[i];
      bins[b + 2] += d[i + 1];
      bins[b + 3] += d[i + 2];
    }
  }
  let best = -1;
  for (let b = 0; b < bins.length; b += 4) if (best < 0 || bins[b] > bins[best]) best = b;
  if (best < 0 || bins[best] === 0) return [255, 255, 255];
  const n = bins[best];
  return [bins[best + 1] / n, bins[best + 2] / n, bins[best + 3] / n];
}

/**
 * Learns the watermark's colour from the pixels the user marked (brushed or boxed):
 * the most common colour that is clearly darker than the paper but not near-black text.
 */
export function estimateColors(img: ImageData, sample: Uint8Array, pxPerPt: number): WatermarkColors | null {
  const paper = estimatePaper(img);
  const paperLum = lum(...paper);
  const d = img.data;
  const bins = new Float64Array(43 * 4);
  let total = 0;
  for (let p = 0; p < sample.length; p++) {
    if (!sample[p]) continue;
    const i = p * 4;
    const l = lum(d[i], d[i + 1], d[i + 2]);
    if (l > paperLum - 18 || l < 35) continue;
    const b = Math.floor(l / 6) * 4;
    bins[b]++;
    bins[b + 1] += d[i];
    bins[b + 2] += d[i + 1];
    bins[b + 3] += d[i + 2];
    total++;
  }
  if (total < 20) return null;

  // Mode bin, merged with its neighbours for a stable average.
  let best = 0;
  for (let b = 0; b < bins.length; b += 4) if (bins[b] > bins[best]) best = b;
  let n = 0,
    r = 0,
    g = 0,
    bl = 0;
  for (const b of [best - 4, best, best + 4]) {
    if (b < 0 || b >= bins.length) continue;
    n += bins[b];
    r += bins[b + 1];
    g += bins[b + 2];
    bl += bins[b + 3];
  }
  const mark: RGB = [r / n, g / n, bl / n];

  // Estimate stroke thickness (area / perimeter ~ half-width for long shapes).
  const cand = candidateMask(img, { mark, paper, strokeHalfPt: 0 }, 0.5);
  let area = 0,
    edge = 0;
  const w = img.width;
  for (let p = 0; p < sample.length; p++) {
    if (!sample[p] || !cand[p]) continue;
    area++;
    const x = p % w;
    if (x === 0 || x === w - 1 || !cand[p - 1] || !cand[p + 1] || !cand[p - w] || !cand[p + w]) edge++;
  }
  const strokeHalfPt = edge ? area / edge / pxPerPt : 0;
  return { mark, paper, strokeHalfPt };
}

/** Pixels whose colour lies on the line between watermark and paper (the watermark and its soft edges). */
function candidateMask(img: ImageData, colors: WatermarkColors, tolerance: number): Uint8Array {
  const { mark: M, paper: P } = colors;
  const D = [P[0] - M[0], P[1] - M[1], P[2] - M[2]];
  const dd = D[0] * D[0] + D[1] * D[1] + D[2] * D[2];
  const out = new Uint8Array(img.width * img.height);
  if (dd < 100) return out; // watermark is indistinguishable from paper
  const tol = 10 + tolerance * 50;
  const tol2 = tol * tol;
  const d = img.data;
  for (let p = 0; p < out.length; p++) {
    const i = p * 4;
    const v0 = d[i] - M[0],
      v1 = d[i + 1] - M[1],
      v2 = d[i + 2] - M[2];
    const t = (v0 * D[0] + v1 * D[1] + v2 * D[2]) / dd;
    if (t > 0.85 || t < -0.3) continue; // paper, or clearly darker than the watermark (text)
    const tc = Math.max(0, t);
    const e0 = v0 - tc * D[0],
      e1 = v1 - tc * D[1],
      e2 = v2 - tc * D[2];
    if (e0 * e0 + e1 * e1 + e2 * e2 <= tol2) out[p] = 1;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Cleaning                                                             */
/* ------------------------------------------------------------------ */

/**
 * Builds the cleaned patch for one page image. Returns null when nothing would change.
 * `colors` is required when keepText is on.
 */
export function cleanPage(
  img: ImageData,
  regions: Region[],
  colors: WatermarkColors | null,
  opts: CleanOptions,
  pxPerPt: number
): Patch | null {
  const { width: w, height: h } = img;
  if (!regions.length) return null;
  const mask: Uint8Array = regionMask(w, h, regions);

  if (opts.keepText) {
    if (!colors) return null;
    let cand: Uint8Array = candidateMask(img, colors, opts.tolerance);
    // The soft edges of ordinary text share the watermark's grey, so thin candidate shapes
    // are suspect. Keep only candidates connected to a thick watermark stroke: thick parts
    // (those surviving an erosion) seed a flood fill through the candidates. This keeps thin
    // slivers of watermark squeezed between letters, but drops text edges elsewhere.
    const open = Math.min(Math.round(colors.strokeHalfPt * 0.5 * pxPerPt), Math.round(1 * pxPerPt));
    if (open > 0) cand = reconstruct(morph(cand, w, h, open, "erode"), cand, w, h);
    // Grow a little to take in the watermark's own soft edge and text that crosses it.
    cand = morph(cand, w, h, Math.max(1, Math.round(0.6 * pxPerPt)), "dilate");
    for (let p = 0; p < mask.length; p++) mask[p] &= cand[p];
  }

  // Bounding box of what will change.
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (!mask[row + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  if (x1 < 0) return null;

  const paper = colors?.paper ?? estimatePaper(img);
  const M = colors?.mark;
  const pw = x1 - x0 + 1;
  const ph = y1 - y0 + 1;
  const patch = new ImageData(pw, ph);
  const s = img.data;
  const o = patch.data;
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const p = (y + y0) * w + (x + x0);
      if (!mask[p]) continue; // stays transparent: the original shows through untouched
      const i = p * 4;
      const j = (y * pw + x) * 4;
      if (opts.keepText && M) {
        for (let c = 0; c < 3; c++) {
          o[j + c] = Math.min(paper[c], (s[i + c] * paper[c]) / Math.max(1, M[c]));
        }
      } else {
        o[j] = paper[0];
        o[j + 1] = paper[1];
        o[j + 2] = paper[2];
      }
      o[j + 3] = 255;
    }
  }
  return { x: x0, y: y0, image: patch };
}

/** Learns watermark colours from a rendered page and the regions the user marked on it. */
export function colorsFromRegions(img: ImageData, regions: Region[], pxPerPt: number) {
  return estimateColors(img, regionMask(img.width, img.height, regions), pxPerPt);
}
