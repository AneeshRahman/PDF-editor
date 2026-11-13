import type { ComponentType } from "react";
import {
  Combine,
  Contrast,
  Crop,
  Eraser,
  Minimize2,
  RotateCw,
  Scaling,
  Split,
  Stamp,
  type LucideIcon,
} from "lucide-react";
import {
  CompressPanel,
  CropPanel,
  InvertPanel,
  MergePanel,
  ResizePanel,
  RotatePanel,
  SplitPanel,
  WatermarkPanel,
  type ToolPanelProps,
} from "../components/tools/panels";
import { RemoveWatermarkPanel } from "../components/tools/RemoveWatermarkPanel";

export type ToolCategory = "organize" | "optimize" | "edit";

export const CATEGORIES: Record<ToolCategory, { label: string; tint: string }> = {
  organize: { label: "Organize", tint: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400" },
  optimize: { label: "Optimize", tint: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" },
  edit: { label: "Edit", tint: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400" },
};

export interface ToolDef {
  /** Also the URL path: /merge, /split, ... */
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  category: ToolCategory;
  /** Accepts several input files (shows the reorderable file grid instead of a page preview). */
  multiple?: boolean;
  /** Lets the user drag a box on the preview (passed to the panel as `selection`). */
  areaSelect?: boolean;
  /** Uses the live watermark overlay on the preview. */
  watermarkPreview?: boolean;
  Panel: ComponentType<ToolPanelProps>;
}

export const TOOLS: ToolDef[] = [
  {
    id: "merge",
    name: "Merge PDF",
    description: "Combine several PDFs into one, in the order you choose.",
    icon: Combine,
    category: "organize",
    multiple: true,
    Panel: MergePanel,
  },
  {
    id: "split",
    name: "Split PDF",
    description: "Pull out page ranges, or break a PDF into separate files.",
    icon: Split,
    category: "organize",
    Panel: SplitPanel,
  },
  {
    id: "rotate",
    name: "Rotate PDF",
    description: "Turn every page left, right or upside down.",
    icon: RotateCw,
    category: "organize",
    Panel: RotatePanel,
  },
  {
    id: "compress",
    name: "Compress PDF",
    description: "Shrink scanned and image-heavy PDFs.",
    icon: Minimize2,
    category: "optimize",
    Panel: CompressPanel,
  },
  {
    id: "watermark",
    name: "Add Watermark",
    description: "Stamp text over every page, with a live preview.",
    icon: Stamp,
    category: "edit",
    watermarkPreview: true,
    Panel: WatermarkPanel,
  },
  {
    id: "crop",
    name: "Crop PDF",
    description: "Trim the margins off every page.",
    icon: Crop,
    category: "edit",
    Panel: CropPanel,
  },
  {
    id: "resize",
    name: "Resize PDF",
    description: "Fit pages to A4, Letter, Legal or A3.",
    icon: Scaling,
    category: "edit",
    Panel: ResizePanel,
  },
  {
    id: "invert",
    name: "Invert Colors",
    description: "Swap light and dark, for easier reading at night.",
    icon: Contrast,
    category: "edit",
    Panel: InvertPanel,
  },
  {
    id: "remove-watermark",
    name: "Remove Watermark",
    description: "Select a watermark on the page and erase it, or find every copy.",
    areaSelect: true,
    icon: Eraser,
    category: "edit",
    Panel: RemoveWatermarkPanel,
  },
];

export const getTool = (id: string | undefined) => TOOLS.find((t) => t.id === id);
