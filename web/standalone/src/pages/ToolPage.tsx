import { useParams } from "react-router-dom";
import { toolSchema } from "@pcbjam/shared";
import { fetchFileBytes, useProject } from "@/lib/api";
import { WasmTool } from "@/components/WasmTool";

export function ToolPage() {
  const params = useParams();
  const slug = params.project ?? "";
  const targetPath = params["*"] || undefined;

  const parsedTool = toolSchema.safeParse(params.tool);
  const { data, isLoading, error } = useProject(slug);

  if (!parsedTool.success) {
    return (
      <div className="container py-10 text-destructive">
        Unknown tool: {params.tool}
      </div>
    );
  }

  if (isLoading) {
    return <div className="container py-10 text-muted-foreground">loading…</div>;
  }
  if (error || !data) {
    return (
      <div className="container py-10 text-destructive">
        {(error as Error)?.message ?? "project not found"}
      </div>
    );
  }

  return (
    <WasmTool
      tool={parsedTool.data}
      slug={slug}
      projectId={data.project.id}
      files={data.files}
      targetPath={targetPath}
      fetchBytes={(relPath) => fetchFileBytes(slug, relPath)}
    />
  );
}
