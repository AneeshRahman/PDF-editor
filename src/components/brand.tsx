import { cn } from "../lib/utils";

/**
 * The logo mark: a sheet of paper cut into a "P". The page's folded corner (vermilion)
 * sits at the top right of the letter's bowl, and a notch at the bottom right turns the
 * sheet into the stem. Drawn on a 32-unit grid so it stays crisp down to 16px.
 *
 * Colours follow the theme: the tile is the text colour, the letter is the background.
 */
export const LOGO_PATHS = {
  /** The "P": page outline with the fold cut off, the bowl's counter and the stem notch. */
  letter: "M9 7H19L23 11V19H16V25H9Z M13 11V15H17.5V11Z",
  /** The folded-over corner. */
  fold: "M19 7V11H23Z",
};

export const LogoMark = ({ className, title }: { className?: string; title?: string }) => (
  <svg viewBox="0 0 32 32" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} className={cn("h-7 w-7", className)}>
    {title && <title>{title}</title>}
    <rect width="32" height="32" rx="7" fill="currentColor" />
    <path d={LOGO_PATHS.letter} fill="hsl(var(--background))" fillRule="evenodd" />
    <path d={LOGO_PATHS.fold} fill="hsl(var(--brand))" />
  </svg>
);

export const Wordmark = () => (
  <span className="flex items-center gap-2.5">
    <LogoMark />
    <span className="text-[15px] font-semibold tracking-[-0.02em]">PDF Editor</span>
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
