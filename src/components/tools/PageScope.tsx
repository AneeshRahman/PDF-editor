import { useMemo, useState } from "react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { parsePageRanges } from "../../lib/pdf-operations";
import { cn } from "../../lib/utils";

export type PageScopeResult = { pages: number[] | null; error: string | null };

/**
 * "All pages / Page range" picker. `pages` is null for all pages, otherwise the 0-based
 * indices from a range such as "1-3, 5, 8-".
 */
export function usePageScope(pageCount: number, label = "Pages") {
  const [all, setAll] = useState(true);
  const [text, setText] = useState(pageCount > 1 ? `1-${Math.min(pageCount, 2)}` : "1");

  const result = useMemo((): PageScopeResult => {
    if (all) return { pages: null, error: null };
    try {
      const set = new Set<number>();
      for (const r of parsePageRanges(text, pageCount)) for (let p = r.from; p <= r.to; p++) set.add(p - 1);
      return { pages: [...set].sort((a, b) => a - b), error: null };
    } catch (e) {
      return { pages: [], error: e instanceof Error ? e.message : "Invalid pages" };
    }
  }, [all, text, pageCount]);

  const ui = (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-muted p-1">
        {[
          [true, `All ${pageCount}`],
          [false, "Page range"],
        ].map(([value, text]) => (
          <button
            key={String(value)}
            type="button"
            role="radio"
            aria-checked={all === value}
            onClick={() => setAll(value as boolean)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition",
              all === value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {text as string}
          </button>
        ))}
      </div>
      {!all && (
        <>
          <Input aria-label="Page range" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. 1-3, 5, 8-" />
          {result.error ? (
            <p className="text-xs text-destructive">{result.error}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {result.pages!.length} of {pageCount} pages. Separate ranges with commas; "8-" means page 8 to the end.
            </p>
          )}
        </>
      )}
    </div>
  );

  return { ...result, ui };
}
