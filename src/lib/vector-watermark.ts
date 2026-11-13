/**
 * Removes a watermark from a PDF's own drawing instructions (its content streams),
 * instead of painting over it. Works when the watermark is vector text or shapes, which
 * is how most tools add one. Text is never touched, so it stays pixel-perfect.
 *
 * What gets removed on the chosen pages:
 *  - Acrobat-style watermark blocks: marked content `/Artifact <</Subtype /Watermark>>`.
 *  - Watermark annotations (`/Subtype /Watermark`).
 *  - Any fill or stroke whose on-screen colour (after its transparency over the paper)
 *    matches the watermark colour the user picked. Paths are ended without painting
 *    (`n`); text is made invisible (render mode 3) so the text positions after it
 *    stay correct.
 * Form XObjects (reusable drawings, often used for watermarks) are processed too.
 */
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
  type PDFObject,
} from "pdf-lib";
import type { RGB } from "./watermark";

export interface VectorRemovalResult {
  bytes: Uint8Array;
  /** Drawing operations (or blocks/annotations) removed, per 0-based page index. */
  removed: Record<number, number>;
  total: number;
}

/* ------------------------------------------------------------------ */
/* Tokenizer                                                            */
/* ------------------------------------------------------------------ */

type Operand = number | string | null; // numbers; names as "/Name"; anything else as null

interface Op {
  start: number;
  end: number;
  op: string;
  operands: Operand[];
  /** Raw text of the operands (used to inspect BDC property dictionaries). */
  raw: string;
}

const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set("()<>[]{}/%".split("").map((c) => c.charCodeAt(0)));

/** Splits a content stream into operations. Works on a latin1 string (1 char = 1 byte). */
export function tokenize(s: string): Op[] {
  const ops: Op[] = [];
  let i = 0;
  let operands: Operand[] = [];
  let opStart = -1;
  const n = s.length;
  const code = (k: number) => s.charCodeAt(k);

  const begin = (k: number) => {
    if (opStart < 0) opStart = k;
  };

  while (i < n) {
    const c = code(i);
    if (WS.has(c)) {
      i++;
      continue;
    }
    if (c === 37 /* % */) {
      while (i < n && code(i) !== 10 && code(i) !== 13) i++;
      continue;
    }
    begin(i);
    if (c === 40 /* ( */) {
      // literal string with nesting and escapes
      let depth = 1;
      i++;
      while (i < n && depth > 0) {
        const d = code(i);
        if (d === 92 /* \ */) i += 2;
        else {
          if (d === 40) depth++;
          else if (d === 41) depth--;
          i++;
        }
      }
      operands.push(null);
      continue;
    }
    if (c === 60 /* < */) {
      if (code(i + 1) === 60) {
        // dictionary: skip to the matching >>, respecting nesting and strings
        let depth = 0;
        while (i < n) {
          if (code(i) === 60 && code(i + 1) === 60) {
            depth++;
            i += 2;
          } else if (code(i) === 62 && code(i + 1) === 62) {
            depth--;
            i += 2;
            if (depth === 0) break;
          } else if (code(i) === 40) {
            let d = 1;
            i++;
            while (i < n && d > 0) {
              const e = code(i);
              if (e === 92) i += 2;
              else {
                if (e === 40) d++;
                else if (e === 41) d--;
                i++;
              }
            }
          } else i++;
        }
        operands.push(null);
        continue;
      }
      while (i < n && code(i) !== 62) i++; // hex string
      i++;
      operands.push(null);
      continue;
    }
    if (c === 91 /* [ */ || c === 93 /* ] */ || c === 123 || c === 125) {
      i++;
      operands.push(null);
      continue;
    }
    if (c === 47 /* / */) {
      let j = i + 1;
      while (j < n && !WS.has(code(j)) && !DELIM.has(code(j))) j++;
      operands.push(s.slice(i, j));
      i = j;
      continue;
    }
    // number or keyword
    let j = i;
    while (j < n && !WS.has(code(j)) && !DELIM.has(code(j))) j++;
    if (j === i) {
      i++; // stray delimiter (e.g. ">" or ")"): skip
      continue;
    }
    const word = s.slice(i, j);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) {
      operands.push(parseFloat(word));
      i = j;
      continue;
    }
    if (word === "true" || word === "false" || word === "null") {
      operands.push(null);
      i = j;
      continue;
    }
    // An operator.
    let end = j;
    if (word === "BI") {
      // Inline image: skip binary data up to "EI" surrounded by whitespace.
      let k = j;
      const idAt = s.indexOf("ID", k);
      k = idAt < 0 ? n : idAt + 3;
      while (k < n) {
        if (code(k) === 69 && code(k + 1) === 73 && WS.has(code(k - 1)) && (k + 2 >= n || WS.has(code(k + 2)))) {
          k += 2;
          break;
        }
        k++;
      }
      end = k;
    }
    ops.push({ start: opStart, end, op: word === "BI" ? "BI" : word, operands, raw: s.slice(opStart, i) });
    operands = [];
    opStart = -1;
    i = end;
  }
  return ops;
}

