import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bold, Circle, Italic, Loader2, Minus, MousePointer2, RotateCcw, Square, Trash2, Type } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Progress } from "../ui/progress";
import { Slider } from "../ui/slider";
import type { ToolPanelProps } from "./panels";
import { baseName } from "../../lib/files";
import {
  applyEdits,
  extractText,
  type EditObject,
  type PageBox,
  type RunEdit,
  type ShapeKind,
  type TextRun,
  type TextStyle,
} from "../../lib/pdf-edit";
import { cssFontFamily, measureText, type StampFont } from "../../lib/stamp";
import { cn } from "../../lib/utils";

type Tool = "select" | "text" | ShapeKind;
type Selection = { type: "run"; id: string } | { type: "obj"; id: string } | null;
type ShapeObject = Extract<EditObject, { kind: ShapeKind }>;


const TOOLS: { id: Tool; label: string; icon: typeof Type; hint: string }[] = [
  { id: "select", label: "Select", icon: MousePointer2, hint: "Click text to edit it; drag objects to move them" },
  { id: "text", label: "Text", icon: Type, hint: "Click on the page to add text" },
  { id: "rect", label: "Rectangle", icon: Square, hint: "Drag on the page to draw" },
  { id: "ellipse", label: "Ellipse", icon: Circle, hint: "Drag on the page to draw" },
  { id: "line", label: "Line", icon: Minus, hint: "Drag on the page to draw" },
];
const FONTS: StampFont[] = ["Helvetica", "Times", "Courier"];
const SWATCHES = ["#111111", "#ffffff", "#e94520", "#1565c0", "#2e7d32", "#f9a825", "#6a1b9a"];

let idSeq = 0;
const newId = () => `o${idSeq++}`;

/* ------------------------------------------------------------------ */
/* On-page layer                                                        */
/* ------------------------------------------------------------------ */

interface OverlayProps {
  page: number;
  w: number;
  h: number;
  tool: Tool;
  /** The current tool at event time (props can lag a frame behind a tool change). */
  toolRef: React.MutableRefObject<Tool>;
  runs: TextRun[];
  runEdits: Record<string, RunEdit>;
  objects: EditObject[];
  selected: Selection;
  textDefaults: TextStyle;
  shapeDefaults: Pick<ShapeObject, "stroke" | "fill" | "strokeWidth" | "opacity">;
  select: (s: Selection) => void;
  addObject: (o: EditObject) => void;
  updateObject: (id: string, patch: Partial<EditObject>) => void;
  setTool: (t: Tool) => void;
  focusText: () => void;
}

const textWidth = (s: TextStyle, text: string) => measureText(s, text, s.size);

function bbox(o: EditObject) {
  if (o.kind === "text") {
    const w = textWidth(o, o.text);
    return { x: o.x, y: o.baseline - o.size * 0.85, w, h: o.size * 1.1 };
  }
  const pad = o.kind === "line" ? Math.max(4, o.strokeWidth) : 0;
  return {
    x: Math.min(o.x1, o.x2) - pad,
    y: Math.min(o.y1, o.y2) - pad,
    w: Math.abs(o.x2 - o.x1) + pad * 2,
    h: Math.abs(o.y2 - o.y1) + pad * 2,
  };
}

const SvgText = ({ x, baseline, text, style }: { x: number; baseline: number; text: string; style: TextStyle }) => (
  <text
    x={x}
    y={baseline}
    fontSize={style.size}
    fontFamily={cssFontFamily(style.font)}
    fontWeight={style.bold ? 700 : 400}
    fontStyle={style.italic ? "italic" : "normal"}
    fill={style.color}
    textLength={Math.max(1, textWidth(style, text))}
    lengthAdjust="spacingAndGlyphs"
    style={{ whiteSpace: "pre" }}
  >
    {text}
  </text>
);

