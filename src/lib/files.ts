import { saveAs } from "file-saver";
import JSZip from "jszip";
import { getPageCount } from "./pdf-operations";

/** A PDF the user added, ready for a tool to work on. */
export interface LoadedPdf {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
}

/** What a tool produces. */
export interface OutputFile {
  name: string;
  bytes: Uint8Array;
}

export interface ToolOutput {
  files: OutputFile[];
  /** Total size of the inputs, for the before/after comparison. */
  inputSize: number;
}

let nextId = 0;
const newId = () => `f${Date.now().toString(36)}-${nextId++}`;

export const isPdfFile = (file: File) =>
  file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

export async function loadPdfFile(file: File): Promise<LoadedPdf> {
  if (!isPdfFile(file)) throw new Error(`${file.name} is not a PDF`);
  // No size limit: everything stays on the device, so the only ceiling is its memory.
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new Error(`${file.name} is too large for this browser to open (the device ran out of memory).`);
  }
  try {
    return { id: newId(), name: file.name, bytes, pageCount: await getPageCount(bytes) };
  } catch {
    throw new Error(`${file.name} could not be read. It may be damaged or password-protected.`);
  }
}

export async function toLoadedPdf(file: OutputFile): Promise<LoadedPdf> {
  return { id: newId(), name: file.name, bytes: file.bytes, pageCount: await getPageCount(file.bytes) };
}

export const baseName = (name: string) => name.replace(/\.pdf$/i, "");

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const pdfBlob = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: "application/pdf" });

export function downloadFile(file: OutputFile) {
  saveAs(pdfBlob(file.bytes), file.name);
}

/** One file downloads as-is; several are zipped. */
export async function downloadAll(files: OutputFile[], zipName: string) {
  if (files.length === 1) return downloadFile(files[0]);
  const zip = new JSZip();
  const used = new Set<string>();
  for (const f of files) {
    let name = f.name;
    for (let i = 2; used.has(name); i++) name = `${baseName(f.name)} (${i}).pdf`;
    used.add(name);
    zip.file(name, f.bytes);
  }
  saveAs(await zip.generateAsync({ type: "blob" }), zipName);
}

/* ------------------------------------------------------------------ */
/* Hand-off: lets "Continue with another tool" carry a result across   */
/* pages without re-uploading.                                          */
/* ------------------------------------------------------------------ */

let handoff: LoadedPdf[] | null = null;

export function setHandoff(files: LoadedPdf[]) {
  handoff = files;
}

/** Read without clearing: safe inside a state initializer, which React may call twice. */
export function peekHandoff() {
  return handoff;
}

export function clearHandoff() {
  handoff = null;
}