/* ------------------------------------------------------------------ */
/* Graphics state                                                       */
/* ------------------------------------------------------------------ */

type ColorKind = "gray" | "rgb" | "cmyk" | "unknown";

interface GState {
  fill: RGB | null;
  stroke: RGB | null;
  fillCS: ColorKind;
  strokeCS: ColorKind;
  fillAlpha: number;
  strokeAlpha: number;
  textMode: number;
}

const initialState = (): GState => ({
  fill: [0, 0, 0],
  stroke: [0, 0, 0],
  fillCS: "gray",
  strokeCS: "gray",
  fillAlpha: 1,
  strokeAlpha: 1,
  textMode: 0,
});

const nums = (ops: Operand[]) => ops.filter((o): o is number => typeof o === "number");

function toRGB(kind: ColorKind, v: number[]): RGB | null {
  if (kind === "unknown") kind = v.length === 1 ? "gray" : v.length === 3 ? "rgb" : v.length === 4 ? "cmyk" : "unknown";
  if (kind === "gray" && v.length >= 1) return [v[0] * 255, v[0] * 255, v[0] * 255];
  if (kind === "rgb" && v.length >= 3) return [v[0] * 255, v[1] * 255, v[2] * 255];
  if (kind === "cmyk" && v.length >= 4) {
    const k = 1 - v[3];
    return [255 * (1 - v[0]) * k, 255 * (1 - v[1]) * k, 255 * (1 - v[2]) * k];
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Resources                                                            */
/* ------------------------------------------------------------------ */

function lookupDict(doc: PDFDocument, obj: PDFObject | undefined): PDFDict | undefined {
  const o = obj instanceof PDFRef ? doc.context.lookup(obj) : obj;
  return o instanceof PDFDict ? o : undefined;
}

function resourceEntry(doc: PDFDocument, resources: PDFDict | undefined, kind: string, name: string) {
  const group = lookupDict(doc, resources?.get(PDFName.of(kind)));
  if (!group) return undefined;
  const v = group.get(PDFName.of(name.slice(1)));
  return v instanceof PDFRef ? doc.context.lookup(v) : v;
}

function colorSpaceKind(doc: PDFDocument, resources: PDFDict | undefined, name: string): ColorKind {
  if (name === "/DeviceGray" || name === "/G" || name === "/CalGray") return "gray";
  if (name === "/DeviceRGB" || name === "/RGB" || name === "/CalRGB") return "rgb";
  if (name === "/DeviceCMYK" || name === "/CMYK") return "cmyk";
  const cs = resourceEntry(doc, resources, "ColorSpace", name);
  if (cs instanceof PDFArray) {
    const family = cs.get(0);
    if (family instanceof PDFName && family.asString() === "/ICCBased") {
      const stream = doc.context.lookup(cs.get(1));
      const nObj = stream instanceof PDFRawStream ? stream.dict.get(PDFName.of("N")) : undefined;
      const N = nObj instanceof PDFNumber ? nObj.asNumber() : 0;
      return N === 1 ? "gray" : N === 3 ? "rgb" : N === 4 ? "cmyk" : "unknown";
    }
    if (family instanceof PDFName && family.asString() === "/CalRGB") return "rgb";
    if (family instanceof PDFName && family.asString() === "/CalGray") return "gray";
  }
  return "unknown";
}

const streamText = (stream: PDFRawStream) => {
  const bytes = decodePDFRawStream(stream).decode();
  let out = "";
  for (let k = 0; k < bytes.length; k += 0x8000) out += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return out;
};

const toBytes = (s: string) => {
  const b = new Uint8Array(s.length);
  for (let k = 0; k < s.length; k++) b[k] = s.charCodeAt(k) & 0xff;
  return b;
};

/* ------------------------------------------------------------------ */
/* Rewriting                                                            */
/* ------------------------------------------------------------------ */

interface Matcher {
  mark: RGB;
  paper: RGB;
  tolerance: number; // RGB distance
}

/** On-screen colour of `color` drawn with `alpha` over the paper. */
const shown = (color: RGB, alpha: number, paper: RGB): RGB => [
  paper[0] * (1 - alpha) + color[0] * alpha,
  paper[1] * (1 - alpha) + color[1] * alpha,
  paper[2] * (1 - alpha) + color[2] * alpha,
];

const near = (a: RGB, b: RGB, tol: number) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= tol;

interface RewriteContext {
  doc: PDFDocument;
  m: Matcher;
  /** Forms already rewritten (shared between pages). */
  doneForms: Set<PDFObject>;
}

/** Rewrites one content stream. Returns the new text and how many things were removed. */
function rewrite(ctx: RewriteContext, text: string, resources: PDFDict | undefined, start: GState): { text: string; removed: number } {
  const ops = tokenize(text);
  const edits: { start: number; end: number; replace: string }[] = [];
  const stack: GState[] = [];
  let gs: GState = { ...start };
  let removed = 0;
  let artifactDepth = -1; // marked-content depth where a watermark block started
  let artifactStart = -1;
  let mcDepth = 0;
  let qAtArtifact = 0;
  let btAtArtifact = 0;
  let qDepth = 0;
  let inText = false;

  const fillMatches = () => gs.fill && near(shown(gs.fill, gs.fillAlpha, ctx.m.paper), ctx.m.mark, ctx.m.tolerance);
  const strokeMatches = () => gs.stroke && near(shown(gs.stroke, gs.strokeAlpha, ctx.m.paper), ctx.m.mark, ctx.m.tolerance);

  for (const o of ops) {
    const v = o.operands;
    switch (o.op) {
      case "q":
        stack.push({ ...gs });
        qDepth++;
        break;
      case "Q":
        gs = stack.pop() ?? gs;
        qDepth = Math.max(0, qDepth - 1);
        break;
      case "BT":
        inText = true;
        break;
      case "ET":
        inText = false;
        break;
      case "g":
        gs.fillCS = "gray";
        gs.fill = toRGB("gray", nums(v));
        break;
      case "G":
        gs.strokeCS = "gray";
        gs.stroke = toRGB("gray", nums(v));
        break;
      case "rg":
        gs.fillCS = "rgb";
        gs.fill = toRGB("rgb", nums(v));
        break;
      case "RG":
        gs.strokeCS = "rgb";
        gs.stroke = toRGB("rgb", nums(v));
        break;
      case "k":
        gs.fillCS = "cmyk";
        gs.fill = toRGB("cmyk", nums(v));
        break;
      case "K":
        gs.strokeCS = "cmyk";
        gs.stroke = toRGB("cmyk", nums(v));
        break;
      case "cs":
        gs.fillCS = typeof v[0] === "string" ? colorSpaceKind(ctx.doc, resources, v[0]) : "unknown";
        gs.fill = gs.fillCS === "unknown" ? null : [0, 0, 0];
        break;
      case "CS":
        gs.strokeCS = typeof v[0] === "string" ? colorSpaceKind(ctx.doc, resources, v[0]) : "unknown";
        gs.stroke = gs.strokeCS === "unknown" ? null : [0, 0, 0];
        break;
      case "sc":
      case "scn":
        gs.fill = toRGB(gs.fillCS, nums(v));
        break;
      case "SC":
      case "SCN":
        gs.stroke = toRGB(gs.strokeCS, nums(v));
        break;
      case "gs": {
        const ext = typeof v[0] === "string" ? resourceEntry(ctx.doc, resources, "ExtGState", v[0]) : undefined;
        if (ext instanceof PDFDict) {
          const ca = ext.get(PDFName.of("ca"));
          const CA = ext.get(PDFName.of("CA"));
          if (ca instanceof PDFNumber) gs.fillAlpha = ca.asNumber();
          if (CA instanceof PDFNumber) gs.strokeAlpha = CA.asNumber();
        }
        break;
      }
      case "Tr":
        if (typeof v[0] === "number") gs.textMode = v[0];
        break;

      /* Marked content: whole Acrobat-style watermark blocks. */
      case "BDC":
      case "BMC":
        mcDepth++;
        if (artifactDepth < 0 && o.op === "BDC" && /\/Watermark\b/.test(o.raw) && /\/Artifact\b/.test(o.raw)) {
          artifactDepth = mcDepth;
          artifactStart = o.start;
          qAtArtifact = qDepth;
          btAtArtifact = inText ? 1 : 0;
        }
        break;
      case "EMC":
        if (artifactDepth === mcDepth) {
          // Only drop it when the block is self-contained (balanced q/Q and BT/ET).
          if (qDepth === qAtArtifact && (inText ? 1 : 0) === btAtArtifact) {
            edits.push({ start: artifactStart, end: o.end, replace: " " });
            removed++;
          }
          artifactDepth = -1;
        }
        mcDepth = Math.max(0, mcDepth - 1);
        break;

      /* Paths */
      case "f":
      case "F":
      case "f*":
        if (fillMatches()) {
          edits.push({ start: o.start, end: o.end, replace: "n" });
          removed++;
        }
        break;
      case "S":
      case "s":
        if (strokeMatches()) {
          edits.push({ start: o.start, end: o.end, replace: o.op === "s" ? "h n" : "n" });
          removed++;
        }
        break;
      case "B":
      case "B*":
      case "b":
      case "b*": {
        const f = fillMatches();
        const st = strokeMatches();
        if (f || st) {
          const close = o.op.startsWith("b") ? "h " : "";
          const keep = f && st ? "n" : f ? "S" : o.op.includes("*") ? "f*" : "f";
          edits.push({ start: o.start, end: o.end, replace: close + keep });
          removed++;
        }
        break;
      }

      /* Text: make matching text invisible (keeps text positions after it intact). */
      case "Tj":
      case "TJ":
      case "'":
      case '"': {
        const mode = gs.textMode;
        const fills = [0, 2, 4, 6].includes(mode);
        const strokes = [1, 2, 5, 6].includes(mode);
        const hit = (fills && fillMatches()) || (strokes && strokeMatches());
        const allHit = (!fills || fillMatches()) && (!strokes || strokeMatches());
        if (hit && allHit && mode !== 3 && mode !== 7) {
          const body = text.slice(o.start, o.end);
          edits.push({ start: o.start, end: o.end, replace: `3 Tr ${body} ${mode} Tr` });
          removed++;
        }
        break;
      }

      /* Reusable drawings */
      case "Do": {
        if (typeof v[0] !== "string") break;
        const x = resourceEntry(ctx.doc, resources, "XObject", v[0]);
        if (!(x instanceof PDFRawStream)) break;
        const sub = x.dict.get(PDFName.of("Subtype"));
        if (!(sub instanceof PDFName) || sub.asString() !== "/Form" || ctx.doneForms.has(x)) break;
        ctx.doneForms.add(x);
        const formRes = lookupDict(ctx.doc, x.dict.get(PDFName.of("Resources"))) ?? resources;
        const r = rewrite(ctx, streamText(x), formRes, gs);
        if (r.removed) {
          const replacement = ctx.doc.context.flateStream(toBytes(r.text));
          // Keep the form's own entries (BBox, Matrix, Resources...), replace the data.
          for (const [key, val] of x.dict.entries()) {
            const k = key.asString();
            if (k !== "/Filter" && k !== "/Length" && k !== "/DecodeParms") replacement.dict.set(key, val);
          }
          const ref = ctx.doc.context.getObjectRef(x);
          if (ref) ctx.doc.context.assign(ref, replacement);
          removed += r.removed;
        }
        break;
      }
    }
  }

  if (!edits.length) return { text, removed };
  edits.sort((a, b) => a.start - b.start);
  let out = "";
  let at = 0;
  for (const e of edits) {
    if (e.start < at) continue; // overlapping (inside a removed block)
    out += text.slice(at, e.start) + e.replace;
    at = e.end;
  }
  return { text: out + text.slice(at), removed };
}

/* ------------------------------------------------------------------ */
/* Entry point                                                          */
/* ------------------------------------------------------------------ */

/**
 * Removes vector watermark drawing from the given pages.
 * `tolerance` is 0..1 (same scale as the raster tool's colour tolerance).
 */
export async function removeVectorWatermark(
  bytes: Uint8Array,
  pages: number[],
  colors: { mark: RGB; paper: RGB },
  tolerance: number
): Promise<VectorRemovalResult> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const ctx: RewriteContext = {
    doc,
    m: { mark: colors.mark, paper: colors.paper, tolerance: 14 + tolerance * 36 },
    doneForms: new Set(),
  };
  const removed: Record<number, number> = {};
  let total = 0;

  for (const index of pages) {
    if (index < 0 || index >= doc.getPageCount()) continue;
    const page = doc.getPage(index);
    let count = 0;

    // Watermark annotations.
    const annots = page.node.Annots();
    if (annots) {
      for (let k = annots.size() - 1; k >= 0; k--) {
        const a = lookupDict(doc, annots.get(k));
        const sub = a?.get(PDFName.of("Subtype"));
        if (sub instanceof PDFName && sub.asString() === "/Watermark") {
          annots.remove(k);
          count++;
        }
      }
    }

    // Content streams (one stream or an array of them, drawn as one).
    const contents = page.node.Contents();
    const parts: PDFRawStream[] = [];
    if (contents instanceof PDFRawStream) parts.push(contents);
    else if (contents instanceof PDFArray) {
      for (let k = 0; k < contents.size(); k++) {
        const s = doc.context.lookup(contents.get(k));
        if (s instanceof PDFRawStream) parts.push(s);
      }
    }
    if (parts.length) {
      const text = parts.map(streamText).join("\n");
      const r = rewrite(ctx, text, page.node.Resources(), initialState());
      if (r.removed) {
        page.node.set(PDFName.of("Contents"), doc.context.register(doc.context.flateStream(toBytes(r.text))));
        count += r.removed;
      }
    }

    if (count) {
      removed[index] = count;
      total += count;
    }
  }

  return { bytes: total ? await doc.save() : bytes, removed, total };
}
