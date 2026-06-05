# 0001 — KiCad-WASM Web App Spec

Status: **Refined spec, ready for `implement plan`**
Branch: `feature/web-init`
Scope of this iteration: **create a project, open a project, upload files, open a file in a WASM tool via URL.**

This document is the agreed design after a clarification pass. Decisions that were
explicitly chosen by the user are marked **[decided]**. Items intentionally pushed to a
later iteration are marked **[later]**. Sensible defaults that were *not* explicitly
discussed are marked **[default]** and are safe to change during planning.

---

## 1. Goal

A single web application that lets a user create/open KiCad projects, upload files into
them, and open a file in the matching WASM tool (pcbnew / eeschema / calculator) by
visiting a URL such as:

```
/p/project5/pcbnew/nyak.kicad_pcb
```

The WASM apps already exist as `<tool>.js` + `<tool>.wasm` pairs (see `output/` and
`tests/apps/kicad/`). They boot into an Emscripten harness and read files from MEMFS.
This web app wraps that: it manages projects + files server-side, and on a tool URL it
boots the right WASM app and feeds it the project's files via `FS.writeFile`, then drives
File→Open on the target file.

Non-goals this iteration: editing/saving back, collaboration, auth/login.

---

## 2. Key decisions (summary table)

| Area | Decision |
|---|---|
| Frontend | React + TypeScript + Vite + shadcn/ui **[decided]** |
| Backend | Fastify + ts-rest + Zod **[decided]** |
| Shared types | `packages/contract` (ts-rest contract + Zod) imported by FE client & BE router **[decided]** |
| Realtime | None now; pick stack that allows Hocuspocus/WSS later, no WS endpoints yet **[decided]** |
| URL semantics | `/p/:project/:tool/*filepath` — `tool` selects the WASM app, `*filepath` is auto-opened **[decided]** |
| Auth/tenancy | No auth now, but data model namespaced by an owner id for later multi-user **[decided]** |
| Metadata store | Postgres now, accessed via Drizzle (drizzle-zod shares schemas) **[decided]** |
| File blob storage | Pluggable `FileStorage` interface; local-disk impl now, S3 later **[decided]** |
| Open behavior | Sync **whole project tree** into MEMFS, then auto-open target **[decided]**; lazy/partial load **[later]** |
| Upload | Individual files (multi), folder (preserve structure), and `.zip` of a project **[decided]** |
| WASM artifact delivery | Served from a **configurable base location** (URL/dir): local Fastify static from `output/` in dev, public S3 URL in prod **[decided]** |
| Save-back / sync | Read-only open now; write interface defined but unused. Save-back + lazy load land together **[later]** |
| Monorepo | pnpm + turbo workspace under `web/` **[decided]** |

---

## 3. Repository / monorepo layout  **[decided: under `web/`]**

```
web/
├── package.json                  # pnpm workspace root
├── pnpm-workspace.yaml
├── turbo.json
├── .env.example
├── docker-compose.yml            # local Postgres (and later: minio for S3 parity)
├── apps/
│   ├── frontend/                 # Vite + React + TS + shadcn
│   └── server/                   # Fastify + ts-rest + Drizzle
└── packages/
    ├── contract/                 # ts-rest contract + Zod schemas (shared)
    ├── storage/                  # FileStorage interface + local-disk impl (+ S3 later)
    └── config/                   # shared tsconfig / eslint / env parsing  [default]
```

Rationale: isolates the JS/TS app from the C++/WASM build repo at root (`kicad/`,
`wxwidgets/`, `scripts/`, `docker/`). The web app consumes WASM artifacts produced by the
existing build, it does not build them.

Root `.gitignore` should ignore `web/**/node_modules`, `web/**/dist`, build caches.

---

## 4. Domain model

### 4.1 Entities (Postgres, via Drizzle)  **[decided: Postgres + Drizzle]**

