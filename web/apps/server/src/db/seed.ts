import * as fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { env } from "../env.js";
import { db, pool } from "./index.js";
import { owners } from "./schema.js";
import {
  createProject,
  getProjectRowBySlug,
  writeProjectFile,
} from "../services/projects.js";

/** Ensure the default owner namespace exists (no-auth iteration). */
export async function seedDefaultOwner(): Promise<string> {
  const existing = await db
    .select()
    .from(owners)
    .where(eq(owners.slug, env.DEFAULT_OWNER_SLUG))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const inserted = await db
    .insert(owners)
    .values({ slug: env.DEFAULT_OWNER_SLUG })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0].id;

  // Lost a race; re-read.
  const row = await db
    .select()
    .from(owners)
    .where(eq(owners.slug, env.DEFAULT_OWNER_SLUG))
    .limit(1);
  if (!row[0]) throw new Error("failed to seed default owner");
  return row[0].id;
}

/**
 * Demo project bytes committed at <server>/seed-data/. Resolved relative to this
 * module so it works both under tsx (src/db/) and compiled (dist/db/) — both are
 * two levels below the package root, where seed-data lives.
 */
const SEED_DATA_DIR = new URL("../../seed-data/", import.meta.url);

const DEMO_SLUG = "demo";
const DEMO_NAME = "Demo Project";
/** Committed files → project-relative paths. One per openable tool. */
const DEMO_FILES = [
  "demo.kicad_sch", // eeschema (Schematic Editor)
  "demo.kicad_pcb", // pcbnew (PCB Editor)
  "demo.kicad_wks", // pl_editor (Drawing Sheet Editor)
] as const;

/**
 * Seed a ready-to-open demo project so a freshly cloned + migrated install has
 * something to click on (and to exercise the tool wiring). Idempotent: skips if
 * the "demo" project already exists. Reads bytes from the committed seed-data/
 * dir, so it needs no submodule checkout at runtime.
 */
export async function seedDemoProject(): Promise<void> {
  if (await getProjectRowBySlug(DEMO_SLUG)) {
    console.log(`demo project "${DEMO_SLUG}" already exists — skipping`);
    return;
  }

  const project = await createProject(DEMO_NAME, DEMO_SLUG);
  const row = await getProjectRowBySlug(DEMO_SLUG);
  if (!row) throw new Error("demo project vanished right after creation");

  for (const name of DEMO_FILES) {
    const data = await fs.readFile(fileURLToPath(new URL(name, SEED_DATA_DIR)));
    await writeProjectFile({ project: row, rawPath: name, data });
    console.log(`  seeded ${DEMO_SLUG}/${name} (${data.length} bytes)`);
  }
  console.log(`seeded demo project "${project.slug}" with ${DEMO_FILES.length} files`);
}

// Allow running standalone: `pnpm db:seed`.
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDefaultOwner()
    .then(async (id) => {
      console.log(`seeded default owner: ${id}`);
      await seedDemoProject();
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
