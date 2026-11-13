import { Link } from "react-router-dom";

const NotFound = () => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-background">
    <h1 className="text-4xl font-bold">404</h1>
    <p className="text-muted-foreground">Page not found</p>
    <Link to="/" className="text-primary underline underline-offset-4">
      Back to all tools
    </Link>
  </div>
);

export default NotFound;