```
owner            -- namespace for "no auth now, multi-user later"
  id             uuid pk
  slug           text unique         -- e.g. "default" now; becomes real users later
  created_at     timestamptz

project
  id             uuid pk
  owner_id       uuid fk -> owner.id
  slug           text                -- URL segment, unique within owner (e.g. "project5")
  name           text                -- human display name
  created_at     timestamptz
  updated_at     timestamptz
  unique(owner_id, slug)

project_file                          -- index of files; bytes live in FileStorage
  id             uuid pk
  project_id     uuid fk -> project.id
  path           text                -- POSIX-relative within project, e.g. "pcbnew/nyak.kicad_pcb"
  size           bigint
  content_type   text
  storage_key    text                -- opaque key handed to FileStorage
  created_at     timestamptz
  updated_at     timestamptz
  unique(project_id, path)
```

- **Owner namespace [decided]**: every project belongs to an `owner`. This iteration uses a
  single seeded owner (`slug = "default"`); the URL omits owner (`/p/:project/...`) and the
  server resolves it to the default owner. Adding real auth later = populate `owner` per
  user and prefix routes, **no schema migration needed**.
- `project_file.path` is the canonical project-relative path. The `storage_key` decouples
  the logical path from however the blob backend names things (so renames/S3 layout are free).

drizzle-zod derives Zod schemas from these tables; those Zod schemas feed the ts-rest
contract so DB ↔ API ↔ client share one source of truth.

### 4.2 What "project" means at the byte level

A project is a directory tree of files (`.kicad_pro`, `.kicad_pcb`, `.kicad_sch`,
`fp-lib-table`, `sym-lib-table`, footprint/symbol lib dirs, etc.). `project_file` rows
enumerate the tree; bytes live behind `FileStorage`.

---

## 5. Storage abstraction  **[decided: pluggable, local now, S3 later]**

`packages/storage` exposes a single interface. The whole iteration is **read-heavy**; write
methods exist so save-back **[later]** needs no redesign.

```ts
export interface FileStorage {
  // read path
  exists(key: string): Promise<boolean>;
  read(key: string): Promise<Uint8Array>;
  createReadStream(key: string): NodeJS.ReadableStream;   // for large files
  stat(key: string): Promise<{ size: number; contentType?: string }>;
  list(prefix: string): Promise<string[]>;                // keys under a prefix

  // write path (used now only by upload; save-back is [later])
  write(key: string, data: Uint8Array | NodeJS.ReadableStream, opts?: { contentType?: string }): Promise<void>;
  delete(key: string): Promise<void>;
}
```

Implementations:
- `LocalDiskStorage` **[now]** — rooted at a configurable dir (`STORAGE_ROOT`), `key` maps
  to a path under it. Streams to/from disk.
- `S3Storage` **[later]** — same interface over an S3-compatible bucket. `docker-compose`
  can run MinIO for local S3 parity when we get there.

Storage key scheme **[default]**: `owners/<owner_id>/projects/<project_id>/<project_file.path>`.
Opaque to callers — only `FileStorage` interprets it.

---

## 6. WASM artifact delivery  **[decided: configurable base location]**

The big artifacts (`pcbnew.wasm` ~350 MB, `eeschema.wasm` ~180 MB, `calculator.wasm`,
their `.js` glue, `wx.js`, `images.tar.gz`) are **app binaries, not user data** — kept
separate from `FileStorage`.

- The frontend resolves every artifact URL from a single configurable base:
  `WASM_ASSET_BASE_URL` **[decided requirement]**.
  - **dev**: points at the Fastify server, which serves the artifacts statically from a
    configurable dir (default `../../output` relative to the server, i.e. repo `output/`).
  - **prod**: points at a public S3/CDN URL. No code change — just env.
- An artifact URL is composed as `${WASM_ASSET_BASE_URL}/${tool}.js` (and the glue then
  fetches the sibling `.wasm` / `worker.js` / `images.tar.gz` from the same base). The
  Emscripten `locateFile` hook must be wired to this base so `.wasm`/`.worker.js` resolve
  correctly regardless of origin.
