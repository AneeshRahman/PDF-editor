import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Eye, Hand, Maximize, Minus, Plus, SquareSplitHorizontal } from "lucide-react";
import { loadPdfjsDocument, type PdfjsDocument } from "../lib/pdfjs";
import type { AreaSelection, Margins, PageRects } from "../lib/pdf-operations";
import { appliesToPage, cssFontFamily, stampCenters, stampSize, type StampSpec } from "../lib/stamp";
import type { Patch, Rect, Stroke } from "../lib/watermark";
import { cn } from "../lib/utils";

/* ------------------------------------------------------------------ */
/* Public types                                                         */
/* ------------------------------------------------------------------ */

export type CanvasTool = "none" | "box" | "brush" | "stamp";

/** A live pixel effect drawn over pages, e.g. the watermark-removal result. */
export interface PreviewEffect {
  /** Changes whenever the result would change, so pages get recomputed. */
  key: string;
  apply: (page: number, img: ImageData, pxPerPt: number) => Patch | null;
}

export interface PageStroke {
  page: number;
  stroke: Stroke;
}

/** What a tool panel can ask the preview to show. */
export interface PreviewOptions {
  tool?: CanvasTool;
  /** Brush diameter in PDF points. */
  brushSize?: number;
  highlights?: PageRects | null;
  effect?: PreviewEffect | null;
  /** CSS filter on the pages, e.g. "invert(1)" for a live invert preview. */
  cssFilter?: string;
  /** Shades what a crop will cut off. */
  cropMargins?: Margins | null;
  /** Live rotation preview, in degrees (multiple of 90). */
  rotation?: number;
  /** Show this document instead (e.g. a live, already-processed version). Zoom is kept. */
  pdfOverride?: Uint8Array | null;
  /** A watermark to add, drawn live on top (or, visually, underneath) the page. */
  stamp?: StampSpec | null;
  /** Offer the Before/After split slider. */
  compare?: boolean;
  /** With the "stamp" tool: the user clicked/dragged to place the watermark (page fractions). */
  onStampMove?: (position: { x: number; y: number }) => void;
}

interface PDFPreviewProps extends PreviewOptions {
  pdfData: Uint8Array | null;
  selection?: AreaSelection | null;
  onSelectionChange?: (selection: AreaSelection | null) => void;
  strokes?: PageStroke[];
  onStroke?: (stroke: PageStroke) => void;
  className?: string;
}

/* ------------------------------------------------------------------ */

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const PAD = 24; // px around the pages
const MAX_CANVAS_PIXELS = 16_000_000; // browsers cap canvas size; also bounds memory
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

interface PageEls {
  wrapper: HTMLDivElement;
  canvas: HTMLCanvasElement;
  fx: HTMLCanvasElement;
  /** The original document's page, for the "before" side of the split view. */
  orig: HTMLCanvasElement | null;
}

