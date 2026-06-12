// Thin REFERENCE backend for the @pcbjam/shared contract.
//
// It serves a SINGLE KiCad project straight off the local filesystem
// (PROJECT_DIR) with no database, no auth, and no uploads — just enough for the
// standalone editor to enumerate the project, read its file tree, and stream
// file bytes. It exists to (a) let the GPL editor run end-to-end on its own and
// (b) document the minimum a "real" backend must implement. Collaboration is
// browser-tab only (BroadcastChannel) and needs nothing from the server.

import { createReadStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { initServer } from "@ts-rest/fastify";
import {
  contract,
  type Project,
  type ProjectFile,
} from "@pcbjam/shared";
import {
  itemBodyPath,
  type LibsConfig,
  libsConfig,
  listLibItems,
  listLibs,
} from "./libs.js";

const PROJECT_DIR = path.resolve(
  process.cwd(),
  process.env.PROJECT_DIR ?? "./project",
);
const PORT = Number(process.env.PORT ?? 3060);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3048";

const TEXT_EXT = new Set([
  ".kicad_pcb",
  ".kicad_sch",
  ".kicad_pro",
  ".kicad_sym",
  ".kicad_mod",
  ".kicad_dru",
  ".kicad_wks",
  ".net",
  ".txt",
  ".csv",
  ".json",
]);

function guessContentType(relPath: string): string {
  const ext = path.posix.extname(relPath).toLowerCase();
  return TEXT_EXT.has(ext)
    ? "text/plain; charset=utf-8"
    : "application/octet-stream";
}

/** Reject paths that escape PROJECT_DIR (traversal guard). */
function safeJoin(relPath: string): string {
  const normalized = path.posix
    .normalize(relPath.replace(/\\/g, "/"))
    .replace(/^(\.\.(\/|$))+/, "")
    .replace(/^\/+/, "");
  const abs = path.resolve(PROJECT_DIR, normalized);
  if (abs !== PROJECT_DIR && !abs.startsWith(PROJECT_DIR + path.sep)) {
    throw new Error(`path escapes project: ${relPath}`);
  }
  return abs;
}

const SLUG = (path.basename(PROJECT_DIR) || "project")
  .toLowerCase()
  .replace(/[^a-z0-9._-]+/g, "-")
  .replace(/^-+|-+$/g, "") || "project";

// Stable-per-process ids (no DB; the editor only needs them to be unique).
const PROJECT_ID = randomUUID();
const fileIds = new Map<string, string>();
function fileId(relPath: string): string {
  let id = fileIds.get(relPath);
  if (!id) {
    id = randomUUID();
    fileIds.set(relPath, id);
  }
  return id;
}

async function walk(dir: string, prefix = ""): Promise<ProjectFile[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: ProjectFile[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue; // skip dotfiles
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(abs, rel)));
    } else if (entry.isFile()) {
      const st = await fs.stat(abs);
      out.push({
        id: fileId(rel),
        projectId: PROJECT_ID,
        path: rel,
        size: st.size,
        contentType: guessContentType(rel),
        createdAt: st.birthtime.toISOString(),
        updatedAt: st.mtime.toISOString(),
      });
    }
  }
  return out;
}

async function project(): Promise<Project> {
  const st = await fs.stat(PROJECT_DIR);
  return {
    id: PROJECT_ID,
    slug: SLUG,
    name: path.basename(PROJECT_DIR) || SLUG,
    createdAt: st.birthtime.toISOString(),
    updatedAt: st.mtime.toISOString(),
  };
}

async function main(): Promise<void> {
  const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 * 1024 });
  await app.register(cors, {
    origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN.split(","),
  });
  app.get("/health", async () => ({ ok: true }));

  const libs: LibsConfig = libsConfig();

  const s = initServer();
  const router = s.router(contract, {
    listProjects: async () => ({ status: 200, body: [await project()] }),
    getProject: async ({ params }) => {
      if (params.project !== SLUG) {
        return { status: 404 as const, body: { message: "project not found" } };
      }
      return {
        status: 200 as const,
        body: { project: await project(), files: await walk(PROJECT_DIR) },
      };
    },
    listFiles: async ({ params }) => {
      if (params.project !== SLUG) {
        return { status: 404 as const, body: { message: "project not found" } };
      }
      return { status: 200 as const, body: await walk(PROJECT_DIR) };
    },
    listLibs: async () => ({ status: 200 as const, body: await listLibs(libs) }),
    listLibItems: async ({ params }) => {
      const items = await listLibItems(libs, params.lib);
      if (items === null) {
        return { status: 404 as const, body: { message: "library not found" } };
      }
      return { status: 200 as const, body: items };
    },
  });
  await app.register(s.plugin(router));

  // Streamed item-body fetch (text; intentionally not a ts-rest endpoint).
  app.get<{ Params: { lib: string; kind: string; name: string } }>(
    "/api/libs/:lib/items/:kind/:name",
    async (req, reply) => {
      const abs = itemBodyPath(libs, req.params.lib, req.params.kind, req.params.name);
      if (!abs) return reply.code(400).send({ message: "invalid item" });
      const st = await fs.stat(abs).catch(() => null);
      if (!st?.isFile()) {
        return reply.code(404).send({ message: "item not found" });
      }
      reply.header("Content-Type", "text/plain; charset=utf-8");
      reply.header("Content-Length", st.size);
      return reply.send(createReadStream(abs));
    },
  );

  // Streamed file-byte download (binary; intentionally not a ts-rest endpoint).
  app.get<{ Params: { project: string; "*": string } }>(
    "/api/projects/:project/files/*",
    async (req, reply) => {
      if (req.params.project !== SLUG) {
        return reply.code(404).send({ message: "project not found" });
      }
      let abs: string;
      try {
        abs = safeJoin(req.params["*"]);
      } catch {
        return reply.code(400).send({ message: "invalid path" });
      }
      const st = await fs.stat(abs).catch(() => null);
      if (!st?.isFile()) {
        return reply.code(404).send({ message: "file not found" });
      }
      reply.header("Content-Type", guessContentType(req.params["*"]));
      reply.header("Content-Length", st.size);
      return reply.send(createReadStream(abs));
    },
  );

  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`serving project "${SLUG}" from ${PROJECT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
