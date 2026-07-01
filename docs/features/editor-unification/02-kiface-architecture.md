# 02 — KiCad's kiway / kiface / `FRAME_T` architecture (primer)

> The upstream mechanism that already selects editors at runtime. Understanding this is what
> makes Part 1 obviously cheap and Part 2 precisely scoped. All paths under `kicad/`.

The one-sentence contract: **one compiled module (a "kiface") implements many editor windows
("frames"), and the specific window is chosen at runtime by passing a `FRAME_T` enum value to a
single factory method, `KIFACE::CreateKiWindow`.** Everything below is the machinery behind that
sentence.

## `FRAME_T` — the runtime selector

`include/frame_type.h:34-65` enumerates every top-level editor window. The relevant entries:

```cpp
enum FRAME_T
{
    FRAME_SCH = 0,
    FRAME_SCH_SYMBOL_EDITOR,    // symbol editor
    FRAME_SCH_VIEWER,
    ...
    FRAME_PCB_EDITOR,           // board editor
    FRAME_FOOTPRINT_EDITOR,     // footprint editor
    FRAME_FOOTPRINT_VIEWER,
    ...
    FRAME_GERBER,
    FRAME_PL_EDITOR,
    FRAME_CALC,
    ...
    KIWAY_PLAYER_COUNT,         // count of the editor-window subset (the array bound)
    KICAD_MAIN_FRAME_T = KIWAY_PLAYER_COUNT,   // the project manager — NOT a player
    FRAME_T_COUNT,
```

This is the "flag." A board editor *is* `FRAME_PCB_EDITOR`; a footprint editor *is*
`FRAME_FOOTPRINT_EDITOR`. They are sibling values in one enum.

## `KIFACE::CreateKiWindow` — the factory

`include/kiway.h:216-217`:

```cpp
virtual wxWindow* CreateKiWindow( wxWindow* aParent, int aClassId,
                                  KIWAY* aKIWAY, int aCtlBits = 0 ) = 0;
```

`aClassId` is a `FRAME_T` (widened to `int` to keep the cross-module ABI mangling-free). Each
kiface implements this as a `switch` that `new`s the concrete frame:

**pcbnew** (`kicad/pcbnew/pcbnew.cpp:255-290`):

```cpp
wxWindow* CreateKiWindow( wxWindow* aParent, int aClassId, KIWAY* aKiway, int aCtlBits = 0 ) override
{
    switch( aClassId )
    {
    case FRAME_PCB_EDITOR:                                   // :259
    {
        auto frame = new PCB_EDIT_FRAME( aKiway, aParent );
        if( Kiface().IsSingle() )  frame->CreateServer( ... );
        return frame;
    }
    case FRAME_FOOTPRINT_EDITOR:                             // :277
        return new FOOTPRINT_EDIT_FRAME( aKiway, aParent );
    case FRAME_FOOTPRINT_VIEWER:    return new FOOTPRINT_VIEWER_FRAME( aKiway, aParent );
    ...
```

**eeschema** (`kicad/eeschema/eeschema.cpp:187-234`) is identical in shape:
`case FRAME_SCH:` → `new SCH_EDIT_FRAME`, `case FRAME_SCH_SYMBOL_EDITOR:` → `new SYMBOL_EDIT_FRAME`.

A single kiface instance serves all of its frame types — e.g.
`} kiface( "pcbnew", KIWAY::FACE_PCB );` (`pcbnew.cpp:592`). **This is the load-bearing fact for
Part 1:** the board editor and footprint editor are two `case` arms of one switch in one module.
The frame classes are distinct sibling subclasses (`PCB_EDIT_FRAME` /`FOOTPRINT_EDIT_FRAME`,
both deriving `PCB_BASE_EDIT_FRAME → PCB_BASE_FRAME`; `SCH_EDIT_FRAME` /`SYMBOL_EDIT_FRAME`,
both deriving `SCH_BASE_FRAME`) — but they ship in the same compiled object library and are
selected purely by the runtime `FRAME_T`.

## `KIWAY::Player` — `FRAME_T` → kiface → frame

`common/kiway.cpp:445-495` is the public entry. Given a `FRAME_T` it (1) maps it to a face, (2)
gets that kiface, (3) calls the factory, (4) caches the result:

```cpp
KIWAY_PLAYER* KIWAY::Player( FRAME_T aFrameType, bool doCreate, wxTopLevelWindow* aParent )
{
    KIWAY_PLAYER* frame = GetPlayerFrame( aFrameType );   // already-open singleton?
    if( frame )  return frame;
    if( doCreate ) {
        FACE_T  face_type = KifaceType( aFrameType );      // FRAME_T -> FACE_T
        KIFACE* kiface = KiFACE( face_type );              // load/return the module
        frame = (KIWAY_PLAYER*) kiface->CreateKiWindow( aParent, aFrameType, this, m_ctl );  // :474
        ...
    }
}
```

