import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Copy, FilePlus2, Plus, RotateCcw, RotateCw, Trash2, Undo2 } from "lucide-react";
import { PDFDocument, degrees } from "pdf-lib";
import { Button } from "../ui/button";
import type { ToolPanelProps } from "./panels";
import { baseName, isPdfFile } from "../../lib/files";
import { loadPdf } from "../../lib/pdf-operations";
import { loadPdfjsDocument, type PdfjsDocument } from "../../lib/pdfjs";
import { cn } from "../../lib/utils";

/* ------------------------------------------------------------------ */
/* State shared by the page grid (workspace) and the side panel         */
/* ------------------------------------------------------------------ */

interface Source {
  name: string;
  bytes: Uint8Array;
}

interface PageItem {
  key: string;
  /** Index into `sources`, or -1 for a blank page. */
  src: number;
  /** Page index within the source (unused for blank pages). */
  page: number;
  /** Extra rotation added by the user. */
  rotation: number;
  /** Displayed size in points (after the page's own rotation). */
  w: number;
  h: number;
}

interface OrganizeState {
  sources: Source[];
  items: PageItem[];
  original: PageItem[];
  selected: string | null;
}

let keySeq = 0;
const newKey = () => `p${keySeq++}`;

async function pagesOf(bytes: Uint8Array, src: number): Promise<PageItem[]> {
  const doc = await loadPdf(bytes);
  return doc.getPages().map((p, page) => {
    const { width, height } = p.getSize();
    const sideways = p.getRotation().angle % 180 !== 0;
    return { key: newKey(), src, page, rotation: 0, w: sideways ? height : width, h: sideways ? width : height };
  });
}

function useOrganize({ files, shared, setShared }: ToolPanelProps) {
  const state = shared as OrganizeState | null;
  const file = files[0];
  const started = useRef(false);

  useEffect(() => {
    if (state || started.current) return;
    started.current = true;
    pagesOf(file.bytes, 0).then((items) =>
      setShared?.({ sources: [{ name: file.name, bytes: file.bytes }], items, original: items, selected: null } satisfies OrganizeState)
    );
  }, [state, file, setShared]);

  const update = (fn: (s: OrganizeState) => OrganizeState) => setShared?.((prev: unknown) => (prev ? fn(prev as OrganizeState) : prev));
  return { state, update };
}

/* ------------------------------------------------------------------ */
/* Thumbnails (pdf.js), rendered only when scrolled into view           */
/* ------------------------------------------------------------------ */

const docCache = new WeakMap<Uint8Array, Promise<PdfjsDocument>>();
const docFor = (bytes: Uint8Array) => {
  let d = docCache.get(bytes);
  if (!d) docCache.set(bytes, (d = loadPdfjsDocument(bytes)));
  return d;
};

const THUMB = 132; // CSS px, longest side

const PageThumb = ({ source, page, w, h }: { source: Source; page: number; w: number; h: number }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const scale = THUMB / Math.max(w, h);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    const io = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      try {
        const doc = await docFor(source.bytes);
        const p = await doc.getPage(page + 1);
        const vp = p.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
        if (cancelled) return;
        canvas.width = Math.ceil(vp.width);
        canvas.height = Math.ceil(vp.height);
        await p.render({ canvasContext: canvas.getContext("2d")!, viewport: vp, canvas }).promise;
      } catch {
        // leave the blank card
      }
    });
    io.observe(canvas);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [source, page, scale]);
  return <canvas ref={ref} className="block bg-white" style={{ width: w * scale, height: h * scale }} />;
};

/* ------------------------------------------------------------------ */
/* Workspace: the page grid                                             */
/* ------------------------------------------------------------------ */

const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
};

