# KiCad Web

Single web app to create/open KiCad projects, upload files, and open them in the
WASM tools (pcbnew / eeschema / calculator) by URL:

```
/p/<project>/<tool>/<file-path>      e.g. /p/project5/pcbnew/nyak.kicad_pcb
```

Design + decisions: [`../features/web-init/0001-web-app-spec.md`](../features/web-init/0001-web-app-spec.md).

## Stack

- **Monorepo**: pnpm + turbo
- **Frontend**: Vite + React + TypeScript + shadcn/ui (`apps/frontend`)
- **Backend**: Fastify + ts-rest + Zod (`apps/server`)
- **DB**: Postgres + Drizzle (project/file metadata)
- **Storage**: pluggable `FileStorage` (local disk now, S3 later) (`packages/storage`)
- **Shared types**: ts-rest contract + Zod (`packages/contract`)

```
web/
├── apps/
│   ├── frontend/   # Vite React app
│   └── server/     # Fastify API + WASM static + Drizzle
└── packages/
    ├── contract/   # ts-rest contract + Zod schemas (FE + BE share this)
    └── storage/    # FileStorage interface + LocalDiskStorage
```

## Quick start

```bash
cd web
cp .env.example .env          # Postgres host port defaults to 54329 (non-default)
pnpm install

pnpm db:up                    # start Postgres (docker compose)
pnpm db:migrate               # apply migrations + seed the default owner

pnpm dev                      # turbo: server :3050 + frontend :3048
```

Open http://localhost:3048 — create a project, upload files (multi / folder /
.zip), then open a `.kicad_pcb` / `.kicad_sch` in its tool.

## WASM artifacts

The runtime artifacts (`<tool>.js/.wasm`, `wx.js`, `images.tar.gz`, plus the
`<tool>.html` harness pages) are build outputs, **not** committed here. The
complete set is synced into `tests/apps/kicad/` by
`tests/scripts/setup-kicad-wasm.sh` from repo-root `output/` (+ `wx.js` from
`wxwidgets/`; `output/` alone lacks `wx.js`). That script is a real **sync** —
it skips files already byte-identical at the destination, so re-running it does
not rewrite the multi-hundred-MB `.wasm`.

**They must be served same-origin as the app.** Under the document's COEP/
cross-origin-isolation (set by the Vite dev server), KiCad WASM refuses to load
its glue/wasm from a different origin. So the app serves them from its own
origin with **no extra copy**: `pnpm dev` runs `scripts/link-wasm.mjs`, which
**symlinks** `apps/frontend/public/wasm → tests/apps/kicad`. Vite then serves
them at `/wasm` (same origin). `VITE_WASM_ASSET_BASE_URL` defaults to `/wasm`.

- Point the symlink elsewhere with
  `WASM_SRC_DIR=/path pnpm --filter @kicad-web/frontend link-wasm`.
- If the tool won't load, the target dir is probably empty — run
  `tests/scripts/setup-kicad-wasm.sh` to populate `tests/apps/kicad/`.

The tool view (`WasmTool.tsx` + `src/wasm/boot.ts`) boots the tool **directly in
the React document** — no iframe. It replicates the proven harness HTML
(`tests/apps/kicad/<tool>.html`): builds the same global Emscripten `Module`
config and preRun steps (create canvas, write `images.tar.gz`, seed config), then
injects the same `wx.js` + `<tool>.js` artifacts into the page. It then syncs the
project tree into MEMFS and drives File→Open. The build is non-modularized
(global `Module`/`FS`) and pthread-based, so only **one** tool runs per page load;
switching tools requires a full navigation. `locateFile` resolves the wasm and
the pthread worker against `<base>` so they load regardless of the SPA route.

**prod**: point `VITE_WASM_ASSET_BASE_URL` at a CDN URL — but that origin must
itself satisfy the same-origin / COEP constraints (e.g. served under the app's
own origin/path).

## Scripts

| Command | What |
|---|---|
| `pnpm dev` | server + frontend (turbo) |
| `pnpm db:up` / `pnpm db:down` | start/stop Postgres |
| `pnpm db:generate` | generate Drizzle migration SQL from schema |
| `pnpm db:migrate` | apply migrations + seed default owner |
| `pnpm db:seed` | (re)seed the default owner |
| `pnpm typecheck` | typecheck all packages |
| `pnpm build` | build all packages |

## API (shared via `packages/contract`)

JSON (ts-rest): `GET/POST /api/projects`, `GET/DELETE /api/projects/:project`,
`GET /api/projects/:project/files`.

Binary (raw Fastify, response shapes still shared via Zod):
`POST /api/projects/:project/files` (multi-file + folder),
`POST /api/projects/:project/files/zip`,
`GET /api/projects/:project/files/*` (stream bytes).

## Status / next iteration

Working end-to-end: create / open / upload (files, folder, zip) / file
download / WASM static serving / project list & detail UI / URL routing.

Booting a tool syncs the **whole** project tree into MEMFS, then opens the
target file. The open step (`apps/frontend/src/wasm/open-flow.ts`) prefers a
programmatic hook (`Module.kicadOpenFile`) and falls back to EXPERIMENTAL UI
automation ported from the e2e tests — this needs in-browser validation against
built artifacts, and exposing a real embind open-entry-point is the intended
follow-up (spec §11.2). Lazy/partial MEMFS loading and save-back land together
in a later iteration (spec §§9, 12).
