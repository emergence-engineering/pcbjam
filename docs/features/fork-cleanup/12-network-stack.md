# 12 — Network stack & the impossible catalog

> Three link-time stubs (`libcurl_stub.a`, `libgit2_stub.a`, `libnng_stub.a`) gate a cluster
> of features. Two are revivable in the browser (HTTP libraries, local history); one is
> genuinely impossible (the IPC socket transport). This doc covers those plus the full
> catalog of what stays off and **why** — so the "everything web-feasible should work" policy
> has a clear boundary.

## curl → emscripten Fetch (revives HTTP libraries)

`wasm/stubs/curl_stub.c` makes `curl_easy_init()` return `NULL`, so
`KICAD_CURL_EASY`'s ctor throws `"Unable to initialize CURL session"`
(`common/kicad_curl/kicad_curl_easy.cpp:127-130`). That kills: the HTTP schematic library
(`SCH_IO_HTTP_LIB`, which is otherwise compiled and registered — see [08](08-importers.md)),
the update check, and PCM downloads.

**The right move is *not* porting libcurl** (browsers can't do raw TCP; the real libcurl-wasm
ports tunnel TCP over WebSocket proxies — wrong tool). Instead, replace the stub with a
functional implementation of the ~12 `curl_easy_*` entry points `KICAD_CURL_EASY` actually
uses (setopt URL/headers/POST/writefunction, perform, getinfo response-code) over the
**emscripten Fetch API** — Asyncify-friendly (the build already runs full Asyncify), same
pattern as the clipboard. New file in `wasm/stubs/`, **zero KiCad-file changes**. Constraint:
target servers must send CORS headers. ~2–4 days. Same shim revives every other curl consumer
(version checks in `pgm_base.cpp` / `build_version.cpp`, currently failing silently).

## libgit2 → real static build (fixes silently-broken local history)

`wasm/stubs/libgit2_stub.c` makes all git ops fail with -1. This kills two things:

- **Project git integration** — UI lives in the `kicad` project-manager (not a wasm target),
  so mostly moot.
- **Local history** — **not moot.** `common/local_history.cpp` (git-backed save snapshots) is
  wired into the *shipped* editors (`pcb_edit_frame.cpp`, `files.cpp`, `sch_edit_frame.cpp`,
  `eda_base_frame.cpp`) and currently **fails silently on every save.** This is a real
  product gap worth a deliberate decision.

**Port (medium, ~1 week):** build a real static `libgit2.a` for wasm (wasm-git /
petersalomonsen proves libgit2 compiles to emscripten cleanly) and drop the stub for the
editors. Local-only commits need no network. Remote push/pull would additionally need
wasm-git's HTTP smart-transport — skip that. **Alternatively**, if local history isn't a
priority, disable the feature via config so it stops failing silently — but pick one; the
current state (compiled-in, failing every save) is the worst option.

## nng / IPC API transport — keep stubbed (impossible)

`KICAD_IPC_API=ON` builds the API handlers + protobuf (that's what the ON flag is for), but
`api_server.cpp` / `api_plugin_manager.cpp` are excluded and `kinng` isn't linked
(`common/CMakeLists.txt`). nng is raw sockets and the IPC clients are **external OS
processes** — neither exists in a browser sandbox. Keep `libnng_stub.a`.

> The mainline-aligned future for plugins (post-SWIG KiCad 11) is this same IPC API, reachable
> from the browser only via a JS bridge (postMessage/WebSocket) implementing the request/reply
> surface — a *different* transport, not nng. That's a separate project; see
> [`../../../features/python/research.md`](../../../features/python/research.md).

## The impossible catalog (and why)

| Feature | Why it can't work in a browser |
|---|---|
| 3Dconnexion SpaceMouse / navlib | needs the native 3DxWare driver/daemon; WebHID can't replace the SDK protocol |
| Dynamic KIFACE / DSO loading | no `dlopen` of native DSOs in wasm; the static single-kiface architecture is correct (`kiway.cpp` / `kiway.h`) |
| ODBC database (`nanodbc`) | driver-manager + native driver model has no browser equivalent ([08](08-importers.md)) |
| nng / IPC transport | raw sockets to external OS processes (above) |
| `wxUSE_FSWATCHER` | no inotify/kqueue; MEMFS has no change notification and nothing edits files externally |
| `wxUSE_WEBVIEW` | no browser backend for the wasm port; only the unshipped project-manager uses it |
| OS keychain (`wxUSE_SECRETSTORE`) | no OS credential service; only insecure approximations (localStorage) exist |
| Pointer warping (`WarpPointer`) | browsers can't move the OS pointer — handled by zoom-to-cursor ([03](03-config-not-code.md)) |
| System trash / host env / process info | sandbox (kiplatform `environment.cpp`, `sysinfo.cpp`) |
| `PYTHON_MANAGER` subprocess execution | no `fork`/subprocess in emscripten; an embedded interpreter is the only path (policy-off) |

## Policy-off (not impossible — chosen)

- **Python scripting** — `KICAD_SCRIPTING` OFF + stubs. Stays off per the standing decision;
  the mainline path is the IPC API, not SWIG (see
  [`../../../features/python/research.md`](../../../features/python/research.md)).
- **PCM, update check** — networking features the team skipped; the curl shim above would
  revive the update check if ever wanted.
- **`kicad` project manager, `cvpcb`, `bitmap2component`** — never given wasm targets; the web
  app is the "manager" and the product ships per-tool editors (pcbnew, eeschema, symbol_editor,
  gerbview, pl_editor, calculator).