export const OrganizeWorkspace = (props: ToolPanelProps) => {
  const { state, update } = useOrganize(props);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  if (!state) {
    return <div className="flex h-64 items-center justify-center border border-border text-sm text-muted-foreground">Reading pages…</div>;
  }

  const act = (key: string, fn: (items: PageItem[], i: number) => PageItem[]) =>
    update((s) => {
      const i = s.items.findIndex((it) => it.key === key);
      return i < 0 ? s : { ...s, items: fn(s.items, i) };
    });

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] border-l border-t border-border" data-testid="page-grid">
      {state.items.map((it, i) => {
        const selected = state.selected === it.key;
        const sideways = it.rotation % 180 !== 0;
        const boxW = (sideways ? it.h : it.w) * (THUMB / Math.max(it.w, it.h));
        const boxH = (sideways ? it.w : it.h) * (THUMB / Math.max(it.w, it.h));
        return (
          <div
            key={it.key}
            data-testid="page-card"
            draggable
            onClick={() => update((s) => ({ ...s, selected: s.selected === it.key ? null : it.key }))}
            onDragStart={(e) => {
              setDrag(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (drag === null) return;
              e.preventDefault();
              setOver(i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (drag !== null && drag !== i) update((s) => ({ ...s, items: move(s.items, drag, i) }));
              setDrag(null);
              setOver(null);
            }}
            onDragEnd={() => {
              setDrag(null);
              setOver(null);
            }}
            className={cn(
              "group relative flex cursor-grab flex-col items-center gap-3 border-b border-r border-border bg-background p-4 transition-colors active:cursor-grabbing",
              selected && "bg-card ring-2 ring-inset ring-foreground",
              drag === i && "opacity-40",
              over === i && drag !== i && "ring-2 ring-inset ring-brand"
            )}
          >
            <div className="flex w-full items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <span className="label-mono truncate pl-2">
                {it.src < 0 ? "Blank" : it.src > 0 ? state.sources[it.src].name.replace(/\.pdf$/i, "") : ""}
              </span>
            </div>
            <div className="flex h-[150px] items-center justify-center">
              <div className="flex items-center justify-center" style={{ width: boxW, height: boxH }}>
                <div className="shadow-sm transition-transform" style={{ transform: `rotate(${it.rotation}deg)` }}>
                  {it.src < 0 ? (
                    <div className="border border-border bg-white" style={{ width: it.w * (THUMB / Math.max(it.w, it.h)), height: it.h * (THUMB / Math.max(it.w, it.h)) }} />
                  ) : (
                    <PageThumb source={state.sources[it.src]} page={it.page} w={it.w} h={it.h} />
                  )}
                </div>
              </div>
            </div>
            {/* Page actions */}
            <div className="flex flex-wrap justify-center gap-0.5 transition-opacity can-hover:opacity-0 focus-within:opacity-100 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
              {[
                { label: "Move left", icon: ChevronLeft, off: i === 0, fn: () => act(it.key, (l, j) => move(l, j, j - 1)) },
                { label: "Rotate left", icon: RotateCcw, fn: () => act(it.key, (l, j) => l.map((x, k) => (k === j ? { ...x, rotation: (x.rotation + 270) % 360 } : x))) },
                { label: "Rotate right", icon: RotateCw, fn: () => act(it.key, (l, j) => l.map((x, k) => (k === j ? { ...x, rotation: (x.rotation + 90) % 360 } : x))) },
                { label: "Duplicate", icon: Copy, fn: () => act(it.key, (l, j) => [...l.slice(0, j + 1), { ...l[j], key: newKey() }, ...l.slice(j + 1)]) },
                { label: "Delete page", icon: Trash2, off: state.items.length === 1, fn: () => act(it.key, (l, j) => l.filter((_, k) => k !== j)) },
                { label: "Move right", icon: ChevronRight, off: i === state.items.length - 1, fn: () => act(it.key, (l, j) => move(l, j, j + 1)) },
              ].map(({ label, icon: Icon, off, fn }) => (
                <button
                  key={label}
                  type="button"
                  title={label}
                  aria-label={`${label} (page ${i + 1})`}
                  disabled={off}
                  onClick={fn}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 can-hover:p-1"
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() =>
          update((s) => {
            const last = s.items[s.items.length - 1];
            return { ...s, items: [...s.items, { key: newKey(), src: -1, page: 0, rotation: 0, w: last?.w ?? 595, h: last?.h ?? 842 }] };
          })
        }
        className="flex min-h-[230px] flex-col items-center justify-center gap-2 border-b border-r border-dashed border-border text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
      >
        <Plus className="h-6 w-6" />
        Add blank page
      </button>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Side panel                                                           */
/* ------------------------------------------------------------------ */

async function buildPdf(state: OrganizeState) {
  const out = await PDFDocument.create();
  const docs = await Promise.all(state.sources.map((s) => loadPdf(s.bytes)));
  for (const it of state.items) {
    if (it.src < 0) {
      const page = out.addPage([it.w, it.h]);
      if (it.rotation) page.setRotation(degrees(it.rotation));
      continue;
    }
    const [page] = await out.copyPages(docs[it.src], [it.page]);
    page.setRotation(degrees((page.getRotation().angle + it.rotation) % 360));
    out.addPage(page);
  }
  return out.save();
}

export const OrganizePanel = (props: ToolPanelProps) => {
  const { files, process } = props;
  const { state, update } = useOrganize(props);
  const addRef = useRef<HTMLInputElement>(null);
  if (!state) return null;

  const at = state.selected ? state.items.findIndex((i) => i.key === state.selected) + 1 : state.items.length;
  const changed =
    state.items.length !== state.original.length ||
    state.items.some((it, i) => it.key !== state.original[i]?.key || it.rotation !== 0);

  const insertBlank = () =>
    update((s) => {
      const ref = s.items[Math.max(0, at - 1)];
      const blank: PageItem = { key: newKey(), src: -1, page: 0, rotation: 0, w: ref?.w ?? 595, h: ref?.h ?? 842 };
      return { ...s, items: [...s.items.slice(0, at), blank, ...s.items.slice(at)], selected: blank.key };
    });

  const insertPdf = async (file: File | undefined) => {
    if (!file) return;
    if (!isPdfFile(file)) return toast.error("Please choose a PDF");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const src = state.sources.length;
      const pages = await pagesOf(bytes, src);
      update((s) => ({
        ...s,
        sources: [...s.sources, { name: file.name, bytes }],
        items: [...s.items.slice(0, at), ...pages, ...s.items.slice(at)],
      }));
      toast.success(`Added ${pages.length} page${pages.length === 1 ? "" : "s"} from ${file.name}`);
    } catch {
      toast.error(`${file.name} could not be read`);
    }
  };

  return (
    <div className="space-y-5 rounded-lg border border-border bg-card p-5">
      <div className="flex items-baseline justify-between rounded-md border border-border bg-background px-4 py-3">
        <span className="label-mono">Pages</span>
        <span className="font-mono text-lg tabular-nums" data-testid="page-total">
          {state.items.length}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Drag pages to reorder. Hover a page to rotate, duplicate or delete it. Click a page to insert new pages after it.
      </p>

      <div className="space-y-2">
        <p className="label-mono">Insert {state.selected ? `after page ${at}` : "at the end"}</p>
        <Button variant="outline" className="w-full justify-start" onClick={insertBlank}>
          <Plus className="mr-2 h-4 w-4" /> Blank page
        </Button>
        <Button variant="outline" className="w-full justify-start" onClick={() => addRef.current?.click()}>
          <FilePlus2 className="mr-2 h-4 w-4" /> Pages from another PDF
        </Button>
        <input
          ref={addRef}
          type="file"
          accept=".pdf,application/pdf"
          className="sr-only"
          aria-label="Add pages from a PDF"
          onChange={(e) => {
            insertPdf(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <div className="flex gap-2">
          <Button
            variant="outline"
            title="Undo all changes"
            disabled={!changed}
            onClick={() => update((s) => ({ ...s, items: s.original, selected: null }))}
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            className="flex-1"
            disabled={!changed}
            onClick={() => process(async () => [{ name: `${baseName(files[0].name)}_organized.pdf`, bytes: await buildPdf(state) }])}
          >
            Save organized PDF
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Pages are copied as they are, so text stays sharp and selectable.</p>
      </div>
    </div>
  );
};
