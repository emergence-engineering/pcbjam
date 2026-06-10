import * as React from "react";
import { Link } from "react-router-dom";
import {
  EXTENSION_TOOL,
  FILELESS_TOOLS,
  TOOL_LABELS,
  TOOLS,
  type Tool,
} from "@pcbjam/shared";
import { FolderOpen, Loader2 } from "lucide-react";
import { useProjects } from "@/lib/api";
import { Button } from "@/components/ui/button";
import type { ToolFile } from "@/wasm/kicad-runner";
import { WasmTool } from "@/components/WasmTool";

/** A KiCad project picked from the local filesystem (no backend involved). */
interface LocalProject {
  name: string;
  files: ToolFile[];
  fetchBytes: (relPath: string) => Promise<Uint8Array>;
  defaultTool?: Tool;
  defaultTarget?: string;
}

function toolForPath(path: string): Tool | null {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return null;
  return EXTENSION_TOOL[path.slice(dot).toLowerCase()] ?? null;
}

/** Build a LocalProject from a webkitdirectory FileList, stripping the top folder. */
function buildLocalProject(fileList: FileList): LocalProject {
  const map = new Map<string, File>();
  const first = fileList[0];
  const topPrefix =
    first?.webkitRelativePath?.includes("/")
      ? first.webkitRelativePath.split("/")[0] + "/"
      : "";
  for (const f of Array.from(fileList)) {
    const rel = f.webkitRelativePath || f.name;
    map.set(rel.startsWith(topPrefix) ? rel.slice(topPrefix.length) : rel, f);
  }
  const files: ToolFile[] = [...map.keys()].map((path) => ({ path }));
  let defaultTool: Tool | undefined;
  let defaultTarget: string | undefined;
  for (const { path } of files) {
    const tool = toolForPath(path);
    if (tool) {
      defaultTool = tool;
      defaultTarget = path;
      break;
    }
  }
  return {
    name: topPrefix ? topPrefix.slice(0, -1) : "local",
    files,
    defaultTool,
    defaultTarget,
    fetchBytes: async (relPath) => {
      const f = map.get(relPath);
      if (!f) throw new Error(`local file not found: ${relPath}`);
      return new Uint8Array(await f.arrayBuffer());
    },
  };
}

export function HomePage() {
  const { data: projects, isLoading, error } = useProjects();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [local, setLocal] = React.useState<LocalProject | null>(null);
  const [tool, setTool] = React.useState<Tool | "">("");
  const [launched, setLaunched] = React.useState(false);

  // <input webkitdirectory> is non-standard; set it imperatively.
  React.useEffect(() => {
    if (inputRef.current) inputRef.current.setAttribute("webkitdirectory", "");
  }, []);

  // Once launched, the WASM runtime is process-global and one-shot for this page
  // load — render the editor full-screen and nothing else (no going back).
  if (launched && local && tool) {
    const target = tool === local.defaultTool ? local.defaultTarget : undefined;
    return (
      <WasmTool
        tool={tool}
        slug="local"
        projectId="local"
        files={local.files}
        targetPath={FILELESS_TOOLS.has(tool) ? undefined : target}
        fetchBytes={local.fetchBytes}
      />
    );
  }

  return (
    <div className="container max-w-3xl py-10">
      <h1 className="text-2xl font-semibold tracking-tight">PCBJam</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Open KiCad files in the browser — from a backend, or straight from a
        local folder.
      </p>

      {/* --- Local folder --- */}
      <section className="mb-10 rounded-lg border p-5">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-medium">
          <FolderOpen size={18} /> Open a local folder
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          No upload — files stay in your browser. Pick a folder containing a
          KiCad project.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="block text-sm"
          onChange={(e) => {
            const fl = e.target.files;
            if (!fl || fl.length === 0) return;
            const proj = buildLocalProject(fl);
            setLocal(proj);
            setTool(proj.defaultTool ?? "");
          }}
        />

        {local && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {local.files.length} files
            </span>
            <select
              className="rounded-md border px-2 py-1.5 text-sm"
              value={tool}
              onChange={(e) => setTool(e.target.value as Tool)}
            >
              <option value="">Select a tool…</option>
              {TOOLS.map((t) => (
                <option key={t} value={t}>
                  {TOOL_LABELS[t]}
                </option>
              ))}
            </select>
            <Button disabled={!tool} onClick={() => setLaunched(true)}>
              Open editor
            </Button>
          </div>
        )}
      </section>

      {/* --- Backend projects --- */}
      <section>
        <h2 className="mb-3 text-lg font-medium">Projects from the backend</h2>
        {isLoading && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="animate-spin" /> loading…
          </p>
        )}
        {error && (
          <p className="text-sm text-muted-foreground">
            No backend reachable ({(error as Error).message}). Use a local folder
            above, or configure VITE_API_BASE_URL.
          </p>
        )}
        <div className="divide-y rounded-lg border">
          {projects?.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">/p/{p.slug}</p>
              </div>
              <Button asChild variant="secondary" size="sm">
                <Link to={`/p/${p.slug}`}>Open</Link>
              </Button>
            </div>
          ))}
          {projects && projects.length === 0 && (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              The backend has no projects.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
