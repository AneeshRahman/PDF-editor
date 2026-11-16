/**
 * A small, private usage counter kept in this browser only (localStorage). Nothing is
 * sent anywhere: it just lets the home page show how much you have edited on this device.
 */

export interface UsageStats {
  /** PDFs produced by any tool on this device. */
  files: number;
  /** Total size of the PDFs those edits started from, in bytes. */
  bytes: number;
}

const KEY = "pdf-editor:stats";
const EVENT = "pdf-editor:stats";

export function getStats(): UsageStats {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw && typeof raw.files === "number" && typeof raw.bytes === "number") return raw;
  } catch {
    // storage blocked or corrupt: start from zero
  }
  return { files: 0, bytes: 0 };
}

/** Records finished edits. Safe to call even when storage is unavailable. */
export function recordEdit(files: number, bytes: number) {
  const next = { files: getStats().files + files, bytes: getStats().bytes + bytes };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // private mode etc.: the count just won't persist
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Calls `fn` whenever the stats change (in this tab or another one). */
export function onStatsChange(fn: () => void) {
  const storage = (e: StorageEvent) => e.key === KEY && fn();
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", storage);
  };
}
