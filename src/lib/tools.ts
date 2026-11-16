import type { ComponentType } from "react";
import {
  Combine,
  Contrast,
  Crop,
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
  type ToolPanelProps,
} from "../components/tools/panels";
import { WatermarkStudio } from "../components/tools/WatermarkStudio";

export type ToolCategory = "organize" | "optimize" | "edit";

export const CATEGORIES: Record<ToolCategory, { label: string; tint: string }> = {
  // One neutral treatment for every category: the grid, numbering and labels carry the
  // structure, not colour.
  organize: { label: "Organize", tint: "border border-border bg-background text-foreground" },
  optimize: { label: "Optimize", tint: "border border-border bg-background text-foreground" },
  edit: { label: "Edit", tint: "border border-border bg-background text-foreground" },
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
    name: "Watermark",
    description: "Add a text or image watermark, or brush an existing one away.",
    icon: Stamp,
    category: "edit",
    Panel: WatermarkStudio,
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
];

export const getTool = (id: string | undefined) => TOOLS.find((t) => t.id === id);
