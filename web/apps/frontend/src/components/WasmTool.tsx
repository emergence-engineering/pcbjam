import * as React from "react";
import type { ProjectFile, Tool } from "@kicad-web/contract";
import { ChevronDown, ChevronUp } from "lucide-react";
import { fetchFileBytes } from "@/lib/api";
import { WASM_ASSET_BASE_URL } from "@/lib/config";
import { bootKicadTool } from "@/wasm/boot";
import { driveProjectIntoTool } from "@/wasm/kicad-runner";

/**
 * Boots a KiCad tool directly in this React document (no iframe): builds the
 * Emscripten `Module` config, injects the proven harness scripts (wx.js +
 * <tool>.js, the same artifacts the e2e tests use) into the page, then syncs the
 * project tree into MEMFS and drives File→Open. See src/wasm/boot.ts for why the
 * runtime is single-instance per page load.
 */
export function WasmTool({
  tool,
  slug,
  files,
  targetPath,
}: {
  tool: Tool;
  slug: string;
  files: ProjectFile[];
  targetPath?: string;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const startedRef = React.useRef(false);
  const [status, setStatus] = React.useState("Loading tool…");
  const [logs, setLogs] = React.useState<string[]>([]);
  const [showLog, setShowLog] = React.useState(false);

  const base = WASM_ASSET_BASE_URL.replace(/\/$/, "");

  React.useEffect(() => {
    // Guard re-entry: the WASM runtime is process-global and must boot exactly
    // once (see boot.ts). StrictMode is disabled app-wide for the same reason.
    if (startedRef.current) return;
    startedRef.current = true;

    const container = containerRef.current;
    if (!container) {
      setStatus("Error: tool container not mounted");
      return;
    }

    const append = (msg: string) =>
      setLogs((prev) => [...prev.slice(-800), msg]);
    const win = window as ToolWindow;

    void (async () => {
      try {
        await bootKicadTool({ tool, base, container, log: append, onStatus: setStatus });
        await driveProjectIntoTool(win, {
          tool,
          slug,
          files,
          targetPath,
          fetchBytes: (relPath) => fetchFileBytes(slug, relPath),
          log: append,
          onStatus: setStatus,
        });
      } catch (err) {
        append(`[fatal] ${String(err)}`);
        setStatus(`Error: ${String(err)}`);
      }
    })();
    // Boot is one-shot per mount; deps intentionally exclude files/targetPath so
    // they don't retrigger a (rejected) second boot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, slug, base]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#1a1a2e]">
      {/*
        wx.js addresses the DOM by id: #main-window is its top-level (id=0)
        window — it owns #canvas (created in boot's preRun) — and #window-container
        parents every child window. Both ids must exist before the runtime boots,
        mirroring the harness HTML (tests/apps/kicad/<tool>.html).
      */}
      <div ref={containerRef} id="main-window" className="absolute inset-0 h-full w-full" />
      <div id="window-container" />

      {status && (
        <div className="pointer-events-none absolute left-3 top-3 z-20 rounded bg-black/70 px-3 py-2 font-mono text-xs text-white">
          {status}
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 z-20">
        <button
          className="flex items-center gap-1 bg-black/70 px-3 py-1 font-mono text-xs text-white"
          onClick={() => setShowLog((s) => !s)}
        >
          {showLog ? <ChevronDown size={14} /> : <ChevronUp size={14} />} console
          ({logs.length})
        </button>
        {showLog && (
          <pre className="max-h-64 overflow-auto bg-black/85 p-3 font-mono text-[11px] leading-tight text-green-300">
            {logs.join("\n")}
          </pre>
        )}
      </div>
    </div>
  );
}
