import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractAll,
  FOOTPRINT_MANIFEST,
  SYMBOL_MANIFEST,
} from "./extract-libs.js";

/**
 * Self-provision the example libraries the GPL reference backend serves, so a
 * bare `pcbjam` clone Just Works: clone the curated slice of upstream KiCad
 * symbol + footprint libraries (cached), extract them into the serve format,
 * and leave them in `<backend>/.libs` (which `libsConfig()` defaults to).
 *
 * Wired into the backend's `dev`/`start` (see package.json). Idempotent and
 * offline after the first run:
 *   - if `.libs` is already populated, it does nothing (no network);
 *   - otherwise it shallow + blobless + sparse-clones ONLY the needed lib dirs
 *     into `.cache/`, then extracts.
 *
 * Re-provision from scratch with `FORCE_EXAMPLE_LIBS=1`.
 */

// KiCad library tag to pin. 10.0.x ships the unpacked one-symbol-per-file
// (`<Lib>.kicad_symdir/`) format the extractor parses; 9.0.x is monolithic.
const KICAD_REF = "10.0.3";
const SYMBOLS_URL = "https://gitlab.com/kicad/libraries/kicad-symbols.git";
const FOOTPRINTS_URL = "https://gitlab.com/kicad/libraries/kicad-footprints.git";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(HERE, "../..");
const CACHE_DIR = path.join(BACKEND_ROOT, ".cache");
const OUT_DIR = path.join(BACKEND_ROOT, ".libs");
const SYMBOLS_SRC = path.join(CACHE_DIR, "kicad-symbols");
const FOOTPRINTS_SRC = path.join(CACHE_DIR, "kicad-footprints");

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`)),
    );
  });
}

async function exists(p: string): Promise<boolean> {
  return access(p)
    .then(() => true)
    .catch(() => false);
}

/**
 * Blobless + shallow + cone-sparse clone of only the lib directories we need
 * (kicad-footprints is large; we want a few `.pretty` dirs, not all of it).
 */
async function ensureCheckout(
  url: string,
  dest: string,
  sparseDirs: string[],
): Promise<void> {
  if (await exists(dest)) return; // cached — stay offline
  console.log(`[example-libs] cloning ${url} @ ${KICAD_REF} (sparse)…`);
  await run("git", [
    "clone",
    "--filter=blob:none",
    "--no-checkout",
    "--depth",
    "1",
    "--branch",
    KICAD_REF,
    url,
    dest,
  ]);
  await run("git", ["-C", dest, "sparse-checkout", "init", "--cone"]);
  await run("git", ["-C", dest, "sparse-checkout", "set", ...sparseDirs]);
  await run("git", ["-C", dest, "checkout"]);
}

async function provisioned(): Promise<boolean> {
  // A couple of representative index.json files signal a complete extract.
  const [sym, fp] = await Promise.all([
    exists(path.join(OUT_DIR, "Device", "index.json")),
    exists(path.join(OUT_DIR, "Resistor_SMD", "index.json")),
  ]);
  return sym && fp;
}

async function main(): Promise<void> {
  const force = process.env.FORCE_EXAMPLE_LIBS === "1";
  if (!force && (await provisioned())) {
    console.log(`[example-libs] ${OUT_DIR} already provisioned — skipping`);
    return;
  }

  const symbolDirs = Object.keys(SYMBOL_MANIFEST).map((l) => `${l}.kicad_symdir`);
  const footprintDirs = Object.keys(FOOTPRINT_MANIFEST).map((l) => `${l}.pretty`);

  await ensureCheckout(SYMBOLS_URL, SYMBOLS_SRC, symbolDirs);
  await ensureCheckout(FOOTPRINTS_URL, FOOTPRINTS_SRC, footprintDirs);

  console.log(`[example-libs] extracting -> ${OUT_DIR}`);
  const { libs, symbols, footprints } = await extractAll({
    symbolsSrc: SYMBOLS_SRC,
    footprintsSrc: FOOTPRINTS_SRC,
    out: OUT_DIR,
  });
  console.log(
    `[example-libs] ready: ${libs} lib(s), ${symbols} symbols + ${footprints} footprints`,
  );
}

main().catch((err) => {
  // Don't hard-fail the dev server over a libs hiccup (e.g. offline first run):
  // the backend still serves projects, just with no origin libraries.
  console.error(`[example-libs] WARN: ${err instanceof Error ? err.message : err}`);
  console.error("[example-libs] backend will start without origin libraries.");
});
