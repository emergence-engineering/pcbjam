import type { Tool } from "@kicad-web/contract";

/**
 * KiCad config/version dir baked into the WASM build. The File→Open dialog
 * starts in MEMFS_PROJECTS_DIR; we mirror each project under a subfolder of it.
 *
 * NOTE (spec §11.1): this path is KiCad-version dependent and confirmed by
 * tests/kicad/load-pcb-probe.spec.ts. If the build's version dir changes, this
 * must change too — a candidate for reading from the module at runtime later.
 */
export const KICAD_VERSION_DIR = "9.99";
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
};

/**
 * Tools whose standalone entry (single_top.cpp) runs the first-run setup wizard
 * on launch. That wizard's modal loop crashes Asyncify in our ephemeral MEMFS,
 * so for these we seed a default KiCad config before main() to suppress it.
 * Mirrors which harness HTMLs include `seedKicadConfig` in preRun (eeschema only).
 */
export const TOOL_NEEDS_CONFIG_SEED: Record<Tool, boolean> = {
  pcbnew: false,
  eeschema: true,
  calculator: false,
};

/** KiCad user settings dir for this build (PATHS::GetUserSettingsPath()). */
export const KICAD_CONFIG_DIR = `/home/kicad/.config/kicad/kicad/${KICAD_VERSION_DIR}`;

export function memfsProjectDir(slug: string): string {
  return `${MEMFS_PROJECTS_DIR}/${slug}`;
}

export function memfsFilePath(slug: string, relPath: string): string {
  return `${memfsProjectDir(slug)}/${relPath}`;
}
