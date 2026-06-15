# PCBJam Web — standalone editor (GPL)

A self-contained, GPL web app that opens KiCad projects in the WASM tools
(pcbnew / eeschema / pl_editor / …) — from a local folder, or from any backend
that implements the MIT [`@pcbjam/shared`](./pcbjam-shared) contract. It opens a
tool by URL:

```
/p/<project>/<tool>/<file-path>      e.g. /p/demo/pcbnew/nyak.kicad_pcb
```

This workspace contains **only** the generic editor and a thin reference
backend. All project-specific concerns (accounts, project management, uploads,
auth) live in the separate closed application, which reuses this editor by
hosting it standalone and redirecting to it (it must not link the GPL editor).

## Layout

```
web/
├── standalone/      # @pcbjam/standalone — the GPL editor (Vite + React)
├── backend/         # @pcbjam/backend-example — thin reference @pcbjam/shared impl
└── pcbjam-shared/   # @pcbjam/shared — the FE↔BE contract (git submodule, MIT)
```

- **Editor**: Vite + React + TypeScript. Boots a tool directly in the document
  (no iframe), syncs the project tree into MEMFS, drives File→Open, and runs
  same-tab collaboration over BroadcastChannel.
- **Example backend**: Fastify + ts-rest serving a single project off the local
  filesystem (`PROJECT_DIR`). **No DB**, no auth, no uploads — the minimum the
  editor needs, and a worked example of the contract. Listens on `:3060`. On
  `dev`/`start` it **self-provisions example libraries** — a curated slice of
  upstream KiCad symbol + footprint libs is cloned + extracted into `.libs`
  (served as read-only origins), so a bare clone has libraries to browse with no
  closed repo present. See `backend/src/extract/`.

## Quick start

```bash
cd web
pnpm install
git submodule update --init web/pcbjam-shared   # if not already populated

cp standalone/.env.example standalone/.env
cp backend/.env.example backend/.env            # PROJECT_DIR=../../tests/fixtures/demo

pnpm dev                                         # turbo: backend :3060 + editor :3048
```

Open http://localhost:3048 — either **open a local folder** (no backend needed)
or open the backend's project. The editor can point at any conforming backend
via `VITE_API_BASE_URL`.

## WASM artifacts

The runtime artifacts (`<tool>.js/.wasm`, `wx.js`, `images.tar.gz`, `<tool>.html`)
are build outputs, **not** committed. They are synced into `tests/apps/kicad/` by
`tests/scripts/setup-kicad-wasm.sh` (from repo-root `output/`).

**They must be served same-origin as the app.** Under the document's COEP /
cross-origin-isolation (set by the Vite dev server), KiCad WASM refuses to load
its glue/wasm from a different origin. `pnpm dev` runs `scripts/link-wasm.mjs`,
which **symlinks** `standalone/public/wasm → tests/apps/kicad`; Vite serves them
at `/wasm`. `VITE_WASM_ASSET_BASE_URL` defaults to `/wasm`.

- Point the symlink elsewhere with
  `WASM_SRC_DIR=/path pnpm --filter @pcbjam/standalone link-wasm`.
- If a tool won't load, the target dir is probably empty — run
  `tests/scripts/setup-kicad-wasm.sh` to populate `tests/apps/kicad/`.
- **prod**: point `VITE_WASM_ASSET_BASE_URL` at a URL whose origin also satisfies
  the same-origin / COEP constraints.

## Scripts

| Command | What |
|---|---|
| `pnpm dev` | editor + example backend (turbo) |
| `pnpm build` | build all packages |
| `pnpm typecheck` | typecheck all packages |

## Contract (`@pcbjam/shared`, MIT)

The editor reads from a backend over the shared contract:
`GET /api/projects`, `GET /api/projects/:project`,
`GET /api/projects/:project/files`, and the streamed
`GET /api/projects/:project/files/*` (raw bytes). Management/write operations and
ownership are **not** part of this contract — they belong to the closed app.
