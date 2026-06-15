# 08 — Re-enable file-format importers

> **Verdict: re-enable now.** The exclusions are stale or incidental, not technical. The
> Altium blocker was fixed months ago (the fix is already force-included into every TU), and
> the other five eeschema importers were cut for "MVP scoping" while their parsers compile
> for wasm anyway. Re-enabling is **net-negative diff** — it deletes fork gates. Configure-
> confident but runtime-untested: smoke-test each with a sample file before declaring done.

## Altium (eeschema + pcbnew) — the blocker is already fixed

**The recorded blocker was real:** `thirdparty/compoundfilereader/compoundfilereader.h:264`
does `typedef std::basic_string<uint16_t> utf16string;`, and the libc++ shipped in Emscripten
4.0.2 removed the generic `std::char_traits` base template (deprecated LLVM 18, removed LLVM
19 via llvm/llvm-project#72694 — the same break hit nlohmann/json #4490, qpdf #1024). Plain
`std::basic_string<uint16_t>` fails to compile with
`implicit instantiation of undefined template 'std::char_traits<unsigned short>'`.

**The fix already exists and is already active.** `wasm/stubs/char_traits_uint16_workaround.h`
defines `std::char_traits<unsigned short>` and is **force-included into every KiCad TU** via
`-include` in `CMAKE_CXX_FLAGS` (`scripts/kicad/build-kicad-target.sh:343`). A standalone
compile test with the project's own emsdk confirms `compoundfilereader.h` compiles clean with
the specialization in scope. (Upstream KiCad hit the identical bug on Apple clang ≥17 and
ships the same specialization gated `#ifdef __APPLE__` in the vendored header.) No other
`basic_string<unsigned short>` use exists anywhere in the tree outside this header.

So the Altium exclusions are simply stale. **Remove these fork-added gates** (each removal
*reduces* the diff):

```
common/CMakeLists.txt              # io/altium 4 files gated NOT EMSCRIPTEN
eeschema/CMakeLists.txt            # importer block; altium lines
eeschema/sch_io/sch_io_mgr.cpp     # #ifndef __EMSCRIPTEN__ includes + factory cases
pcbnew/CMakeLists.txt              # add_subdirectory(pcb_io/altium) gate + PCBNEW_IO_LIBRARIES dual list
pcbnew/pcb_io/pcb_io_mgr.cpp       # #ifndef blocks (CircuitMaker/Studio/Designer + Solidworks)
```

`pcb_io/altium`'s deps (pcbcommon, compoundfilereader, magic_enum) are all already built for
wasm. One root cause fixes both the eeschema and pcbnew sides.

## Eagle / CADSTAR / LTspice / EasyEDA / EasyEDA-Pro (eeschema) — incidental MVP cut

`eeschema/CMakeLists.txt` excludes these in an `if(NOT EMSCRIPTEN)` block with the comment
"cross-tool importers we don't need for the MVP and they bring transitive incompatible
dependencies in." The dependency half is **false today**, and there's strong evidence the
cut was incidental:

- All their shared parsers already compile **unconditionally** in `common/CMakeLists.txt`
  (`io/cadstar/cadstar_archive_parser.cpp`, `io/eagle/eagle_parser.cpp`, `io/easyeda/*`,
  `io/easyedapro/*`).
- **pcbnew's wasm build already ships the equivalents** — CADSTAR, EasyEDA, EasyEDA-Pro,
  Fabmaster, IPC-2581, ODB++, P-CAD (`pcbnew/CMakeLists.txt`), plus eagle + geda compiled
  straight into pcbcommon. Only Altium was excluded on the pcbnew side. If pcbnew builds them
  but eeschema doesn't, the eeschema exclusion is incidental.
- Deps are all present: expat (eagle XML), nlohmann (easyeda), wxZip/zlib (easyedapro), plain
  text (ltspice, cadstar).

**Do:** move the five importer groups out of the `if(NOT EMSCRIPTEN)` block in
`eeschema/CMakeLists.txt` and drop the matching `#ifndef __EMSCRIPTEN__` cases in
`sch_io_mgr.cpp`. (Altium-sch additionally needs the Altium common code from the section
above.) Net-negative fork diff; no platform deps.

## Stays impossible / policy

- **Database (`SCH_IO_DATABASE`)** — needs nanodbc → ODBC driver manager → native drivers
  opening TCP to a DB server. No browser path; keep stubbed. (`database_lib_settings.cpp`
  still compiles for settings-file compatibility — fine.)
- **HTTP library (`SCH_IO_HTTP_LIB`)** — already compiled and *registered*, but dead at
  runtime because the curl stub returns NULL. Reviving it is the curl→fetch shim in
  [12](12-network-stack.md), not part of this refactor.

## Verification

Build, then import: an Eagle `.sch`, an Altium `.SchDoc`/`.PcbDoc`, and one of
CADSTAR/EasyEDA. Confirm the importer appears in the File → Import menu and round-trips
geometry. The import dialogs use `wxFileDialog` (PARTIAL per `tests/WHATWORKS.md`), so verify
the file-open flow too.
