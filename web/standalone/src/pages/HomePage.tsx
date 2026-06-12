import * as React from "react";
import { Link } from "react-router-dom";
import type { Tool } from "@pcbjam/shared";
import { FolderOpen, Loader2 } from "lucide-react";
import { useProjects } from "@/lib/api";
import { downloadBytes } from "@/lib/download";
import { Button } from "@/components/ui/button";
import type { SaveBytes } from "@/wasm/save-flow";
import { LocalProjectView, type LocalFile } from "@/components/LocalProjectView";
import { WasmTool } from "@/components/WasmTool";

/** A KiCad project picked from the local filesystem (no backend involved). */
interface LocalProject {
  name: string;
  files: LocalFile[];
  fetchBytes: (relPath: string) => Promise<Uint8Array>;
  /**
   * Where editor saves land: write-back through File System Access handles
   * (folder picked via showDirectoryPicker), or a browser download per save
   * (webkitdirectory fallback — its FileList grants no write access).
   */
  saveBytes: SaveBytes;
}

/**
 * Build a LocalProject over File System Access handles (showDirectoryPicker,
 * Chromium): reads come from the live files, and editor saves are written
 * straight back to the user's folder on disk.
 */
async function buildFsaProject(root: FileSystemDirectoryHandle): Promise<LocalProject> {
  const handles = new Map<string, FileSystemFileHandle>();
  const files: LocalFile[] = [];
  async function walk(dir: FileSystemDirectoryHandle, prefix: string): Promise<void> {
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === "file") {
        const fh = handle as FileSystemFileHandle;
        handles.set(prefix + name, fh);
        files.push({ path: prefix + name, size: (await fh.getFile()).size });
      } else {
        await walk(handle as FileSystemDirectoryHandle, `${prefix}${name}/`);
      }
    }
  }
  await walk(root, "");
  return {
    name: root.name,
    files,
    fetchBytes: async (relPath) => {
      const handle = handles.get(relPath);
      if (!handle) throw new Error(`local file not found: ${relPath}`);
      return new Uint8Array(await (await handle.getFile()).arrayBuffer());
    },
    saveBytes: async (relPath, bytes) => {
      // Resolve (and create — the editor may save a brand-new file, e.g. a
      // .kicad_pro next to a board) the path under the picked root.
      const segs = relPath.split("/");
      const fileName = segs.pop();
      if (!fileName) throw new Error(`invalid save path: ${relPath}`);
      let dir = root;
      for (const seg of segs) dir = await dir.getDirectoryHandle(seg, { create: true });
      const handle =
        handles.get(relPath) ?? (await dir.getFileHandle(fileName, { create: true }));
      handles.set(relPath, handle);
      const writable = await handle.createWritable();
      await writable.write(bytes as unknown as FileSystemWriteChunkType);
      await writable.close();
    },
  };
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
  const files: LocalFile[] = [...map.entries()].map(([path, f]) => ({
    path,
    size: f.size,
  }));
  return {
    name: topPrefix ? topPrefix.slice(0, -1) : "local",
    files,
    fetchBytes: async (relPath) => {
      const f = map.get(relPath);
      if (!f) throw new Error(`local file not found: ${relPath}`);
      return new Uint8Array(await f.arrayBuffer());
    },
    // A webkitdirectory FileList is read-only — saves become downloads.
    saveBytes: async (relPath, bytes) => downloadBytes(relPath, bytes),
  };
}

export function HomePage() {
  const { data: projects, isLoading, error } = useProjects();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [local, setLocal] = React.useState<LocalProject | null>(null);
  const [launched, setLaunched] = React.useState<{ tool: Tool; target?: string } | null>(
    null,
  );

  // <input webkitdirectory> is non-standard; set it imperatively.
  React.useEffect(() => {
    if (inputRef.current) inputRef.current.setAttribute("webkitdirectory", "");
  }, []);

  // Once launched, the WASM runtime is process-global and one-shot for this page
  // load — render the editor full-screen and nothing else (no going back).
  if (local && launched) {
    return (
      <WasmTool
        tool={launched.tool}
        slug="local"
        projectId="local"
        files={local.files}
        targetPath={launched.target}
        fetchBytes={local.fetchBytes}
        saveBytes={local.saveBytes}
      />
    );
  }

  // Folder picked but no tool launched yet: the local twin of ProjectView.
  if (local) {
    return (
      <LocalProjectView
        name={local.name}
        files={local.files}
        onOpen={(tool, path) => setLaunched({ tool, target: path })}
        onBack={() => setLocal(null)}
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
        {window.showDirectoryPicker ? (
          <Button
            variant="outline"
            onClick={() => {
              void (async () => {
                let root: FileSystemDirectoryHandle;
                try {
                  root = await window.showDirectoryPicker!({ mode: "readwrite" });
                } catch {
                  return; // user cancelled the picker / denied write access
                }
                setLocal(await buildFsaProject(root));
              })();
            }}
          >
            <FolderOpen size={16} /> Choose folder
          </Button>
        ) : (
          // No File System Access API (Firefox/Safari): read-only folder input;
          // editor saves arrive as browser downloads instead of disk writes.
          <input
            ref={inputRef}
            type="file"
            multiple
            className="block text-sm"
            onChange={(e) => {
              const fl = e.target.files;
              if (!fl || fl.length === 0) return;
              setLocal(buildLocalProject(fl));
            }}
          />
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
