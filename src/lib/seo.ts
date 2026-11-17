/**
 * Search and social metadata for every page.
 *
 * Plain data only (no React), because it is shared by the app (to update the head on
 * navigation) and by the build (to write the sitemap and a pre-rendered HTML file per
 * page, so crawlers and link previews see the right title without running JavaScript).
 */

export const SITE_NAME = "PDF Editor";
export const THEME_COLOR = "#f9f8f5";
export const OG_IMAGE = "/og-image.png";

export interface PageSeo {
  path: string;
  title: string;
  description: string;
  /** Short name used in breadcrumbs and structured data. */
  name: string;
}

export const HOME_SEO: PageSeo = {
  path: "/",
  name: SITE_NAME,
  title: "Free PDF editor: unlimited edits, any file size",
  description:
    "Edit PDF text, merge, split, organize, compress or shrink to a target size, and add or remove watermarks. Unlimited edits, any file size, no uploads.",
};

export const TOOL_SEO: PageSeo[] = [
  {
    path: "/merge",
    name: "Merge PDF",
    title: "Merge PDF: combine PDF files, free & unlimited",
    description:
      "Combine as many PDFs as you like into one, in the order you choose. No file size limit, no sign-up, and nothing is uploaded: it runs in your browser.",
  },
  {
    path: "/split",
    name: "Split PDF",
    title: "Split PDF: extract pages or split into files",
    description:
      "Pull out page ranges, split every N pages or save each page as its own PDF. Free and unlimited, any file size, and your file never leaves your device.",
  },
  {
    path: "/organize",
    name: "Organize PDF",
    title: "Organize PDF: reorder, add and delete pages",
    description:
      "Rearrange PDF pages by dragging, rotate, duplicate or delete them, and add blank pages or pages from another PDF. Free, unlimited, nothing uploaded.",
  },
  {
    path: "/rotate",
    name: "Rotate PDF",
    title: "Rotate PDF: turn all pages or a page range",
    description:
      "Rotate every page or just a page range by 90° or 180° with a live preview. Free with no file size limit or usage cap; processing happens in your browser.",
  },
  {
    path: "/compress",
    name: "Compress PDF",
    title: "Compress PDF: see the size before you shrink",
    description:
      "Compress a PDF of any size and see the expected file size for each setting before you start, like a design tool's export panel. Free, unlimited, no uploads.",
  },
  {
    path: "/size",
    name: "PDF Size Changer",
    title: "Reduce PDF to a size: 100 KB, 200 KB, 1 MB",
    description:
      "Make a PDF fit an upload limit: type a target like 200 KB or 2 MB and get the best quality that fits. Can also pad small files. Free, no uploads.",
  },
  {
    path: "/edit",
    name: "Edit PDF",
    title: "Edit PDF text online: change, remove, add text",
    description:
      "Edit or remove text in a PDF, see each text's font, size and colour, add new text and draw shapes in any colour. Free, unlimited, in your browser.",
  },
  {
    path: "/watermark",
    name: "Watermark",
    title: "Remove or add a PDF watermark, free & unlimited",
    description:
      "Remove a watermark from a PDF with a brush, or add your own text or image watermark. Live before/after preview, no file size limit, nothing uploaded.",
  },
  {
    path: "/crop",
    name: "Crop PDF",
    title: "Crop PDF: trim page margins online, free",
    description:
      "Trim PDF page margins with linked values for all sides or each side separately, and preview exactly what will be cut. Free, unlimited, any file size.",
  },
  {
    path: "/resize",
    name: "Resize PDF",
    title: "Resize PDF: A4, Letter, A3 or custom size",
    description:
      "Change PDF page size to A4, A5, A3, Letter, Legal, Tabloid or any custom size in mm or inches, with a to-scale size reference. Free and unlimited.",
  },
  {
    path: "/colors",
    name: "Adjust PDF colors",
    title: "Adjust PDF colors: grayscale, B&W, invert, free",
    description:
      "Make a PDF grayscale or black & white, invert it, or tune brightness, contrast and saturation with a live preview. Free, unlimited, any file size.",
  },
];

export const ALL_SEO: PageSeo[] = [HOME_SEO, ...TOOL_SEO];

export const NOT_FOUND_SEO: PageSeo = {
  path: "",
  name: "Page not found",
  title: "Page not found",
  description: HOME_SEO.description,
};

export const seoForPath = (path: string) => ALL_SEO.find((p) => p.path === path) ?? null;

/** "Merge PDF: …" → "Merge PDF: … | PDF Editor" (home keeps its own title). */
export const fullTitle = (p: PageSeo) => (p.path === "/" ? p.title : `${p.title} | ${SITE_NAME}`);

/** schema.org data for a page, as JSON-LD. `origin` may be "" when the site URL is unknown. */
export function structuredData(p: PageSeo, origin: string) {
  const url = origin + p.path;
  const app = {
    "@type": "WebApplication",
    name: p.path === "/" ? SITE_NAME : p.name,
    url,
    description: p.description,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any (runs in a web browser)",
    browserRequirements: "Requires JavaScript and a modern web browser.",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };
  const graph: object[] = [app];
  if (p.path !== "/") {
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_NAME, item: origin + "/" },
        { "@type": "ListItem", position: 2, name: p.name, item: url },
      ],
    });
  } else {
    graph.push({ "@type": "WebSite", name: SITE_NAME, url });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The page-specific part of <head>, between <!--seo--> markers so the build can swap it
 * per page. `origin` is the site's absolute URL, or "" when unknown (then absolute-only
 * tags such as canonical are left out).
 */
export function renderHead(p: PageSeo, origin: string, { noindex = false } = {}) {
  const url = origin + p.path;
  const image = origin + OG_IMAGE;
  const t = esc(fullTitle(p));
  const d = esc(p.description);
  const tags = [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    noindex ? `<meta name="robots" content="noindex" />` : `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    origin && !noindex ? `<link rel="canonical" href="${esc(url)}" />` : "",
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    origin ? `<meta property="og:url" content="${esc(url)}" />` : "",
    origin ? `<meta property="og:image" content="${esc(image)}" />` : "",
    origin ? `<meta property="og:image:width" content="1200" />` : "",
    origin ? `<meta property="og:image:height" content="630" />` : "",
    origin ? `<meta property="og:image:alt" content="${SITE_NAME}: free PDF editor with unlimited edits, any file size and no uploads." />` : "",
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    origin ? `<meta name="twitter:image" content="${esc(image)}" />` : "",
    `<script type="application/ld+json" id="ld-json">${JSON.stringify(structuredData(p, origin)).replace(/</g, "\u003c")}</script>`,
  ].filter(Boolean);
  return `<!--seo-->\n    ${tags.join("\n    ")}\n    <!--/seo-->`;
}
