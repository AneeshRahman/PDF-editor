import { useEffect } from "react";
import { fullTitle, structuredData, OG_IMAGE, type PageSeo } from "./seo";

declare const __SITE_URL__: string;

/** The production URL baked in at build time, or the current origin as a fallback. */
export const siteOrigin = () => (typeof __SITE_URL__ === "string" && __SITE_URL__) || window.location.origin;

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setLink(rel: string, href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!href) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

/**
 * Keeps <head> in step with the current page as the user navigates (the build also
 * pre-renders the same tags into each page's HTML for crawlers and link previews).
 */
export function useSeo(page: PageSeo, { noindex = false } = {}) {
  useEffect(() => {
    const origin = siteOrigin();
    const url = origin + page.path;
    const title = fullTitle(page);
    document.title = title;
    setMeta("name", "description", page.description);
    setMeta("name", "robots", noindex ? "noindex" : "index, follow, max-image-preview:large");
    setLink("canonical", noindex ? null : url);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", page.description);
    setMeta("property", "og:url", noindex ? origin + window.location.pathname : url);
    setMeta("property", "og:image", origin + OG_IMAGE);
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", page.description);
    setMeta("name", "twitter:image", origin + OG_IMAGE);

    let ld = document.getElementById("ld-json") as HTMLScriptElement | null;
    if (noindex) {
      // Pages kept out of search don't describe themselves.
      ld?.remove();
      return;
    }
    if (!ld) {
      ld = document.createElement("script");
      ld.type = "application/ld+json";
      ld.id = "ld-json";
      document.head.appendChild(ld);
    }
    ld.textContent = JSON.stringify(structuredData(page, origin));
  }, [page, noindex]);
}
