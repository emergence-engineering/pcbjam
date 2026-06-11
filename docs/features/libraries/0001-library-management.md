# How KiCad manages libraries — embedded vs. referenced

## Question

If I create a design that uses some component parts and open it in a brand-new
KiCad build (no libraries installed), are the parts burned into the file, or do
I still need the original libraries downloaded?

## Short answer

Mostly **yes — KiCad caches/embeds the part definitions into the design file
itself**, so existing files open and render without the original libraries. The
details differ between schematic symbols, PCB footprints, and 3D models.

This matters for the WASM build: it determines whether we need to ship library
files to the browser to view/edit a given file.

## Schematic symbols (`.kicad_sch`)

KiCad 6+ writes a `(lib_symbols ...)` block near the top of every schematic
file. This is a **full embedded copy** of every symbol used on the sheet — pins,
graphics, fields, the lot. On open:

- KiCad renders and edits from this **embedded cache**, not from the original
  library.
- Opening on a fresh install with **zero libraries** works fine — the parts are
  effectively burned in.
- Each symbol keeps a `lib_id` (e.g. `Device:R`) which is just a *name link*
  back to the source library. That link is only used when you explicitly run
  **Tools → Update Symbols from Library**, or when placing a *new* instance.

In KiCad 5 and earlier the same caching was done via an external
`<project>-cache.lib` sidecar file next to the project — same idea, just not
inline.

## PCB footprints (`.kicad_pcb`)

Footprints are **always fully embedded** — no caching ambiguity. Every footprint
instance carries its complete geometry (pads, courtyard, silkscreen). A
`.kicad_pcb` is entirely self-contained; the `.pretty` footprint libraries are
never needed to open or edit a board.

## 3D models — the exception

By default, 3D models (`.step` / `.wrl`) are **not embedded**. They are stored as
**file path references**, often via env vars like `${KICAD8_3DMODEL_DIR}`. On a
fresh machine the board still opens, but the 3D viewer shows nothing/placeholders
unless those model files exist.

KiCad 7+ added an **Embedded Files** feature (Board / Schematic Setup → Embedded
Files) to explicitly bundle 3D models, fonts, etc. into the design file for true
portability.

## Implications for kicad-wasm

A `.kicad_sch` or `.kicad_pcb` opened in the browser build will **render and edit
correctly without downloading any libraries**, because symbol/footprint
definitions travel inside the file. Libraries are only required for:

1. **Placing new parts** — the symbol/footprint chooser needs library tables plus
   the `.kicad_sym` / `.pretty` files.
2. **3D rendering** — unless models are embedded.
3. **"Update from Library"** workflows.

So for a viewer, or even a basic editor of *existing* files, we can skip shipping
libraries entirely.
