import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { Lib, Tool } from "@pcbjam/shared";
import { FolderOpen, Library, Loader2, Package } from "lucide-react";
import { useLibs, useProjects } from "@/lib/api";
import { LOCAL_PROJECTS_ENABLED, PROJECT_SOURCE_KIND } from "@/lib/config";
import { localFileLibsSource } from "@/wasm/libs/local-file-source";
import type { LibsSource } from "@/wasm/libs/source";
import { downloadBytes } from "@/lib/download";
import { importFileList, importFsaFolder } from "@/lib/import-folder";
import { localProjectStore } from "@/lib/project-source";
import { SOURCE_DESCRIPTORS } from "@/lib/project-source-shared";
import { Button } from "@/components/ui/button";
import { ToolGrid } from "@/components/ToolGrid";
import { SourceChip } from "@/components/SourceChip";
import { LocalProjectsSection } from "@/components/LocalProjectsSection";
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
  // Static (no-backend) demo mode: projects come from a read-only CDN gallery,
  // there are no backend libraries, and editor saves download to local.
  const staticMode = PROJECT_SOURCE_KIND === "static";
  // When on, loaded folders import into a browser-local (IDB) project with its
  // own URL instead of the in-page File System Access write-back flow.
  const localEnabled = LOCAL_PROJECTS_ENABLED;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: projects, isLoading, error } = useProjects();
  const symbolLibs = useLibs("symbol");
  const footprintLibs = useLibs("footprint");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [local, setLocal] = React.useState<LocalProject | null>(null);
  const [launched, setLaunched] = React.useState<{ tool: Tool; target?: string } | null>(
    null,
  );
  // A tool launched straight from the home page — no local folder, no backend
  // project. File-less editors browse backend libraries; document editors
  // (schematic/PCB/drawing sheet) boot to a blank document (KiCad-launcher style).
  // `libsSource`, when set, scopes the editor to ONE library (a backend lib, or a
  // local lib file); omitted ⇒ the editor's configured default source.
  const [launchedTool, setLaunchedTool] = React.useState<{
    tool: Tool;
    libsSource?: LibsSource | null;
  } | null>(null);

  // <input webkitdirectory> is non-standard; set it imperatively.
  React.useEffect(() => {
    if (inputRef.current) inputRef.current.setAttribute("webkitdirectory", "");
  }, []);

  // Import a picked folder into the browser-local store as a new editable
  // project, then open it at its own /p/:slug URL. The original disk files are
  // untouched (this is a copy); edits persist to IDB, export via Download .zip.
  const importToLocal = async (imported: { name: string; files: { path: string; bytes: Uint8Array }[] }) => {
    const store = localProjectStore();
    if (!store) return;
    const project = await store.createProject(imported.name, imported.files);
    await queryClient.invalidateQueries({ queryKey: ["local-projects"] });
    navigate(`/p/${project.slug}`);
  };

  // Tool launched from the home page: no project, no files. File-less editors
  // read libraries from the backend (libsSourceConfig) and persist through the
  // lib write bridge; document editors open a blank document. Either way there's
  // no project fetch/save plumbing to wire.
  if (launchedTool) {
    return (
      <WasmTool
        tool={launchedTool.tool}
        slug="local"
        projectId="local"
        files={[]}
        libsSource={launchedTool.libsSource}
        fetchBytes={async (p) => {
          throw new Error(`no project file to fetch: ${p}`);
        }}
      />
    );
  }

  // Once launched over a local folder, the WASM runtime is process-global and
  // one-shot for this page load — render the editor full-screen and nothing else.
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
        onOpenLib={(tool, path) => {
          void (async () => {
            const bytes = await local.fetchBytes(path);
            const text = new TextDecoder().decode(bytes);
            const id = (path.split("/").pop() ?? path).replace(
              /\.(kicad_sym|kicad_mod)$/i,
              "",
            );
            const kind = tool === "footprint_editor" ? "footprint" : "symbol";
            setLaunchedTool({
              tool,
              libsSource: localFileLibsSource(id, text, kind),
            });
          })();
        }}
        onBack={() => setLocal(null)}
      />
    );
  }

  return (
    <div className="container max-w-3xl py-10">
      <h1 className="text-2xl font-semibold tracking-tight">PCBJam</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        {staticMode
          ? "Edit KiCad files in your browser — open an example below or your own local folder. Nothing is uploaded; Save downloads to your machine."
          : "Open KiCad files in the browser — from a backend, or straight from a local folder."}
      </p>

      {/* --- Local folder --- */}
      <section className="mb-10 rounded-lg border p-5">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-medium">
          <FolderOpen size={18} /> Open a local folder
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {localEnabled
            ? "No upload — a copy is imported into this browser as an editable project (your original files aren't touched). Save persists here; export anytime with Download .zip."
            : "No upload — files stay in your browser. Pick a folder containing a KiCad project."}
        </p>
        {window.showDirectoryPicker ? (
          <Button
            variant="outline"
            onClick={() => {
              void (async () => {
                let root: FileSystemDirectoryHandle;
                try {
                  // Import only needs read; the write-back flow needs readwrite.
                  root = await window.showDirectoryPicker!({
                    mode: localEnabled ? "read" : "readwrite",
                  });
                } catch {
                  return; // user cancelled the picker / denied access
                }
                if (localEnabled) await importToLocal(await importFsaFolder(root));
                else setLocal(await buildFsaProject(root));
              })();
            }}
          >
            <FolderOpen size={16} /> Choose folder
          </Button>
        ) : (
          // No File System Access API (Firefox/Safari): folder input. With the
          // local store on, the files are imported into IDB; otherwise it's a
          // read-only session where editor saves arrive as browser downloads.
          <input
            ref={inputRef}
            type="file"
            multiple
            className="block text-sm"
            onChange={(e) => {
              const fl = e.target.files;
              if (!fl || fl.length === 0) return;
              if (localEnabled) {
                void (async () => importToLocal(await importFileList(fl)))();
              } else {
                setLocal(buildLocalProject(fl));
              }
            }}
          />
        )}
      </section>

      {/* --- Your browser-local projects (imported folders + saved work) --- */}
      {localEnabled && <LocalProjectsSection />}

      {/* --- Tools (KiCad-style launcher for the standalone tools) --- */}
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">Tools</h2>
        <ToolGrid onLaunch={(tool) => setLaunchedTool({ tool })} />
      </section>

      {/* --- Projects (backend, or the static example gallery) --- */}
      <section className="mb-10">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-medium">
          {staticMode ? "Example projects" : "Projects from the backend"}
          <SourceChip
            descriptor={
              staticMode
                ? SOURCE_DESCRIPTORS["remote-ro"]
                : SOURCE_DESCRIPTORS["remote-rw"]
            }
          />
        </h2>
        {isLoading && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="animate-spin" /> loading…
          </p>
        )}
        {error && (
          <p className="text-sm text-muted-foreground">
            {staticMode
              ? `Couldn't load the example gallery (${(error as Error).message}). Use a local folder above.`
              : `No backend reachable (${(error as Error).message}). Use a local folder above, or configure VITE_API_BASE_URL.`}
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
              {staticMode ? "No example projects." : "The backend has no projects."}
            </div>
          )}
        </div>
      </section>

      {/* --- Backend libraries (hidden in the no-backend static demo) --- */}
      {!staticMode && (
        <section>
          <h2 className="mb-3 text-lg font-medium">Libraries from the backend</h2>
          <div className="space-y-3">
            <LibGroup
              icon={<Library size={16} />}
              label="Symbols"
              query={symbolLibs}
              tool="symbol_editor"
            />
            <LibGroup
              icon={<Package size={16} />}
              label="Footprints"
              query={footprintLibs}
              tool="footprint_editor"
            />
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * One backend-library group (Symbols / Footprints): each lib is a deep-link to
 * `/l/<libId>/<tool>` (LibToolPage), which boots the editor scoped to that one
 * library. A full navigation (anchor) gives Emscripten a clean page.
 */
function LibGroup({
  icon,
  label,
  query,
  tool,
}: {
  icon: React.ReactNode;
  label: string;
  query: ReturnType<typeof useLibs>;
  tool: Tool;
}) {
  const { data: libs, isLoading, error } = query;
  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
        {icon} {label}
      </h3>
      {isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="animate-spin" size={14} /> loading…
        </p>
      )}
      {error && (
        <p className="text-sm text-muted-foreground">No backend reachable.</p>
      )}
      {libs && libs.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No {label.toLowerCase()} libraries.
        </p>
      )}
      {libs && libs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {libs.map((lib) => (
            <a
              key={lib.id}
              href={`/l/${encodeURIComponent(lib.id)}/${tool}`}
              title={lib.description ?? undefined}
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm hover:bg-accent"
            >
              {lib.name}
              {lib.itemCount !== undefined && (
                <span className="text-xs text-muted-foreground">
                  {lib.itemCount}
                </span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
