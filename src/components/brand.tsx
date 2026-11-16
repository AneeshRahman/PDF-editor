import { cn } from "../lib/utils";

/** Logo mark: a page with a folded corner; the fold is the brand accent. */
export const LogoMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("h-6 w-6", className)}>
    <path d="M5 2.75h9.5L19.25 7.5v13.75H5z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M14.5 2.75V7.5h4.75z" fill="hsl(var(--brand))" stroke="hsl(var(--brand))" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M8.5 12h7M8.5 15.5h7M8.5 19h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const Wordmark = () => (
  <span className="flex items-center gap-2">
    <LogoMark />
    <span className="text-[15px] font-semibold tracking-[-0.01em]">PDF Editor</span>
  </span>
);

/**
 * Printer's crop marks at the four corners of the parent (which must be `relative`).
 * A quiet nod to paper and print, used to frame drop zones.
 */
export const CropMarks = ({ className, active }: { className?: string; active?: boolean }) => {
  const mark = cn("absolute h-3 w-3 transition-colors", active ? "border-brand" : "border-foreground/40");
  return (
    <span aria-hidden="true" className={cn("pointer-events-none absolute -inset-2", className)}>
      <span className={cn(mark, "left-0 top-0 border-l border-t")} />
      <span className={cn(mark, "right-0 top-0 border-r border-t")} />
      <span className={cn(mark, "bottom-0 left-0 border-b border-l")} />
      <span className={cn(mark, "bottom-0 right-0 border-b border-r")} />
    </span>
  );
};
