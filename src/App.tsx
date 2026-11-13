import { BrowserRouter, Route, Routes, useParams } from "react-router-dom";
import { Toaster } from "./components/ui/toaster";
import { Toaster as Sonner } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { AppLayout } from "./components/AppLayout";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import { ToolPage } from "./pages/ToolPage";
import { getTool } from "./lib/tools";

/** Looks up the tool from the URL. The key resets all state when switching tools. */
const ToolRoute = () => {
  const { toolId } = useParams();
  const tool = getTool(toolId);
  return tool ? <ToolPage key={tool.id} tool={tool} /> : <NotFound />;
};

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner richColors position="bottom-right" />
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Home />} />
          <Route path=":toolId" element={<ToolRoute />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
