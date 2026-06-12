import {
  EXTENSION_TOOL,
  FILELESS_TOOLS,
  TOOL_LABELS,
  type Tool,
} from "@pcbjam/shared";
import { ArrowLeft, ExternalLink, FolderOpen } from "lucide-react";
import { formatBytes } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface LocalFile {
  path: string;
  size?: number;
}

function toolForPath(path: string): Tool | null {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return null;
  return EXTENSION_TOOL[path.slice(dot).toLowerCase()] ?? null;
}

/**
 * The local-folder twin of ProjectView: list the picked folder's files and open
 * one in its tool. Unlike backend projects this CANNOT navigate (the folder
 * handles / File objects live in this page's JS memory and don't survive a
 * reload), so opening is a callback that swaps this view for the editor
 * in-place — and "Back" only works until a tool has launched (the WASM runtime
 * is one-shot per page load).
 */
export function LocalProjectView({
  name,
  files,
  onOpen,
  onBack,
}: {
  name: string;
  files: LocalFile[];
  /** Launch a tool; `path` is undefined for file-less tools. */
  onOpen: (tool: Tool, path?: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="container py-10">
      <Button variant="ghost" size="sm" className="mb-4" onClick={onBack}>
        <ArrowLeft /> Back
      </Button>

      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <FolderOpen size={22} /> {name}
        </h1>
        <p className="text-sm text-muted-foreground">
          local folder — files stay in your browser
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        {[...FILELESS_TOOLS].map((tool) => (
          <button
            key={tool}
            className="text-sm underline underline-offset-4"
            onClick={() => onOpen(tool)}
          >
            Open {TOOL_LABELS[tool]}
          </button>
        ))}
      </div>

      <h2 className="mb-3 text-lg font-medium">Files ({files.length})</h2>
      <div className="divide-y rounded-lg border">
        {files.map((f) => {
          const tool = toolForPath(f.path);
          return (
            <div
              key={f.path}
              className="flex items-center justify-between gap-4 px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-sm">{f.path}</p>
                {f.size !== undefined && (
                  <p className="text-xs text-muted-foreground">{formatBytes(f.size)}</p>
                )}
              </div>
              {tool && (
                <button
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
                  onClick={() => onOpen(tool, f.path)}
                >
                  <ExternalLink size={14} /> Open in {TOOL_LABELS[tool]}
                </button>
              )}
            </div>
          );
        })}
        {files.length === 0 && (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            No files in this folder.
          </div>
        )}
      </div>
    </div>
  );
}
