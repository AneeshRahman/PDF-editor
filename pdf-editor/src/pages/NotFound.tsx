import { Link } from "react-router-dom";

const NotFound = () => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
    <h1 className="text-4xl font-bold">404</h1>
    <p className="text-muted-foreground">Page not found</p>
    <Link to="/" className="text-primary underline underline-offset-4">
      Back to the editor
    </Link>
  </div>
);

export default NotFound;
