import * as React from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Pencil, Trash2 } from "lucide-react";
import { useLocalProjects } from "@/lib/api";
import { downloadBytes } from "@/lib/download";
import { localProjectStore } from "@/lib/project-source";
import { SOURCE_DESCRIPTORS } from "@/lib/project-source-shared";
import { zipFiles } from "@/lib/zip";
import { Button } from "@/components/ui/button";
import { SourceChip } from "@/components/SourceChip";

/**
 * The home-page list of browser-local (IndexedDB) projects — folders imported
 * via "Open a local folder" plus anything saved in the editor. Each row opens
 * the project (its own /p/:slug URL), exports it as a .zip, renames, or deletes.
 * Only rendered when the local store is enabled (LOCAL_PROJECTS_ENABLED).
 */
export function LocalProjectsSection() {
  const { data: projects, isLoading } = useLocalProjects();
  const qc = useQueryClient();
  const store = localProjectStore();
  const [busy, setBusy] = React.useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["local-projects"] });

  const exportZip = async (slug: string) => {
    if (!store) return;
    setBusy(slug);
    try {
      const files = await store.readFiles(slug);
      downloadBytes(`${slug}.zip`, zipFiles(files));
    } finally {
      setBusy(null);
    }
  };

  const rename = async (slug: string, current: string) => {
    if (!store) return;
    const name = window.prompt("Rename project", current)?.trim();
    if (!name || name === current) return;
    await store.renameProject(slug, name);
    void refresh();
  };

  const remove = async (slug: string, name: string) => {
    if (!store) return;
    if (!window.confirm(`Delete "${name}" from this browser? This can't be undone.`))
      return;
    await store.deleteProject(slug);
    void refresh();
  };

  return (
    <section className="mb-10">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-medium">
        Your projects
        <SourceChip descriptor={SOURCE_DESCRIPTORS.local} />
      </h2>
      {isLoading ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="animate-spin" /> loading…
        </p>
      ) : projects && projects.length > 0 ? (
        <div className="divide-y rounded-lg border">
          {projects.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">/p/{p.slug}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button asChild variant="secondary" size="sm">
                  <Link to={`/p/${p.slug}`}>Open</Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Download .zip"
                  disabled={busy === p.slug}
                  onClick={() => void exportZip(p.slug)}
                >
                  {busy === p.slug ? (
                    <Loader2 className="animate-spin" size={15} />
                  ) : (
                    <Download size={15} />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Rename"
                  onClick={() => void rename(p.slug, p.name)}
                >
                  <Pencil size={15} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Delete"
                  onClick={() => void remove(p.slug, p.name)}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border px-4 py-6 text-sm text-muted-foreground">
          No saved projects yet — open a local folder above to start. Files stay
          in this browser; export anytime with Download .zip.
        </p>
      )}
    </section>
  );
}