const EditOverlay = (p: OverlayProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const action = useRef<
    | { kind: "draw"; id: string; x: number; y: number }
    | { kind: "move"; id: string; x: number; y: number; orig: EditObject }
    | { kind: "resize"; id: string }
    | null
  >(null);

  const pt = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * p.w, y: ((e.clientY - r.top) / r.height) * p.h };
  };

  const startMove = (e: React.PointerEvent, o: EditObject) => {
    if (p.toolRef.current !== "select") return;
    e.stopPropagation();
    p.select({ type: "obj", id: o.id });
    const { x, y } = pt(e);
    action.current = { kind: "move", id: o.id, x, y, orig: o };
    svgRef.current!.setPointerCapture(e.pointerId);
  };

  const sel = p.selected;
  const pageObjects = p.objects.filter((o) => o.page === p.page);

  return (
    <svg
      ref={svgRef}
      data-testid={`edit-layer-${p.page}`}
      viewBox={`0 0 ${p.w} ${p.h}`}
      className={cn("absolute inset-0 h-full w-full touch-none select-none", p.tool === "select" ? "cursor-default" : "cursor-crosshair")}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const { x, y } = pt(e);
        const tool = p.toolRef.current;
        if (tool === "select") {
          p.select(null);
          return;
        }
        if (tool === "text") {
          const id = newId();
          p.addObject({ id, kind: "text", page: p.page, x, baseline: y, text: "Text", ...p.textDefaults });
          p.select({ type: "obj", id });
          p.setTool("select");
          p.focusText();
          return;
        }
        const id = newId();
        p.addObject({ id, kind: tool, page: p.page, x1: x, y1: y, x2: x, y2: y, ...p.shapeDefaults });
        action.current = { kind: "draw", id, x, y };
        svgRef.current!.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const a = action.current;
        if (!a) return;
        const { x, y } = pt(e);
        if (a.kind === "draw" || a.kind === "resize") {
          p.updateObject(a.id, { x2: x, y2: y } as Partial<EditObject>);
        } else {
          const dx = x - a.x;
          const dy = y - a.y;
          const o = a.orig;
          p.updateObject(
            a.id,
            o.kind === "text"
              ? { x: o.x + dx, baseline: o.baseline + dy }
              : ({ x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy } as Partial<EditObject>)
          );
        }
      }}
      onPointerUp={() => {
        const a = action.current;
        action.current = null;
        if (a?.kind === "draw") {
          const o = p.objects.find((x) => x.id === a.id);
          const tiny = o && o.kind !== "text" && Math.hypot(o.x2 - o.x1, o.y2 - o.y1) < 3;
          if (tiny) p.updateObject(a.id, { x2: a.x + 80, y2: a.y + (o!.kind === "line" ? 0 : 50) } as Partial<EditObject>);
          p.select({ type: "obj", id: a.id });
          p.setTool("select");
        }
      }}
    >
      {/* Existing text: covers + replacements, and click targets. */}
      {p.runs.map((run) => {
        const e = p.runEdits[run.id];
        const isSel = sel?.type === "run" && sel.id === run.id;
        const shownW = e && !e.deleted ? Math.max(run.w, textWidth(e, e.text)) : run.w;
        return (
          <g key={run.id}>
            {e && <rect x={run.x - 1} y={run.top - 1} width={run.w + 2} height={run.h + 2} fill={run.background} />}
            {e && !e.deleted && <SvgText x={run.x} baseline={run.baseline} text={e.text} style={e} />}
            <rect
              data-run={run.id}
              x={run.x - 1}
              y={run.top - 1}
              width={shownW + 2}
              height={run.h + 2}
              fill="transparent"
              className={cn(
                p.tool === "select" ? "cursor-text hover:stroke-brand" : "pointer-events-none",
                isSel ? "stroke-brand" : "stroke-transparent"
              )}
              strokeWidth={isSel ? 1.2 : 0.8}
              strokeDasharray={isSel ? undefined : "2 2"}
              onPointerDown={(ev) => {
                if (p.toolRef.current !== "select") return;
                ev.stopPropagation();
                p.select({ type: "run", id: run.id });
              }}
              onDoubleClick={() => p.focusText()}
            />
          </g>
        );
      })}

      {/* Added text and shapes. */}
      {pageObjects.map((o) => {
        const isSel = sel?.type === "obj" && sel.id === o.id;
        const b = bbox(o);
        return (
          <g key={o.id}>
            {o.kind === "text" ? (
              <SvgText x={o.x} baseline={o.baseline} text={o.text} style={o} />
            ) : o.kind === "line" ? (
              <line x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} stroke={o.stroke ?? "#000"} strokeWidth={o.strokeWidth} opacity={o.opacity} strokeLinecap="round" />
            ) : o.kind === "rect" ? (
              <rect
                x={Math.min(o.x1, o.x2)}
                y={Math.min(o.y1, o.y2)}
                width={Math.abs(o.x2 - o.x1)}
                height={Math.abs(o.y2 - o.y1)}
                fill={o.fill ?? "none"}
                fillOpacity={o.opacity}
                stroke={o.stroke ?? "none"}
                strokeOpacity={o.opacity}
                strokeWidth={o.stroke ? o.strokeWidth : 0}
              />
            ) : (
              <ellipse
                cx={(o.x1 + o.x2) / 2}
                cy={(o.y1 + o.y2) / 2}
                rx={Math.abs(o.x2 - o.x1) / 2}
                ry={Math.abs(o.y2 - o.y1) / 2}
                fill={o.fill ?? "none"}
                fillOpacity={o.opacity}
                stroke={o.stroke ?? "none"}
                strokeOpacity={o.opacity}
                strokeWidth={o.stroke ? o.strokeWidth : 0}
              />
            )}
            {/* Grab area */}
            <rect
              data-obj={o.id}
              x={b.x - 2}
              y={b.y - 2}
              width={b.w + 4}
              height={b.h + 4}
              fill="transparent"
              className={cn(p.tool === "select" ? "cursor-move" : "pointer-events-none", isSel ? "stroke-brand" : "stroke-transparent")}
              strokeWidth={1}
              strokeDasharray="3 2"
              onPointerDown={(ev) => startMove(ev, o)}
              onDoubleClick={() => o.kind === "text" && p.focusText()}
            />
            {isSel && o.kind !== "text" && (
              <rect
                data-handle={o.id}
                x={o.x2 - 3.5}
                y={o.y2 - 3.5}
                width={7}
                height={7}
                className="cursor-nwse-resize fill-background stroke-brand"
                strokeWidth={1.2}
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  action.current = { kind: "resize", id: o.id };
                  svgRef.current!.setPointerCapture(ev.pointerId);
                }}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/* Panel                                                                */
/* ------------------------------------------------------------------ */

const ColorRow = ({ value, onChange, label, allowNone }: { value: string | null; onChange: (v: string | null) => void; label: string; allowNone?: boolean }) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    <div className="flex flex-wrap items-center gap-1.5">
      {allowNone && (
        <button
          type="button"
          aria-label={`${label}: none`}
          onClick={() => onChange(null)}
          className={cn("relative h-6 w-6 overflow-hidden rounded-full border-2 bg-background", value === null ? "border-foreground" : "border-border")}
        >
          <span className="absolute left-1/2 top-[-2px] h-7 w-px -translate-x-1/2 rotate-45 bg-destructive" />
        </button>
      )}
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`${label} ${c}`}
          onClick={() => onChange(c)}
          className={cn("h-6 w-6 rounded-full border-2", value === c ? "border-foreground" : "border-border")}
          style={{ background: c }}
        />
      ))}
      <input
        type="color"
        aria-label={`Custom ${label.toLowerCase()}`}
        value={value ?? "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-7 cursor-pointer rounded border border-border bg-transparent p-0"
      />
    </div>
  </div>
);