`KifaceType()` (`common/kiway.cpp:383-424`) is the **many-frames-per-kiface map** — and the
detail that makes Part 1 free:

```cpp
case FRAME_SCH:
case FRAME_SCH_SYMBOL_EDITOR:
case FRAME_SCH_VIEWER:           return FACE_SCH;     // both schematic + symbol -> ONE face

case FRAME_PCB_EDITOR:
case FRAME_FOOTPRINT_EDITOR:
case FRAME_FOOTPRINT_VIEWER:     return FACE_PCB;     // both board + footprint -> ONE face
...
```

`FACE_PCB` (pcbnew) owns 6 frame types; `FACE_SCH` (eeschema) owns 5. The per-`FACE_T` `m_kiface[]`
array (`include/kiway.h`) and the per-`FRAME_T` `m_playerFrameId[KIWAY_PLAYER_COUNT]` singleton
cache mean: register a face once, and *all* of its frames are reachable, one live instance each.

## `single_top.cpp` — the standalone bootstrap (and the only build-time pin)

`common/single_top.cpp` is "a program launcher for a single KIFACE." Its `OnPgmInit` does two
`TOP_FRAME` things on the WASM static path (`#if !defined(BUILD_KIWAY_DLL)`, `:380-396`):

```cpp
KIFACE_GETTER_FUNC* ki_getter = &KIFACE_GETTER;                      // :387 the statically-linked getter
KIFACE* kiface = ki_getter( &kiface_version, KIFACE_VERSION, this );
Kiway.set_kiface( KIWAY::KifaceType( TOP_FRAME ), kiface );          // :396 register its FACE_T slot
...
KIWAY_PLAYER* frame = Kiway.Player( TOP_FRAME, true );               // :420 open the frame
```

`TOP_FRAME` is the **single** thing fixed at build time. Note that the `set_kiface` at `:396`
registers the kiface under `KifaceType(TOP_FRAME)` — and since `KifaceType(FRAME_PCB_EDITOR) ==
KifaceType(FRAME_FOOTPRINT_EDITOR) == FACE_PCB`, that registration already covers *both* PCB
frames regardless of which `TOP_FRAME` was used. So for a same-kiface pair, only `:420` actually
depends on the build-time value.

## The WASM "exactly one kiface" assumption

`common/kiway.cpp:223-258` (`#ifdef __EMSCRIPTEN__`) is the WASM `KiFACE()` path. Because WASM
has no dynamic library loading, it returns the *statically-linked, pre-registered* kiface for a
face, and `nullptr` for any unregistered face — with an explicit warning not to fall back to the
lone getter:

> *"WASM statically links exactly ONE kiface … Do NOT fall back to the statically-linked
> KIFACE_GETTER here: it returns THIS app's kiface regardless of the requested face, which then
> cannot CreateKiWindow() the other editor's panels."* (`kiway.cpp:238-247`)

This is a *registration convention*, not a storage limit — `set_kiface` writes into a per-`FACE_T`
array (`include/kiway.h:476-481`), so registering N faces is just calling it N times. Part 2
relaxes this convention; Part 1 doesn't touch it.

## Precedent: upstream already does runtime frame selection

Two upstream patterns prove the runtime-flag model and are worth copying:

- **`kicad/kicad.cpp:130-164,260-274`** — the project-manager binary maps a `--frame=<name>`
  command-line option to a `FRAME_T` (`pcb`→`FRAME_PCB_EDITOR`, `sch`→`FRAME_SCH`,
  `fpedit`→`FRAME_FOOTPRINT_EDITOR`, …) and, at runtime, either creates the manager or
  `Kiway.Player( appType, true )` for any editor. This is *exactly* the "one binary, runtime
  flag, many editors" shape — Part 1 should reuse this `--frame` parser in the WASM launcher.
- **`kicad/tools/kicad_manager_control.cpp:774-797`** — `ShowPlayer` reads a `FRAME_T` out of a
  tool-action parameter (`aEvent.Parameter<FRAME_T>()`) and calls `Kiway().Player(playerType, true)`.
  Clicking "PCB Editor" vs "Footprint Editor" in the manager is just two different `FRAME_T`
  parameters (`kicad/tools/kicad_manager_actions.cpp:100-142`).

**Caveat for Part 2:** the project manager achieves *multi-kiface* by loading each kiface as a
**DLL** at runtime. That path does not exist for WASM (no `dlopen` in our build path), and the
`kicad` manager target is **not built for WASM** at all (`kicad/CMakeLists.txt:113`, no
`EMSCRIPTEN` branch; absent from `docker/build.sh`). So Part 2's "many kifaces, one static image"
has no existing template — see [`04-part2-single-app-merge.md`](04-part2-single-app-merge.md).
