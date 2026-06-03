import * as fs from 'fs';
import * as path from 'path';
import type { FullConfig } from '@playwright/test';

/**
 * Global setup for the web-app e2e suite.
 *
 * The tests drive the real React app at :3048 and open files from the committed
 * "demo" project. That project is normally created by `pnpm db:migrate`
 * (seedDemoProject). This setup makes the suite self-sufficient: it waits for
 * the API to be reachable and, if the demo project is missing, recreates it by
 * uploading the committed seed-data files through the public API — the same
 * bytes db:seed uses. Idempotent.
 */

const API_BASE = process.env.VITE_API_BASE_URL ?? 'http://localhost:3050';
const SEED_DIR = path.resolve(__dirname, '../../web/apps/server/seed-data');
const DEMO_SLUG = 'demo';
const DEMO_FILES = ['demo.kicad_sch', 'demo.kicad_pcb', 'demo.kicad_wks'];

async function waitForApi(timeoutMs = 60000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr = '';
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${API_BASE}/health`);
      if (r.ok) return;
      lastErr = `HTTP ${r.status}`;
    } catch (e) {
      lastErr = (e as Error).message;
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error(
    `API not reachable at ${API_BASE} (${lastErr}). Start the web stack first: ` +
      `from web/ run \`pnpm db:up && pnpm db:migrate && pnpm dev\`.`
  );
}

async function ensureDemoProject(): Promise<void> {
  const existing = await fetch(`${API_BASE}/api/projects/${DEMO_SLUG}`);
  if (existing.ok) {
    const body = (await existing.json()) as { files: { path: string }[] };
    const have = new Set(body.files.map((f) => f.path));
    if (DEMO_FILES.every((f) => have.has(f))) return;
  } else {
    // Create the project (ignore 409 if a race created it).
    const created = await fetch(`${API_BASE}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Demo Project', slug: DEMO_SLUG }),
    });
    if (!created.ok && created.status !== 409) {
      throw new Error(`failed to create demo project: HTTP ${created.status}`);
    }
  }

  // Upload the committed seed bytes (multipart field-name = project-relative path).
  const form = new FormData();
  for (const name of DEMO_FILES) {
    const buf = fs.readFileSync(path.join(SEED_DIR, name));
    form.append(name, new Blob([buf]), name);
  }
  const up = await fetch(`${API_BASE}/api/projects/${DEMO_SLUG}/files`, {
    method: 'POST',
    body: form,
  });
  if (!up.ok) throw new Error(`failed to seed demo files: HTTP ${up.status}`);
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  await waitForApi();
  await ensureDemoProject();
}
