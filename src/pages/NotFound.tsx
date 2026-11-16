import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { NOT_FOUND_SEO } from "../lib/seo";
import { useSeo } from "../lib/useSeo";

const NotFound = () => {
  useSeo(NOT_FOUND_SEO, { noindex: true });
  return (
    <div className="container flex min-h-[60vh] flex-col justify-center py-20">
      <p className="label-mono">Error 404</p>
      <h1 className="mt-4 text-5xl font-semibold tracking-[-0.035em]">Page not found</h1>
      <p className="mt-3 max-w-md text-lg text-muted-foreground">This page doesn't exist. The tools are all on the home page.</p>
      <Link
        to="/"
        className="mt-8 inline-flex h-10 w-fit items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to all tools
      </Link>
    </div>
  );
};

export default NotFound;
