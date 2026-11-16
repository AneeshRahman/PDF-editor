/**
 * Colour adjustments for "Adjust Colors". One pixel function drives both the live
 * preview and the export, so the saved PDF looks exactly like the preview.
 */

export type ColorMode = "color" | "grayscale" | "bw";

export interface ColorSettings {
  /** -100..100 */
  brightness: number;
  /** -100..100 */
  contrast: number;
  /** -100..100 (colour mode only; -100 = no colour) */
  saturation: number;
  mode: ColorMode;
  /** Black & white cut-off, 0..255: lighter than this becomes white. */
  threshold: number;
  invert: boolean;
}

export const DEFAULT_COLORS: ColorSettings = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  mode: "color",
  threshold: 160,
  invert: false,
};

export const PRESETS: { id: string; label: string; settings: ColorSettings }[] = [
  { id: "original", label: "Original", settings: DEFAULT_COLORS },
  { id: "grayscale", label: "Grayscale", settings: { ...DEFAULT_COLORS, mode: "grayscale" } },
  { id: "bw", label: "Black & white", settings: { ...DEFAULT_COLORS, mode: "bw" } },
  { id: "invert", label: "Invert", settings: { ...DEFAULT_COLORS, invert: true } },
  { id: "night", label: "Night mode", settings: { ...DEFAULT_COLORS, mode: "grayscale", invert: true, contrast: -10 } },
  { id: "vivid", label: "Vivid", settings: { ...DEFAULT_COLORS, contrast: 20, saturation: 45 } },
  { id: "print", label: "Ink saver", settings: { ...DEFAULT_COLORS, brightness: 18, contrast: -12, saturation: -40 } },
];

export const sameSettings = (a: ColorSettings, b: ColorSettings) =>
  (Object.keys(a) as (keyof ColorSettings)[]).every((k) => a[k] === b[k]);

export const isUnchanged = (s: ColorSettings) => sameSettings(s, DEFAULT_COLORS);

/** Adjusts RGBA pixels in place. */
export function adjustPixels(d: Uint8ClampedArray, s: ColorSettings) {
  const bright = s.brightness * 1.28; // ±128
  const c = s.contrast * 2.55;
  const contrast = (259 * (c + 255)) / (255 * (259 - c)); // standard contrast curve
  const sat = 1 + s.saturation / 100;

  // Lookup table for brightness + contrast (same curve for every channel).
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = contrast * (v + bright - 128) + 128;

  for (let i = 0; i < d.length; i += 4) {
    let r = lut[d[i]];
    let g = lut[d[i + 1]];
    let b = lut[d[i + 2]];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;

    if (s.mode === "grayscale") {
      r = g = b = l;
    } else if (s.mode === "bw") {
      r = g = b = l >= s.threshold ? 255 : 0;
    } else if (sat !== 1) {
      r = l + (r - l) * sat;
      g = l + (g - l) * sat;
      b = l + (b - l) * sat;
    }
    if (s.invert) {
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    }
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
}
