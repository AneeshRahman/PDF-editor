import type { ComponentType } from "react";
import {
  Combine,
  Crop,
  FileDown,
  LayoutGrid,
  Minimize2,
  Palette,
  PenLine,
  RotateCw,
  Scaling,
  Split,
  Stamp,
  type LucideIcon,
} from "lucide-react";
import {
  CropPanel,
  MergePanel,
  ResizePanel,
  RotatePanel,
  SplitPanel,
  type ToolPanelProps,
} from "../components/tools/panels";
import { WatermarkStudio } from "../components/tools/WatermarkStudio";
import { ColorsPanel } from "../components/tools/ColorsPanel";
import { CompressPanel, SizePanel } from "../components/tools/OptimizePanels";
import { OrganizePanel, OrganizeWorkspace } from "../components/tools/OrganizeTool";
import { EditPdfPanel } from "../components/tools/EditPdf";

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
  /** Tools suggested after this one finishes (ids), most useful first. */
  related?: string[];
  /** Replaces the page preview with the tool's own workspace (e.g. a page grid). */
  Workspace?: ComponentType<ToolPanelProps>;
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
    related: ["compress", "organize", "size"],
    Panel: MergePanel,
  },
  {
    id: "split",
    name: "Split PDF",
    description: "Pull out page ranges, or break a PDF into separate files.",
    icon: Split,
    category: "organize",
    related: ["merge", "organize", "compress"],
    Panel: SplitPanel,
  },
  {
    id: "organize",
    name: "Organize PDF",
    description: "Reorder, rotate, duplicate or delete pages, and add blank pages or pages from another PDF.",
    icon: LayoutGrid,
    category: "organize",
    related: ["compress", "edit", "merge"],
    Workspace: OrganizeWorkspace,
    Panel: OrganizePanel,
  },
  {
    id: "rotate",
    name: "Rotate PDF",
    description: "Turn all pages, or a page range, left, right or upside down.",
    icon: RotateCw,
    category: "organize",
    related: ["organize", "merge", "compress"],
    Panel: RotatePanel,
  },
  {
    id: "compress",
    name: "Compress PDF",
    description: "Shrink a PDF and see the expected size before you compress.",
    icon: Minimize2,
    category: "optimize",
    related: ["size", "merge", "split"],
    Panel: CompressPanel,
  },
  {
    id: "size",
    name: "PDF Size Changer",
    description: "Make a PDF fit a size limit, like 200 KB or 2 MB.",
    icon: FileDown,
    category: "optimize",
    related: ["compress", "merge", "split"],
    Panel: SizePanel,
  },
  {
    id: "edit",
    name: "Edit PDF",
    description: "Edit or remove existing text, add your own text, and draw shapes.",
    icon: PenLine,
    category: "edit",
    related: ["watermark", "compress", "organize"],
    Panel: EditPdfPanel,
  },
  {
    id: "watermark",
    name: "Watermark",
    description: "Remove a watermark with a brush, or add your own text or image watermark.",
    icon: Stamp,
    category: "edit",
    related: ["compress", "edit", "merge"],
    Panel: WatermarkStudio,
  },
  {
    id: "crop",
    name: "Crop PDF",
    description: "Trim page margins, the same on every side or each side separately.",
    icon: Crop,
    category: "edit",
    related: ["resize", "compress", "rotate"],
    Panel: CropPanel,
  },
  {
    id: "resize",
    name: "Resize PDF",
    description: "Change the page size to A4, Letter, A3 or any custom size.",
    icon: Scaling,
    category: "edit",
    related: ["crop", "compress", "organize"],
    Panel: ResizePanel,
  },
  {
    id: "colors",
    name: "Adjust Colors",
    description: "Grayscale, black & white or inverted, or fine-tune brightness, contrast and saturation.",
    icon: Palette,
    category: "edit",
    related: ["compress", "watermark", "edit"],
    Panel: ColorsPanel,
  },
];

export const getTool = (id: string | undefined) => TOOLS.find((t) => t.id === id);
