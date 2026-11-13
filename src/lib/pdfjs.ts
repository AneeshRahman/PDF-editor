import * as pdfjsLib from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

let sharedWorker: pdfjsLib.PDFWorker | null = null;

/**
 * One pdf.js worker for the whole app, created on first use.
 * It is passed explicitly to getDocument() so that destroying a document
 * does not tear down the worker other documents are still using.
 */
function getWorker() {
  if (!sharedWorker || sharedWorker.destroyed) {
    sharedWorker = pdfjsLib.PDFWorker.create({ port: new PdfWorker() });
  }
  return sharedWorker;
}

/** Loads a PDF with pdf.js. The bytes are copied because pdf.js detaches the buffer it is given. */
export function loadPdfjsDocument(bytes: Uint8Array) {
  return pdfjsLib.getDocument({ data: new Uint8Array(bytes), worker: getWorker(), verbosity: 0 }).promise;
}

export type PdfjsDocument = Awaited<ReturnType<typeof loadPdfjsDocument>>;
