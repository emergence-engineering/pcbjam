import { Route, Routes } from "react-router-dom";
import { VersionBadge } from "@/components/VersionBadge";
import { useChromeHidden } from "@/lib/chrome-visibility";
import { HomePage } from "@/pages/HomePage";
import { LibToolPage } from "@/pages/LibToolPage";
import { ProjectView } from "@/pages/ProjectView";
import { ToolPage } from "@/pages/ToolPage";

export default function App() {
  const chromeHidden = useChromeHidden();
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        {/* scope/kind/name grammar (see @pcbjam/shared routes.ts). The tool is
            inferred from the file (or lib kind); `-/:tool` boots a fileless tool. */}
        <Route path="/:scope/projects/:name" element={<ProjectView />} />
        <Route path="/:scope/projects/:name/-/:tool" element={<ToolPage />} />
        <Route path="/:scope/projects/:name/*" element={<ToolPage />} />
        <Route path="/:scope/libs/:name" element={<LibToolPage />} />
      </Routes>
      {/* Version + source link, bottom-right on every route (home + editor).
          Keys off the Figma-like hide-UI toggle (hidden is the mobile default). */}
      {!chromeHidden && <VersionBadge />}
    </>
  );
}
