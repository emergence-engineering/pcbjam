# 11 — Re-enable the SPICE simulator

> **Verdict: port, ~1–2 weeks.** The groundwork is half-done in-repo: a wasm ngspice build
> script already exists, the simulator sources already compile, and the only unavoidable
> upstream-file edit is a ~25-line block swapping `wxDynamicLibrary` for direct static
> symbols. Multiple working emscripten ngspice ports exist as precedent.

## Current state (more nuanced than "KICAD_SPICE=OFF")

- `-DKICAD_SPICE=OFF` in `build-kicad-target.sh` is **vestigial** — there's no such option in
  this KiCad (only `KICAD_SPICE_QA`). The simulator is *always* built; all `eeschema/sim/`
  sources compile for wasm.
- The dep is satisfied by a header-only stub: `wasm/cmake/Findngspice.cmake` points includes
  at `wasm/stubs/ngspice/sharedspice.h` with an empty link line.
- **Runtime kill-point:** `SIMULATOR_FRAME` ctor → `NGSPICE` init → `ngspice.cpp:474`
  `m_dll.Load(wxDynamicLibrary::CanonicalizeName("ngspice"))` fails (no `dlopen` without
  `-sMAIN_MODULE`) → throws → caught at `eeschema/eeschema.cpp:208-221` → simulator silently
  returns `nullptr`.

## The groundwork already here

- **A wasm ngspice build script exists:** `scripts/deps/build-ngspice.sh` (ngspice 45.2,
  static, cider + xspice, pthread; opt-in via `build-all-deps.sh --with-ngspice`).
- **A known size landmine is already handled:** the 4 giant model-data initializers
  (`sim_model_ngspice_data_{bsim4,b3soi,b4soi,hsim}.cpp`) exceeded the JS engines' "too many
  locals" validation limit and are stubbed (`eeschema/CMakeLists.txt:292-305` +
  `wasm/stubs/eeschema_ngspice_data_stubs.cpp`).

## Why static linking works

KiCad resolves 9–11 ngspice function pointers via `GetSymbol` (`ngspice.cpp:503-517`) and
registers C callbacks (`cbSendChar`, `cbBGThreadRunning`, … `ngspice.cpp:519`). With a
**statically linked** `libngspice.a`, those become plain function pointers and direct symbol
references — no `dlopen` needed. Threading: KiCad drives sims via `bg_run`/`bg_halt`
(`ngspice.cpp:335,342`) using ngspice's internal pthread; the wasm build is already
full-pthread, and native code already assumes callbacks fire on the bg thread — same model.

Precedent (all static, OpenMP off, shared-lib mode unsupported under emscripten):
wokwi/ngspice-wasm, EEcircuit (eelab-dev), danchitnis/ngspice, plus upstream ngspice WASM
patches (#96, #99).

## Recipe

1. Verify `scripts/deps/build-ngspice.sh` completes for 45.2.
2. Make `wasm/cmake/Findngspice.cmake` return the **real** sysroot lib + headers when present
   (fall back to the stub otherwise).
3. **The one unavoidable upstream-file edit:** a `#ifdef __EMSCRIPTEN__` branch in
   `eeschema/sim/ngspice.cpp` `init_dll()` that binds the `m_ngSpice_*` pointers directly to
   the statically-linked symbols instead of via `wxDynamicLibrary` (~25 lines, one block).
4. Ship `spinit` / `.cm` codemodels into MEMFS if xspice device models are wanted.
5. **Retest the model-data stubs** — the "too many locals" failure predates the now-default
   post-asyncify `wasm-opt -O2` pass that solved the same engine-limit family elsewhere (see
   the `chrome-asyncify-rewind-crash` memory). If it's resolved, restore the 4 real model-data
   files; if not, the simulator works minus BSIM4/SOI/HSIM device models.

## Residual risks (verify at runtime)

- `SIMULATOR_FRAME`'s plot widget behavior under wxUniversal (untested).
- Asyncify vs. the ngspice bg-thread interplay during a running simulation (see the
  [async dossier](../async/README.md) for the suspension model).

Diff impact: ~25 lines in one upstream file (`ngspice.cpp`) + a `Findngspice.cmake` change
(wasm layer). Everything else is the dep build and FS assets.
