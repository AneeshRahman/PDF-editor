import { defineConfig, type Plugin } from "vite";
import path from "path";
import fs from "fs";
import react from "@vitejs/plugin-react";
import { HOME_SEO, TOOL_SEO, renderHead } from "./src/lib/seo";

/**
 * The site's public URL, used for canonical links, social images and the sitemap.
 * Defaults to the production site; set SITE_URL to override (e.g. a custom domain).
 */
const SITE_URL = (process.env.SITE_URL || "https://yours-pdf.vercel.app").replace(/\/+$/, "");

const SEO_BLOCK = /<!--seo-->[\s\S]*?<!--\/seo-->/;

/** Pre-renders per-page <head> tags and writes sitemap.xml / robots.txt. */
function seo(): Plugin {
  let outDir = "dist";
  return {
    name: "pdf-editor-seo",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    transformIndexHtml(html) {
      return html.replace(SEO_BLOCK, renderHead(HOME_SEO, SITE_URL));
    },
    closeBundle() {
      const indexFile = path.join(outDir, "index.html");
      if (!fs.existsSync(indexFile)) return; // dev server
      const html = fs.readFileSync(indexFile, "utf8");

      // One HTML file per tool, so crawlers and link previews get the right title and
      // description without running JavaScript. The app takes over as usual.
      // Written as /merge.html etc.; Vercel (cleanUrls) and vite preview serve it at /merge.
      for (const page of TOOL_SEO) {
        fs.writeFileSync(path.join(outDir, `${page.path.slice(1)}.html`), html.replace(SEO_BLOCK, renderHead(page, SITE_URL)));
      }

      const robots = ["User-agent: *", "Allow: /", ...(SITE_URL ? ["", `Sitemap: ${SITE_URL}/sitemap.xml`] : [])];
      fs.writeFileSync(path.join(outDir, "robots.txt"), robots.join("\n") + "\n");

      if (SITE_URL) {
        const today = new Date().toISOString().slice(0, 10);
        const urls = [HOME_SEO, ...TOOL_SEO]
          .map(
            (p) =>
              `  <url>\n    <loc>${SITE_URL}${p.path}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${p.path === "/" ? "1.0" : "0.8"}</priority>\n  </url>`
          )
          .join("\n");
        fs.writeFileSync(
          path.join(outDir, "sitemap.xml"),
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
        );
      } else {
        console.warn("[seo] SITE_URL not set: skipped sitemap.xml and absolute URLs (canonical, og:image).");
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), seo()],
  define: {
    __SITE_URL__: JSON.stringify(SITE_URL),
  },
  resolve: {
    alias: {
      "@": path.resolve("./src"),
    },
  },
  css: {
    postcss: "./postcss.config.js",
  },
});