const StyleControls = ({ style, onChange }: { style: TextStyle; onChange: (patch: Partial<TextStyle>) => void }) => (
  <div className="space-y-3">
    <div className="flex items-center gap-1.5">
      <select
        aria-label="Font"
        value={style.font}
        onChange={(e) => onChange({ font: e.target.value as StampFont })}
        className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
      >
        {FONTS.map((f) => (
          <option key={f}>{f}</option>
        ))}
      </select>
      {[
        ["bold", Bold, "Bold"],
        ["italic", Italic, "Italic"],
      ].map(([key, Icon, label]) => {
        const I = Icon as typeof Bold;
        const on = style[key as "bold" | "italic"];
        return (
          <button
            key={key as string}
            type="button"
            aria-pressed={on}
            aria-label={label as string}
            onClick={() => onChange({ [key as string]: !on })}
            className={cn("flex h-9 w-9 items-center justify-center rounded-md border", on ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted")}
          >
            <I className="h-4 w-4" />
          </button>
        );
      })}
      <Input
        aria-label="Font size"
        type="number"
        min={4}
        max={200}
        value={style.size}
        onChange={(e) => onChange({ size: Math.max(4, Math.min(200, Number(e.target.value) || 4)) })}
        className="h-9 w-16 font-mono"
      />
    </div>
    <ColorRow label="Text colour" value={style.color} onChange={(c) => onChange({ color: c ?? "#000000" })} />
  </div>
);

export const EditPdfPanel = ({ files, process, setPreview }: ToolPanelProps) => {
  const file = files[0];
  const [data, setData] = useState<{ runs: TextRun[]; boxes: PageBox[] } | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [tool, setTool] = useState<Tool>("select");
  const toolRef = useRef<Tool>(tool);
  toolRef.current = tool;
  const [runEdits, setRunEdits] = useState<Record<string, RunEdit>>({});
  const [objects, setObjects] = useState<EditObject[]>([]);
  const [selected, setSelected] = useState<Selection>(null);
  const [textDefaults, setTextDefaults] = useState<TextStyle>({ font: "Helvetica", bold: false, italic: false, size: 16, color: "#111111" });
  const [shapeDefaults, setShapeDefaults] = useState({ stroke: "#e94520" as string | null, fill: null as string | null, strokeWidth: 2, opacity: 1 });
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let live = true;
    extractText(file.bytes, (n, total) => live && setLoadProgress((n / total) * 100)).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [file.bytes]);

  const runsByPage = useMemo(() => {
    const m = new Map<number, TextRun[]>();
    data?.runs.forEach((r) => m.set(r.page, [...(m.get(r.page) ?? []), r]));
    return m;
  }, [data]);

  const addObject = useCallback((o: EditObject) => setObjects((all) => [...all, o]), []);
  const updateObject = useCallback(
    (id: string, patch: Partial<EditObject>) => setObjects((all) => all.map((o) => (o.id === id ? ({ ...o, ...patch } as EditObject) : o))),
    []
  );
  const focusText = useCallback(() => setTimeout(() => textRef.current?.select(), 30), []);

  // The live editing layer on every page.
  useEffect(() => {
    if (!data) return;
    setPreview?.({
      tool: "overlay",
      overlay: (page, w, h) => (
        <EditOverlay
          page={page}
          w={w}
          h={h}
          tool={tool}
          toolRef={toolRef}
          runs={runsByPage.get(page) ?? []}
          runEdits={runEdits}
          objects={objects}
          selected={selected}
          textDefaults={textDefaults}
          shapeDefaults={shapeDefaults}
          select={setSelected}
          addObject={addObject}
          updateObject={updateObject}
          setTool={setTool}
          focusText={focusText}
        />
      ),
    });
  }, [data, tool, runsByPage, runEdits, objects, selected, textDefaults, shapeDefaults, setPreview, addObject, updateObject, focusText]);
  useEffect(() => () => setPreview?.({ tool: "none", overlay: null }), [setPreview]);

  const selRun = selected?.type === "run" ? data?.runs.find((r) => r.id === selected.id) : undefined;
  const selObj = selected?.type === "obj" ? objects.find((o) => o.id === selected.id) : undefined;
  const runEdit = selRun ? runEdits[selRun.id] : undefined;
  const runState = useMemo(
    (): RunEdit | undefined =>
      selRun
        ? runEdit ?? { text: selRun.str, deleted: false, font: selRun.family, bold: selRun.bold, italic: selRun.italic, size: selRun.size, color: selRun.color }
        : undefined,
    [selRun, runEdit]
  );
  const editRun = (patch: Partial<RunEdit>) => selRun && setRunEdits((all) => ({ ...all, [selRun.id]: { ...runState!, ...patch } }));

  const deleteSelected = useCallback(() => {
    if (selected?.type === "obj") setObjects((all) => all.filter((o) => o.id !== selected.id));
    if (selected?.type === "run" && selRun) setRunEdits((all) => ({ ...all, [selRun.id]: { ...(all[selRun.id] ?? runState!), deleted: true } }));
    setSelected(null);
  }, [selected, selRun, runState]);

  // Delete / Backspace removes the selection; Escape deselects.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, deleteSelected]);

  const changes = Object.keys(runEdits).length + objects.length;
  const pagesWithText = runsByPage.size;
  const rotatedPages = data?.boxes.filter((b) => b.rotated).length ?? 0;

  return (
    <div className="space-y-5 rounded-lg border border-border bg-card p-5">
      {/* Tools */}
      <div className="space-y-2">
        <div className="grid grid-cols-5 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Edit tool">
          {TOOLS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={tool === id}
              aria-label={label}
              title={label}
              onClick={() => setTool(id)}
              className={cn("flex h-9 items-center justify-center rounded-md transition", tool === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{TOOLS.find((t) => t.id === tool)!.hint}</p>
      </div>

      {!data ? (
        <div className="space-y-2">
          <p className="flex items-center text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Reading text and fonts…
          </p>
          <Progress value={loadProgress} className="h-1.5" />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground" data-testid="text-found">
          Found {data.runs.length} text blocks on {pagesWithText} page{pagesWithText === 1 ? "" : "s"}.
          {rotatedPages > 0 && ` Text on ${rotatedPages} rotated page${rotatedPages === 1 ? "" : "s"} can't be edited.`}
        </p>
      )}

      {/* Selected existing text */}
      {selRun && runState && (
        <div className="space-y-3 border-t border-border pt-4" data-testid="font-info">
          <p className="label-mono">Selected text</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border border-border bg-background p-3 text-xs">
            <dt className="text-muted-foreground">Font</dt>
            <dd className="font-medium" data-testid="font-name">
              {selRun.fontName}
              {selRun.subset && <span className="ml-1 font-normal text-muted-foreground">(embedded subset)</span>}
            </dd>
            <dt className="text-muted-foreground">Size</dt>
            <dd className="font-mono">{selRun.size} pt</dd>
            <dt className="text-muted-foreground">Style</dt>
            <dd>{[selRun.bold && "Bold", selRun.italic && "Italic"].filter(Boolean).join(", ") || "Regular"}</dd>
            <dt className="text-muted-foreground">Colour</dt>
            <dd className="flex items-center gap-1.5 font-mono">
              <span className="h-3 w-3 rounded-sm border border-border" style={{ background: selRun.color }} />
              {selRun.color}
            </dd>
            <dt className="text-muted-foreground">Replaced with</dt>
            <dd>{runState.font}{runState.bold ? " Bold" : ""}{runState.italic ? " Italic" : ""} (closest standard font)</dd>
          </dl>
          {!runState.deleted ? (
            <>
              <textarea
                ref={textRef}
                aria-label="Text"
                value={runState.text}
                onChange={(e) => editRun({ text: e.target.value })}
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <StyleControls style={runState} onChange={editRun} />
            </>
          ) : (
            <p className="text-xs text-muted-foreground">This text is removed.</p>
          )}
          <div className="flex gap-2">
            {runEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setRunEdits((all) => {
                    const next = { ...all };
                    delete next[selRun.id];
                    return next;
                  })
                }
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore original
              </Button>
            )}
            {!runState.deleted && (
              <Button variant="outline" size="sm" onClick={deleteSelected}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove text
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Selected added text */}
      {selObj?.kind === "text" && (
        <div className="space-y-3 border-t border-border pt-4">
          <p className="label-mono">Added text</p>
          <textarea
            ref={textRef}
            aria-label="Text"
            value={selObj.text}
            onChange={(e) => updateObject(selObj.id, { text: e.target.value })}
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <StyleControls
            style={selObj}
            onChange={(patch) => {
              updateObject(selObj.id, patch);
              setTextDefaults((d) => ({ ...d, ...patch }));
            }}
          />
          <Button variant="outline" size="sm" onClick={deleteSelected}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      )}

      {/* Shape style: the selected shape, or the defaults for new ones */}
      {(selObj && selObj.kind !== "text") || (!selected && tool !== "select" && tool !== "text") ? (
        <ShapeControls
          value={selObj && selObj.kind !== "text" ? (selObj as ShapeObject) : shapeDefaults}
          isLine={(selObj?.kind ?? tool) === "line"}
          onChange={(patch) => {
            if (selObj && selObj.kind !== "text") updateObject(selObj.id, patch);
            setShapeDefaults((d) => ({ ...d, ...patch }));
          }}
          onDelete={selObj ? deleteSelected : undefined}
        />
      ) : null}

      <div className="space-y-2 border-t border-border pt-4">
        <Button
          className="w-full"
          size="lg"
          disabled={!changes || !data}
          onClick={() =>
            process(async () => [
              {
                name: `${baseName(file.name)}_edited.pdf`,
                bytes: await applyEdits(file.bytes, data!.runs, data!.boxes, runEdits, objects),
              },
            ])
          }
        >
          Save edited PDF{changes ? ` (${changes} change${changes === 1 ? "" : "s"})` : ""}
        </Button>
        <p className="text-xs text-muted-foreground">
          Edited text is redrawn in the closest standard font; the rest of the page is untouched. Delete removes the selection.
        </p>
      </div>
    </div>
  );
};

const ShapeControls = ({
  value,
  isLine,
  onChange,
  onDelete,
}: {
  value: Pick<ShapeObject, "stroke" | "fill" | "strokeWidth" | "opacity">;
  isLine: boolean;
  onChange: (patch: Partial<ShapeObject>) => void;
  onDelete?: () => void;
}) => (
  <div className="space-y-3 border-t border-border pt-4">
    <p className="label-mono">{onDelete ? "Selected shape" : "New shapes"}</p>
    <ColorRow label={isLine ? "Line colour" : "Outline"} value={value.stroke} allowNone={!isLine} onChange={(c) => onChange({ stroke: c })} />
    {!isLine && <ColorRow label="Fill" value={value.fill} allowNone onChange={(c) => onChange({ fill: c })} />}
    <div className="space-y-1.5">
      <div className="flex justify-between">
        <Label>Thickness</Label>
        <span className="font-mono text-xs text-muted-foreground">{value.strokeWidth} pt</span>
      </div>
      <Slider aria-label="Thickness" value={[value.strokeWidth]} onValueChange={([v]) => onChange({ strokeWidth: v })} min={0.5} max={20} step={0.5} />
    </div>
    <div className="space-y-1.5">
      <div className="flex justify-between">
        <Label>Opacity</Label>
        <span className="font-mono text-xs text-muted-foreground">{Math.round(value.opacity * 100)}%</span>
      </div>
      <Slider aria-label="Opacity" value={[value.opacity * 100]} onValueChange={([v]) => onChange({ opacity: v / 100 })} min={5} max={100} step={5} />
    </div>
    {onDelete && (
      <Button variant="outline" size="sm" onClick={onDelete}>
        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete shape
      </Button>
    )}
  </div>
);

