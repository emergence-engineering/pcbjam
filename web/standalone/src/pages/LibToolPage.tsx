import { useParams } from "react-router-dom";
import { toolSchema } from "@pcbjam/shared";
import { libsSourceForLib } from "@/lib/config";
import { WasmTool } from "@/components/WasmTool";
import { PreflightGate } from "@/preflight/PreflightGate";

/**
 * Open one BACKEND library scoped to itself in its editor, addressed by URL:
 *   /l/<libId>/<tool>        e.g. /l/Diode/symbol_editor
 *
 * Deep-linkable + reload-safe (unlike the home page's in-place lib launch). The
 * editor boots with no project/files and a `scopedLibsSource` so its lib tree
 * shows exactly this one library. (Local lib FILES can't be URL-addressed — they
 * stay an in-place launch on the home page.)
 */
export function LibToolPage() {
  const params = useParams();
  const libId = params.lib ?? "";
  const parsedTool = toolSchema.safeParse(params.tool);

  if (!parsedTool.success) {
    return (
      <div className="container py-10 text-destructive">
        Unknown tool: {params.tool}
      </div>
    );
  }

  const libsSource = libsSourceForLib(libId, "local");

  return (
    <PreflightGate>
      <WasmTool
        tool={parsedTool.data}
        slug="local"
        projectId="local"
        files={[]}
        libsSource={libsSource}
        fetchBytes={async (relPath) => {
          throw new Error(`no project file to fetch: ${relPath}`);
        }}
      />
    </PreflightGate>
  );
}