- **Cross-origin caveat [important]**: KiCad WASM uses threads (`.worker.js` present),
  which needs `SharedArrayBuffer` → the **document** must be served with
  `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
  When artifacts come from a different origin (S3/CDN), they must be served with
  `Cross-Origin-Resource-Policy: cross-origin` (or CORS) so they load under COEP. The
  Fastify static route sets COOP/COEP/CORP in dev; the prod bucket/CDN must set CORP/CORS.
  Verify against the existing harness behavior in `tests/apps/kicad/`.

Artifacts are **not committed to git** (they're build outputs). The build pipeline
(`docker/build.sh` → `output/`) remains the source.

---

## 7. URL & routing  **[decided]**

Frontend routes (client-side router) **[default: react-router]**:

| Route | View |
|---|---|
| `/` | Project list + "Create project" |
| `/p/:project` | Project detail: file tree, upload, "open in tool" actions |
| `/p/:project/:tool/*filepath` | **Tool view**: boots `:tool` WASM app, auto-opens `*filepath` |

- `:tool` ∈ `{ pcbnew, eeschema, calculator }` — selects the WASM app **[decided]**.
  (`calculator` takes no file; opening it ignores `*filepath`.)
- `*filepath` is the project-relative path of the file to auto-open
  (e.g. `pcbnew/nyak.kicad_pcb`). It must match a `project_file.path` row.
- `:project` is the project **slug** within the default owner.
- Owner is implicit (default owner) now; route gains an owner segment when auth lands
  **[later]** — `/p/:project/...` is forward-compatible.

Tool→file-extension mapping (for validation / "open with" UI) **[default]**:
`.kicad_pcb → pcbnew`, `.kicad_sch → eeschema`. Mismatches surface a warning but the
explicit `:tool` segment wins (per the decided semantics).

---

## 8. API (ts-rest contract in `packages/contract`)  **[decided: ts-rest + Zod]**

All endpoints under `/api`. Contract is the single typed source; Fastify router
implements it, frontend uses the generated ts-rest react-query client **[default]**.

```
GET    /api/projects                       -> Project[]
POST   /api/projects                       { name, slug? } -> Project          # create [scope]
GET    /api/projects/:project              -> Project + file tree              # open  [scope]
DELETE /api/projects/:project              -> 204                              # [default, nice-to-have]

GET    /api/projects/:project/files                  -> ProjectFile[]
GET    /api/projects/:project/files/*path            -> file bytes (streamed)  # used to fill MEMFS
POST   /api/projects/:project/files                  (multipart) -> ProjectFile[]   # upload [scope]
POST   /api/projects/:project/files/zip              (multipart zip) -> ProjectFile[] # upload-zip [scope]
# write/rename/delete of individual files: interface ready, [later] for save-back
```

Upload handling **[decided: files + folder + zip]**:
- **Individual files (multi)**: multipart; each part carries its target project-relative
  path. Streamed to `FileStorage`, one `project_file` row each.
- **Folder (preserve structure)**: frontend uses `webkitdirectory`; relative paths derived
  from `file.webkitRelativePath` and sent as the per-file path. Server preserves the tree.
- **Zip**: server unpacks (streaming unzip) into the project tree, creating `project_file`
  rows per entry. Reject path traversal (`../`) and absolute paths.

Validation: Zod schemas (shared) validate bodies/params; Fastify JSON-schema serialization
for responses. Errors via a consistent ts-rest error shape **[default]**.

---

## 9. Open-a-file flow (the core of the iteration)

Visiting `/p/:project/:tool/*filepath`:

1. Frontend fetches the project's file tree: `GET /api/projects/:project/files`.
2. Frontend loads the WASM glue for `:tool` from `WASM_ASSET_BASE_URL` and instantiates the
   Emscripten module into a canvas-bearing harness (reuse the proven shell from
   `tests/apps/kicad/pcbnew.html` — `createCanvas`, `images.tar.gz` prefetch+write,
   `locateFile`, status/progress UI), ported into a React component.
3. **Sync whole project tree into MEMFS** **[decided]**: for every `project_file`, fetch its
   bytes (`GET .../files/*path`) and `FS.mkdirTree` + `FS.writeFile` at the project root
   inside MEMFS (mirroring `tests/kicad/utils/fs-inject.ts`). Files land at the path KiCad
   expects (e.g. under the default projects dir, confirmed by `load-pcb-probe.spec.ts`:
   `/home/kicad/documents/kicad/9.99/projects/...`). The exact MEMFS mount point for an
   arbitrary user project is an **open implementation detail** — see §11.
4. Drive File→Open on `*filepath` using the existing element-tracker / menu-driving
   helpers (`tests/e2e/utils/element-tracker.ts`, `tests/kicad/load-pcb.spec.ts`). This UI
   automation already works for the demo boards and is the reference implementation.
5. Render. Read-only — no write-back **[decided]**.

> **[later]** Lazy/partial loading: instead of syncing the whole tree up front, intercept
> MEMFS reads and fetch siblings on demand. This lands **together with save-back/sync**, as
> a single coherent iteration (both need MEMFS↔storage plumbing). Not now.

---

## 10. Frontend detail  **[shadcn decided; rest default]**

- Vite + React + TS, shadcn/ui components, Tailwind.
- Pages: project list (cards + create dialog), project detail (file tree + upload
  dropzone + per-file "open in pcbnew/eeschema" buttons), tool view (full-viewport WASM
  canvas + status overlay).
- Data layer: ts-rest react-query client generated from the contract.
- Upload UX: drag-drop dropzone supporting multi-file, folder (`webkitdirectory`), and
  `.zip`; progress per file; streamed to backend.
- The WASM tool view is a dedicated component that owns the Emscripten lifecycle and tears
  it down on unmount (WebGL context, MEMFS) to allow switching tools/projects.

---

## 11. Open questions for `implement plan` (not blocking this spec)

1. **MEMFS mount point for arbitrary projects.** Demos rely on KiCad's default projects
   path. For a user project we must decide where in MEMFS the tree is written and whether
   pcbnew/eeschema need it under their expected projects dir, or whether File→Open can
   target an arbitrary MEMFS path. Resolve by probing (extend `load-pcb-probe`).
2. **Driving File→Open generically.** Current helpers are tuned to the demo dialog flow
   (filelist bbox click + filename input + Enter). Confirm it generalizes to arbitrary
   paths, or expose a cleaner embind "open file" entry point in the WASM layer.
3. **eeschema/calculator open flows.** Mirror the pcbnew flow; verify eeschema's File→Open
   and that calculator (no file) just boots.
4. **Large-tree sync performance.** Whole-tree sync of a big project over many HTTP
   requests may be slow; consider a single tar/zip stream endpoint to fill MEMFS in one
   shot (still "sync whole tree", just one request). Decide in planning.
5. **COOP/COEP in prod** with cross-origin S3 artifacts — validate header matrix.
6. **Project slug generation/collision** rules; reserved tool names as slugs.

---

## 12. Out of scope this iteration (explicit)

- Auth / login / real multi-user (data model is ready; UI/enforcement is **[later]**).
- WebSocket / realtime / Hocuspocus collaboration (stack chosen to allow it; none built).
- Saving or syncing edits back to storage (**[later]**, paired with lazy load).
- S3 storage implementation (interface ready; **[later]**).
- Editing project files in the browser outside the WASM tools.

---

## 13. Definition of done (this iteration)

- `pnpm install && docker-compose up -d && pnpm dev` in `web/` brings up Postgres,
  Fastify (`/api` + WASM static), and the Vite frontend.
- Create a project from the UI; it appears in the list and in Postgres.
- Open the project; upload files via multi-select, folder, and zip — files appear in the
  tree and in `FileStorage` + `project_file`.
- Navigate to `/p/<slug>/pcbnew/<path>.kicad_pcb`; the board renders read-only, equivalent
  to the existing `tests/kicad/load-pcb` result, sourcing files from project storage.
- Same for an eeschema `.kicad_sch` file.
- Swapping `WASM_ASSET_BASE_URL` between local `output/` and a remote URL requires no code
  change.