interface PageRenderState {
  scale: number;
  effectKey: string | null;
  origScale: number;
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

export const PDFPreview = ({
  pdfData,
  tool = "none",
  brushSize = 24,
  selection = null,
  onSelectionChange,
  strokes = [],
  onStroke,
  highlights = null,
  effect = null,
  cssFilter,
  cropMargins = null,
  rotation = 0,
  pdfOverride = null,
  stamp = null,
  compare = false,
  onStampMove,
  className,
}: PDFPreviewProps) => {
  const zoomSet = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfjsDocument | null>(null);
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const pageEls = useRef<(PageEls | null)[]>([]);
  const renderState = useRef<PageRenderState[]>([]);
  const [renderTick, setRenderTick] = useState(0);

  const [showResult, setShowResult] = useState(true);
  // "Hold for original" also swaps a processed document back to the original.
  const shownPdf = showResult && pdfOverride ? pdfOverride : pdfData;
  const [compareOn, setCompareOn] = useState(false);
  const [split, setSplit] = useState(0.5);
  const showCompare = compare && compareOn;
  // For the split view's "before" side when the shown document is a processed copy.
  const [origDoc, setOrigDoc] = useState<PdfjsDocument | null>(null);
  const needOrig = showCompare && !!pdfOverride && !!pdfData;
  useEffect(() => {
    if (!needOrig || !pdfData) return;
    let cancelled = false;
    let d: PdfjsDocument | null = null;
    loadPdfjsDocument(pdfData).then((doc) => {
      d = doc;
      if (cancelled) doc.destroy();
      else setOrigDoc(doc);
    });
    return () => {
      cancelled = true;
      setOrigDoc(null);
      renderState.current.forEach((st) => (st.origScale = 0));
      d?.destroy();
    };
  }, [needOrig, pdfData]);
  const [handTool, setHandTool] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const hovered = useRef(false);

  /* ----------------------------- Loading ---------------------------- */

  useEffect(() => {
    if (!shownPdf) return;
    let cancelled = false;
    let loaded: PdfjsDocument | null = null;
    (async () => {
      try {
        setError(null);
        const d = await loadPdfjsDocument(shownPdf);
        loaded = d;
        if (cancelled) return;
        const s: { w: number; h: number }[] = [];
        for (let i = 1; i <= d.numPages; i++) {
          const v = (await d.getPage(i)).getViewport({ scale: 1 });
          s.push({ w: v.width, h: v.height });
        }
        if (cancelled) return;
        renderState.current = s.map(() => ({ scale: 0, effectKey: null, origScale: 0 }));
        // Start at "fit width", but never above 100%. Swapping documents keeps the zoom.
        const el = scrollRef.current;
        if (el && !zoomSet.current) {
          zoomSet.current = true;
          const fit = (el.clientWidth - PAD * 2) / Math.max(...s.map((x) => x.w));
          const z = clampZoom(Math.min(1, fit));
          zoomRef.current = z;
          setZoom(z);
        }
        setSizes(s);
        setDoc(d);
      } catch (err) {
        if (!cancelled) {
          console.error("Error rendering PDF:", err);
          setError("Could not render this PDF.");
        }
      }
    })();
    return () => {
      cancelled = true;
      setDoc(null);
      loaded?.destroy();
    };
  }, [shownPdf]);

  /* ---------------------------- Rendering --------------------------- */

  // Re-render after zoom/scroll settles: sharp pages near the viewport, cheap ones elsewhere.
  useEffect(() => {
    if (!doc || !sizes.length) return;
    let cancelled = false;
    const tasks: { cancel: () => void }[] = [];

    const timer = setTimeout(async () => {
      const el = scrollRef.current;
      if (!el) return;
      const dpr = window.devicePixelRatio || 1;
      const view = el.getBoundingClientRect();
      const order = sizes
        .map((_, i) => {
          const r = pageEls.current[i]?.wrapper.getBoundingClientRect();
          const dist = !r ? Infinity : r.bottom < view.top ? view.top - r.bottom : r.top > view.bottom ? r.top - view.bottom : 0;
          return { i, dist };
        })
        .sort((a, b) => a.dist - b.dist);

      for (const { i, dist } of order) {
        if (cancelled) return;
        const els = pageEls.current[i];
        const st = renderState.current[i];
        if (!els || !st) continue;
        const near = dist < view.height;
        const { w, h } = sizes[i];
        const scale = Math.min(near ? zoom * dpr : Math.min(zoom * dpr, 0.75), Math.sqrt(MAX_CANVAS_PIXELS / (w * h)));

        if (Math.abs(st.scale - scale) > 0.01) {
          try {
            const page = await doc.getPage(i + 1);
            if (cancelled) return;
            const vp = page.getViewport({ scale });
            // Render off-screen first so the page never flashes blank.
            const off = document.createElement("canvas");
            off.width = Math.ceil(vp.width);
            off.height = Math.ceil(vp.height);
            const task = page.render({ canvasContext: off.getContext("2d")!, viewport: vp, canvas: off });
            tasks.push(task);
            await task.promise;
            if (cancelled) return;
            els.canvas.width = off.width;
            els.canvas.height = off.height;
            els.canvas.getContext("2d", { willReadFrequently: true })!.drawImage(off, 0, 0);
            st.scale = scale;
            st.effectKey = null;
          } catch (err) {
            if (cancelled) return;
            console.error(err);
            continue;
          }
        }

        // Live effect, computed for pages on or near the screen.
        const wantKey = effect ? `${effect.key}@${st.scale}` : null;
        if (wantKey !== st.effectKey && (near || !effect)) {
          const fxCtx = els.fx.getContext("2d")!;
          els.fx.width = els.canvas.width;
          els.fx.height = els.canvas.height;
          fxCtx.clearRect(0, 0, els.fx.width, els.fx.height);
          if (effect) {
            const ctx = els.canvas.getContext("2d", { willReadFrequently: true })!;
            const img = ctx.getImageData(0, 0, els.canvas.width, els.canvas.height);
            const patch = effect.apply(i, img, els.canvas.width / w);
            if (patch) fxCtx.putImageData(patch.image, patch.x, patch.y);
            await new Promise((r) => setTimeout(r)); // keep the UI responsive
          }
          st.effectKey = wantKey;
        }

        // "Before" side of the split view.
        if (origDoc && els.orig && near && i < origDoc.numPages && Math.abs(st.origScale - st.scale) > 0.01) {
          try {
            const page = await origDoc.getPage(i + 1);
            if (cancelled) return;
            const vp = page.getViewport({ scale: st.scale });
            const off = document.createElement("canvas");
            off.width = els.canvas.width;
            off.height = els.canvas.height;
            const task = page.render({ canvasContext: off.getContext("2d")!, viewport: vp, canvas: off });
            tasks.push(task);
            await task.promise;
            if (cancelled) return;
            els.orig.width = off.width;
            els.orig.height = off.height;
            els.orig.getContext("2d")!.drawImage(off, 0, 0);
            st.origScale = st.scale;
          } catch (err) {
            if (cancelled) return;
            console.error(err);
          }
        }
      }
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      tasks.forEach((t) => t.cancel());
    };
  }, [doc, sizes, zoom, renderTick, effect, origDoc]);

  /* ------------------------------ Zoom ------------------------------ */

  const anchor = useRef<{ px: number; py: number; cx: number; cy: number; ratio: number } | null>(null);

  /** Zooms keeping the point under (clientX, clientY) fixed, like Figma. */
  const zoomTo = useCallback((next: number, clientX?: number, clientY?: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const z = clampZoom(next);
    const prev = zoomRef.current;
    if (Math.abs(z - prev) < 1e-4) return;
    const rect = el.getBoundingClientRect();
    const cx = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const cy = (clientY ?? rect.top + rect.height / 2) - rect.top;
    anchor.current = { px: el.scrollLeft + cx, py: el.scrollTop + cy, cx, cy, ratio: z / prev };
    zoomRef.current = z;
    setZoom(z);
  }, []);

  useLayoutEffect(() => {
    const a = anchor.current;
    const el = scrollRef.current;
    if (!a || !el) return;
    el.scrollLeft = (a.px - PAD) * a.ratio + PAD - a.cx;
    el.scrollTop = (a.py - PAD) * a.ratio + PAD - a.cy;
    anchor.current = null;
  }, [zoom]);

  const fitWidth = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !sizes.length) return;
    const widest = Math.max(...sizes.map((s) => (rotation % 180 ? s.h : s.w)));
    zoomTo((el.clientWidth - PAD * 2) / widest);
  }, [sizes, rotation, zoomTo]);

  // Ctrl/⌘ + wheel (and trackpad pinch, which arrives as ctrl+wheel) zooms at the cursor.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const k = e.deltaMode === 1 ? 0.05 : 0.0025;
      zoomTo(zoomRef.current * Math.exp(-e.deltaY * k), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  // Keyboard: Ctrl/⌘ +, -, 0 and Space-to-pan, while the pointer is over the preview.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!hovered.current || isTyping(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === "Space") {
        e.preventDefault();
        setSpaceDown(true);
      } else if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        zoomTo(zoomRef.current * 1.25);
      } else if (mod && e.key === "-") {
        e.preventDefault();
        zoomTo(zoomRef.current / 1.25);
      } else if (mod && e.key === "0") {
        e.preventDefault();
        zoomTo(1);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [zoomTo]);

  /* ---------------------------- Pan / pinch ------------------------- */

  const pan = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const panMode = handTool || spaceDown || tool === "none";

  const pinchDistance = () => {
    const [a, b] = [...pointers.current.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  const onPointerDownCapture = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      pinch.current = { dist: pinchDistance().d, zoom: zoomRef.current };
      pan.current = null;
      e.stopPropagation();
      return;
    }
    const wantsPan = e.button === 1 || ((handTool || spaceDown || tool === "none") && e.pointerType === "mouse");
    if (!wantsPan) return;
    e.preventDefault();
    e.stopPropagation();
    scrollRef.current!.setPointerCapture(e.pointerId);
    pan.current = { x: e.clientX, y: e.clientY, sl: scrollRef.current!.scrollLeft, st: scrollRef.current!.scrollTop };
    setPanning(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const { d, mx, my } = pinchDistance();
      zoomTo(pinch.current.zoom * (d / pinch.current.dist), mx, my);
      return;
    }
    if (pan.current) {
      const el = scrollRef.current!;
      el.scrollLeft = pan.current.sl - (e.clientX - pan.current.x);
      el.scrollTop = pan.current.st - (e.clientY - pan.current.y);
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pan.current) {
      pan.current = null;
      setPanning(false);
    }
  };

  /* ------------------------------ Render ---------------------------- */

  const hasLivePreview = !!(effect || cssFilter || cropMargins || rotation || pdfOverride);
  const live = showResult;
  const rot = live ? ((rotation % 360) + 360) % 360 : 0;
  const filter = live ? cssFilter : undefined;
  // In the split view the result (effects, new watermark) shows right of the divider only.
  const afterClip = showCompare ? `inset(0 0 0 ${split * 100}%)` : undefined;

  return (
    <div className={cn("relative h-full w-full overflow-hidden rounded-lg bg-muted", className)}>
      <div
        ref={scrollRef}
        className={cn(
          "h-full w-full overflow-auto [touch-action:pan-x_pan-y]",
          panMode && (panning ? "cursor-grabbing" : "cursor-grab")
        )}
        onScroll={() => setRenderTick((t) => t + 1)}
        onPointerEnter={() => (hovered.current = true)}
        onPointerLeave={() => (hovered.current = false)}
        onPointerDownCapture={onPointerDownCapture}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onAuxClick={(e) => e.preventDefault()}
      >
        {error && <p className="py-8 text-center text-sm text-destructive">{error}</p>}
        <div className="flex w-max min-w-full flex-col items-center gap-4" style={{ padding: PAD, paddingBottom: PAD + 56 }}>
          {sizes.map(({ w, h }, i) => {
            const pw = w * zoom;
            const ph = h * zoom;
            const sideways = rot % 180 !== 0;
            // Brush strokes only show while painting.
            const pageStrokes = tool === "brush" ? strokes.filter((s) => s.page === i).map((s) => s.stroke) : [];
            return (
              <div
                key={i}
                data-page={i + 1}
                ref={(wrapper) => {
                  if (!wrapper) return;
                  const canvas = wrapper.querySelector<HTMLCanvasElement>("canvas[data-role=page]")!;
                  const fx = wrapper.querySelector<HTMLCanvasElement>("canvas[data-role=fx]")!;
                  const orig = wrapper.querySelector<HTMLCanvasElement>("canvas[data-role=orig]");
                  pageEls.current[i] = { wrapper, canvas, fx, orig };
                }}
                className="relative shrink-0"
                style={{ width: sideways ? ph : pw, height: sideways ? pw : ph }}
              >
                <div
                  className="absolute left-1/2 top-1/2 bg-white shadow-md transition-transform"
                  style={{ width: pw, height: ph, transform: `translate(-50%, -50%) rotate(${rot}deg)` }}
                >
                  <canvas data-role="page" className="absolute inset-0 h-full w-full" style={{ filter }} />
                  <canvas
                    data-role="fx"
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    style={{ filter, visibility: live ? "visible" : "hidden", clipPath: afterClip }}
                  />
                  {live && stamp && appliesToPage(stamp, i) && <StampOverlay w={w} h={h} s={stamp} clip={afterClip} />}
                  {/* "Before" side of the split view: the original page, left of the divider. */}
                  {needOrig && (
                    <canvas
                      data-role="orig"
                      className="pointer-events-none absolute inset-0 h-full w-full"
                      style={{ clipPath: `inset(0 ${(1 - split) * 100}% 0 0)` }}
                    />
                  )}
                  {live && cropMargins && <CropShade w={w} h={h} m={cropMargins} />}
                  <PageLayer
                    pageIndex={i}
                    pageW={w}
                    pageH={h}
                    tool={panMode ? "none" : tool}
                    brushSize={brushSize}
                    selection={selection?.page === i ? selection.rect : null}
                    strokes={pageStrokes}
                    highlights={highlights?.[i] ?? []}
                    onSelect={(rect) => onSelectionChange?.(rect ? { page: i, rect } : null)}
                    onStroke={(stroke) => onStroke?.({ page: i, stroke })}
                    onStampMove={onStampMove}
                  />
                  {showCompare && <SplitHandle split={split} onChange={setSplit} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating toolbar */}
      {sizes.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
          <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-border bg-background/95 p-1 shadow-lg backdrop-blur">
            {tool !== "none" && (
              <>
                <ToolbarButton active={handTool} onClick={() => setHandTool((v) => !v)} label="Pan (or hold Space)">
                  <Hand className="h-4 w-4" />
                </ToolbarButton>
                <Divider />
              </>
            )}
            <ToolbarButton onClick={() => zoomTo(zoom / 1.25)} label="Zoom out (Ctrl -)">
              <Minus className="h-4 w-4" />
            </ToolbarButton>
            <button
              type="button"
              onClick={() => zoomTo(1)}
              title="Reset to 100% (Ctrl 0)"
              className="h-8 min-w-[3.25rem] rounded-md px-1 text-xs font-medium tabular-nums hover:bg-muted"
            >
              {Math.round(zoom * 100)}%
            </button>
            <ToolbarButton onClick={() => zoomTo(zoom * 1.25)} label="Zoom in (Ctrl +)">
              <Plus className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton onClick={fitWidth} label="Fit width">
              <Maximize className="h-4 w-4" />
            </ToolbarButton>
            {compare && (
              <>
                <Divider />
                <button
                  type="button"
                  aria-pressed={compareOn}
                  title="Compare before and after"
                  onClick={() => setCompareOn((v) => !v)}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium hover:bg-muted",
                    compareOn && "bg-primary/10 text-primary"
                  )}
                >
                  <SquareSplitHorizontal className="h-4 w-4" />
                  <span className="hidden sm:inline">Before / After</span>
                </button>
              </>
            )}
            {hasLivePreview && !compare && (
              <>
                <Divider />
                <button
                  type="button"
                  title="Hold to see the original"
                  onPointerDown={() => setShowResult(false)}
                  onPointerUp={() => setShowResult(true)}
                  onPointerLeave={() => setShowResult(true)}
                  onKeyDown={(e) => (e.key === " " || e.key === "Enter") && setShowResult(false)}
                  onKeyUp={() => setShowResult(true)}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium hover:bg-muted",
                    !showResult && "bg-primary text-primary-foreground hover:bg-primary"
                  )}
                >
                  <Eye className="h-4 w-4" />
                  <span className="hidden sm:inline">Hold for original</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Pieces                                                               */
/* ------------------------------------------------------------------ */

const Divider = () => <span className="mx-0.5 h-5 w-px bg-border" />;

const ToolbarButton = ({
  children,
  onClick,
  label,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    aria-label={label}
    aria-pressed={active}
    className={cn(
      "flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-muted",
      active && "bg-primary/10 text-primary"
    )}
  >
    {children}
  </button>
);

/** The watermark being added, as SVG so it stays sharp at any zoom. */
const StampOverlay = ({ w, h, s, clip }: { w: number; h: number; s: StampSpec; clip?: string }) => {
  const size = stampSize(s, w);
  const centers = stampCenters(s, w, h);
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      data-testid="stamp-overlay"
      className="pointer-events-none absolute inset-0 h-full w-full"
      // "Below content": multiply lets the page's dark content show over the watermark.
      style={{ clipPath: clip, mixBlendMode: s.below ? "multiply" : undefined }}
    >
      {centers.map((c, k) => (
        <g key={k} transform={`translate(${c.x} ${c.y}) rotate(${-s.rotation})`} opacity={s.opacity}>
          {s.kind === "text" ? (
            <>
              <text
                x={0}
                y={0.35 * s.size}
                fontSize={s.size}
                fontFamily={cssFontFamily(s.font)}
                fontWeight={s.bold ? 700 : 400}
                fontStyle={s.italic ? "italic" : "normal"}
                fill={s.color}
                textAnchor="middle"
                textLength={size.w}
                lengthAdjust="spacingAndGlyphs"
              >
                {s.text}
              </text>
              {s.underline && (
                <line
                  x1={-size.w / 2}
                  x2={size.w / 2}
                  y1={0.47 * s.size}
                  y2={0.47 * s.size}
                  stroke={s.color}
                  strokeWidth={Math.max(0.5, s.size * 0.06)}
                />
              )}
            </>
          ) : (
            s.image && (
              <image
                href={s.image.url}
                x={-size.w / 2}
                y={-size.h / 2}
                width={size.w}
                height={size.h}
                preserveAspectRatio="none"
              />
            )
          )}
        </g>
      ))}
    </svg>
  );
};

/** The draggable divider of the Before/After split view. */
const SplitHandle = ({ split, onChange }: { split: number; onChange: (v: number) => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const box = ref.current?.parentElement?.getBoundingClientRect();
    if (box) onChange(Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)));
  };
  return (
    <div
      ref={ref}
      data-testid="split-handle"
      className="absolute inset-y-0 z-10 w-6 -translate-x-1/2 cursor-ew-resize touch-none"
      style={{ left: `${split * 100}%` }}
      onPointerDown={(e) => {
        // Don't let the page underneath start a brush stroke or a drag.
        e.stopPropagation();
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && move(e)}
    >
      <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-primary shadow" />
      <div className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-primary bg-background text-primary shadow-md">
        <SquareSplitHorizontal className="h-4 w-4" />
      </div>
      <span className="pointer-events-none absolute left-0 top-2 -translate-x-full rounded bg-foreground/80 px-1.5 py-0.5 text-[10px] font-medium text-background">
        Before
      </span>
      <span className="pointer-events-none absolute right-0 top-2 translate-x-full rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
        After
      </span>
    </div>
  );
};

/** Darkens the margins a crop will remove. */
const CropShade = ({ w, h, m }: { w: number; h: number; m: Margins }) => {
  const l = Math.max(0, m.left / w) * 100;
  const r = Math.max(0, m.right / w) * 100;
  const t = Math.max(0, m.top / h) * 100;
  const b = Math.max(0, m.bottom / h) * 100;
  const shade = "absolute bg-slate-900/45";
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className={shade} style={{ left: 0, right: 0, top: 0, height: `${t}%` }} />
      <div className={shade} style={{ left: 0, right: 0, bottom: 0, height: `${b}%` }} />
      <div className={shade} style={{ left: 0, top: `${t}%`, bottom: `${b}%`, width: `${l}%` }} />
      <div className={shade} style={{ right: 0, top: `${t}%`, bottom: `${b}%`, width: `${r}%` }} />
      <div
        className="absolute border-2 border-dashed border-primary"
        style={{ left: `${l}%`, right: `${r}%`, top: `${t}%`, bottom: `${b}%` }}
      />
    </div>
  );
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const boxStyle = (r: Rect) => ({
  left: `${r.x * 100}%`,
  top: `${r.y * 100}%`,
  width: `${r.w * 100}%`,
  height: `${r.h * 100}%`,
});

interface PageLayerProps {
  pageIndex: number;
  pageW: number;
  pageH: number;
  tool: CanvasTool;
  brushSize: number;
  selection: Rect | null;
  strokes: Stroke[];
  highlights: Rect[];
  onSelect: (rect: Rect | null) => void;
  onStroke: (stroke: Stroke) => void;
  onStampMove?: (position: { x: number; y: number }) => void;
}

const MIN_SELECTION_PX = 6;

/** Sits on top of one page: box selection, brush painting and highlight boxes. */
const PageLayer = ({
  pageIndex,
  pageW,
  pageH,
  tool,
  brushSize,
  selection,
  strokes,
  highlights,
  onSelect,
  onStroke,
  onStampMove,
}: PageLayerProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [draftBox, setDraftBox] = useState<Rect | null>(null);
  const [draftStroke, setDraftStroke] = useState<{ x: number; y: number }[] | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  const aspect = pageH / pageW;
  const radius = brushSize / 2 / pageW; // as a fraction of page width

  const point = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
  };
  const between = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  });

  const shownBox = draftBox ?? selection;
  const allStrokes = draftStroke ? [...strokes, { points: draftStroke, radius }] : strokes;

  return (
    <div
      ref={ref}
      data-testid={`page-layer-${pageIndex}`}
      className={cn(
        "absolute inset-0",
        tool === "box" && "cursor-crosshair touch-none select-none",
        tool === "brush" && "cursor-none touch-none select-none",
        tool === "stamp" && "cursor-move touch-none select-none"
      )}
      onPointerDown={(e) => {
        if (tool === "none" || e.button !== 0) return;
        e.preventDefault();
        ref.current!.setPointerCapture(e.pointerId);
        const p = point(e);
        start.current = p;
        if (tool === "stamp") onStampMove?.(p);
        else if (tool === "box") setDraftBox({ ...p, w: 0, h: 0 });
        else setDraftStroke([p]);
      }}
      onPointerMove={(e) => {
        const p = point(e);
        if (tool === "brush") setHover(p);
        if (!start.current) return;
        if (tool === "stamp") onStampMove?.(p);
        else if (tool === "box") setDraftBox(between(start.current, p));
        else
          setDraftStroke((pts) => {
            if (!pts) return pts;
            const last = pts[pts.length - 1];
            return Math.hypot(p.x - last.x, (p.y - last.y) * aspect) > radius * 0.25 ? [...pts, p] : pts;
          });
      }}
      onPointerUp={(e) => {
        if (!start.current) return;
        const p = point(e);
        if (tool === "stamp") {
          // position already updated while dragging
        } else if (tool === "box") {
          const rect = between(start.current, p);
          const size = ref.current!.getBoundingClientRect();
          const tooSmall = rect.w * size.width < MIN_SELECTION_PX || rect.h * size.height < MIN_SELECTION_PX;
          onSelect(tooSmall ? null : rect);
          setDraftBox(null);
        } else if (draftStroke) {
          onStroke({ points: draftStroke, radius });
          setDraftStroke(null);
        }
        start.current = null;
      }}
      onPointerLeave={() => setHover(null)}
    >
      {/* Brush strokes and cursor, in page units so they scale with zoom. */}
      {(allStrokes.length > 0 || (tool === "brush" && hover)) && (
        <svg
          viewBox={`0 0 1 ${aspect}`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <g opacity={0.3} stroke="hsl(var(--primary))" fill="none" strokeLinecap="round" strokeLinejoin="round">
            {allStrokes.map((s, k) => (
              <polyline
                key={k}
                strokeWidth={s.radius * 2}
                points={(s.points.length === 1 ? [s.points[0], s.points[0]] : s.points)
                  .map((p) => `${p.x},${p.y * aspect}`)
                  .join(" ")}
              />
            ))}
          </g>
          {tool === "brush" && hover && (
            <circle
              cx={hover.x}
              cy={hover.y * aspect}
              r={radius}
              fill="hsl(var(--primary) / 0.08)"
              stroke="hsl(var(--primary))"
              strokeWidth={0.0025}
            />
          )}
        </svg>
      )}
      {highlights.map((r, k) => (
        <div key={k} className="pointer-events-none absolute border-2 border-rose-500 bg-rose-500/10" style={boxStyle(r)} />
      ))}
      {shownBox && (
        <div
          className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/10"
          style={boxStyle(shownBox)}
        />
      )}
    </div>
  );
};
