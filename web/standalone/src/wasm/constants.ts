import type { Tool } from "@pcbjam/shared";

/**
 * KiCad config/version dir baked into the WASM build. The File→Open dialog
 * starts in MEMFS_PROJECTS_DIR; we mirror each project under a subfolder of it.
 *
 * NOTE (spec §11.1): this path is KiCad-version dependent and confirmed by
 * tests/kicad/load-pcb-probe.spec.ts. If the build's version dir changes, this
 * must change too — a candidate for reading from the module at runtime later.
 * It MUST match KiCad's GetMajorMinorVersion() (== PATHS::GetUserSettingsPath()'s
 * version subdir); otherwise the seeded sym-lib-table/config is written to a dir
 * the WASM never reads and the symbol/footprint choosers come up empty. The
 * KiCad 10.0.4 rebase bumped this from "9.99" to "10.0".
 */
export const KICAD_VERSION_DIR = "10.0";
export const MEMFS_PROJECTS_DIR = `/home/kicad/documents/kicad/${KICAD_VERSION_DIR}/projects`;

/** Where KiCad expects images.tar.gz (compiled-in KICAD_DATA path). */
export const RESOURCE_PATH =
  "/workspace/build-wasm/sysroot/share/kicad/resources";

/**
 * argv[0] each tool's DEBUG check expects. These MUST match the values the
 * proven harness HTMLs set as `Module.thisProgram` (tests/apps/kicad/<tool>.html)
 * — notably the calculator binary is `pcb_calculator`, not `calculator`.
 */
export const TOOL_ARGV0: Record<Tool, string> = {
  pcbnew: "/usr/bin/pcbnew",
  eeschema: "/usr/bin/eeschema",
  calculator: "/usr/bin/pcb_calculator",
  pl_editor: "/usr/bin/pl_editor",
  symbol_editor: "/usr/bin/symbol_editor",
  footprint_editor: "/usr/bin/footprint_editor",
  gerbview: "/usr/bin/gerbview",
};

/**
 * Every standalone tool here boots through common/single_top.cpp, which runs
 * STARTWIZARD::CheckAndRun() — the first-run "KiCad Setup" wizard. It shows
 * whenever any provider (SETTINGS / LIBRARIES / PRIVACY) reports
 * NeedsUserInput(), which is always true on our ephemeral MEMFS with no config,
 * and its modal loop crashes Asyncify. So for all of them we seed a default
 * KiCad config before main() (kicad_common.json privacy flags + the lib-tables
 * the providers check) so NeedsUserInput() is false and the wizard is skipped.
 */
export const TOOL_NEEDS_CONFIG_SEED: Record<Tool, boolean> = {
  pcbnew: true,
  eeschema: true,
  calculator: true,
  pl_editor: true,
  symbol_editor: true,
  footprint_editor: true,
  gerbview: true,
};

/**
 * Which library kind a tool consumes — drives which lib-table boot populates
 * from the lib source (symbol → sym-lib-table; footprint → fp-lib-table). A
 * user lib is a kind-agnostic container, so the same lib id can land in both
 * tables depending on the tool. `null` = the tool uses no libraries.
 */
export const TOOL_LIB_KIND: Record<Tool, "symbol" | "footprint" | null> = {
  pcbnew: "footprint",
  eeschema: "symbol",
  calculator: null,
  pl_editor: null,
  symbol_editor: "symbol",
  footprint_editor: "footprint",
  gerbview: null,
};

/** KiCad user settings dir for this build (PATHS::GetUserSettingsPath()). */
export const KICAD_CONFIG_DIR = `/home/kicad/.config/kicad/kicad/${KICAD_VERSION_DIR}`;

export function memfsProjectDir(slug: string): string {
  return `${MEMFS_PROJECTS_DIR}/${slug}`;
}

export function memfsFilePath(slug: string, relPath: string): string {
  return `${memfsProjectDir(slug)}/${relPath}`;
}
