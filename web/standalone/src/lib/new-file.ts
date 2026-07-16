import { EXTENSION_TOOL, type Tool } from "@pcbjam/shared";

/**
 * Minimal valid empty documents per tool — the shapes the WASM KiCad build loads
 * cleanly (taken from the e2e fixtures; mirrors the closed app's NewFileDialog).
 * Creating a file from a template (rather than booting the editor blank) means it
 * already lives at a known path under the project, so every Save persists back
 * with none of the "save into the right folder" footgun. eeschema needs a unique
 * root uuid per new file; the others are uuid-free at the top level.
 */

/** Document tools (have a file extension) → that extension. Reverse EXTENSION_TOOL. */
export const TOOL_EXT = Object.fromEntries(
  Object.entries(EXTENSION_TOOL).map(([ext, tool]) => [tool, ext]),
) as Partial<Record<Tool, string>>;

/** The document tools that create a file (pcbnew / eeschema / pl_editor). */
export const DOCUMENT_TOOLS: Tool[] = [...new Set(Object.values(EXTENSION_TOOL))];

export function isDocumentTool(tool: Tool): boolean {
  return TOOL_EXT[tool] !== undefined;
}

/** Default file name for a new document of this tool, e.g. "main.kicad_pcb". */
export function defaultFileName(tool: Tool): string {
  return `main${TOOL_EXT[tool] ?? ""}`;
}

/** Ensure `name` carries the tool's extension (append if missing). */
export function withExtension(tool: Tool, name: string): string {
  const ext = TOOL_EXT[tool] ?? "";
  return ext && !name.toLowerCase().endsWith(ext) ? `${name}${ext}` : name;
}

/**
 * Minimal `.kicad_pro` a board/schematic can live next to. KiCad's PROJECT_FILE
 * (JSON_SETTINGS) fills every missing key with schema defaults, and the file's
 * mere existence is what unlocks the project-settings save paths (netclasses,
 * ERC/DRC exclusions, text variables — pcbnew/files.cpp gates them on
 * FileExists()); the first in-editor save then writes the full document.
 * `version` must track projectFileSchemaVersion (kicad common/project/project_file.cpp).
 */
export function defaultKicadPro(fileName: string): string {
  return `${JSON.stringify(
    { meta: { filename: fileName, version: 3 } },
    null,
    2,
  )}\n`;
}

export function newFileTemplate(tool: Tool, uuid: string): string {
  switch (tool) {
    case "eeschema":
      return `(kicad_sch
\t(version 20250114)
\t(generator "eeschema")
\t(generator_version "9.0")
\t(uuid "${uuid}")
\t(paper "A4")
\t(lib_symbols)
\t(sheet_instances
\t\t(path "/" (page "1"))
\t)
)
`;
    case "pcbnew":
      return `(kicad_pcb
\t(version 20241229)
\t(generator "pcbnew")
\t(generator_version "9.0")
\t(general (thickness 1.6))
\t(paper "A4")
\t(layers
\t\t(0 "F.Cu" signal)
\t\t(2 "B.Cu" signal)
\t\t(37 "F.SilkS" user)
\t\t(25 "Edge.Cuts" user)
\t)
\t(setup)
\t(net 0 "")
)
`;
    case "pl_editor":
      return `(kicad_wks (version 20220228) (generator "pl_editor") (generator_version "9.0")
\t(setup (textsize 1.5 1.5)(linewidth 0.15)(textlinewidth 0.15)
\t\t(left_margin 10)(right_margin 10)(top_margin 10)(bottom_margin 10))
)
`;
    default:
      return "";
  }
}
