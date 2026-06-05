# KiCad IPC API - WASM Fork Changes

> **ARCHIVED — open cleanup TODO, not yet actioned.** Describes `#ifdef KICAD_IPC_API` guards added to ~18 KiCad source files that could be reverted to reduce fork diff. Archiving this doc does **not** perform the revert — that remains a separate task.

## Overview

We added `#ifdef KICAD_IPC_API` guards to 18 KiCad source files. These guards wrap:
- `#include` statements for protobuf/API headers
- `Serialize()` and `Deserialize()` methods

**Key insight:** Since our build uses `KICAD_IPC_API=ON` (line 251 of `scripts/kicad/build-pcbnew.sh`), these guards don't actually disable any code - everything compiles. The guards can be safely reverted to reduce fork divergence.

## Modified Files

| File | What We Guarded |
|------|-----------------|
| `common/eda_shape.cpp` | `#include` for API headers, `Serialize()`, `Deserialize()` |
| `common/eda_text.cpp` | `#include` for API headers, `Serialize()`, `Deserialize()` |
| `common/netclass.cpp` | `#include` for API headers, `Serialize()`, `Deserialize()` |
| `include/api/api_utils.h` | Entire namespace content (utility functions) |
| `pcbnew/api/api_pcb_utils.h` | Entire file content |
| `pcbnew/board_connected_item.cpp` | `#include` for API headers, `Serialize()`, `Deserialize()` |
| `pcbnew/board_stackup_manager/board_stackup.cpp` | `#include` for API headers, `Serialize()`, `Deserialize()` |
| `pcbnew/footprint.cpp` | `#include` for API headers, `Serialize()`, `Deserialize()` |
| `pcbnew/pad.cpp` | `#include` for API headers, `Serialize()`, `Deserialize()` |
| `pcbnew/padstack.cpp` | `#include` for API headers, `Serialize()`, `Deserialize()` |
| `pcbnew/pcb_dimension.cpp` | `#include` for API headers, `Serialize()`, `Deserialize()` |
| `pcbnew/pcb_field.cpp` | `#include` for API headers, `Serialize()`, `Deserialize()` |
| `pcbnew/pcb_group.cpp` | `#include` for API headers, `Serialize()`, `Deserialize()` |
| `pcbnew/pcb_shape.cpp` | `#include` for API headers, `Serialize()`, `Deserialize()` |
| `pcbnew/pcb_text.cpp` | `#include` for API headers, `Serialize()`, `Deserialize()` |
| `pcbnew/pcb_textbox.cpp` | `#include` for API headers, `Serialize()`, `Deserialize()` |
| `pcbnew/pcb_track.cpp` | `#include` for API headers, `Serialize()`, `Deserialize()` |
| `pcbnew/zone.cpp` | `#include` for API headers, `Serialize()`, `Deserialize()` |

## Example of Our Changes

**Before (upstream):**
```cpp
#include <api/api_enums.h>
#include <api/api_utils.h>
#include <api/board/board_types.pb.h>

void PAD::Serialize( google::protobuf::Any &aContainer ) const
{
    // ... serialization code
}
```

**After (our fork):**
```cpp
#ifdef KICAD_IPC_API
#include <api/api_enums.h>
#include <api/api_utils.h>
#include <api/board/board_types.pb.h>
#endif

#ifdef KICAD_IPC_API
void PAD::Serialize( google::protobuf::Any &aContainer ) const
{
    // ... serialization code
}
#endif
```

## Why We Added These Guards

Originally added to allow building with `KICAD_IPC_API=OFF`, which would:
- Skip protobuf dependency
- Exclude serialization methods that depend on protobuf types

However, our current build has `KICAD_IPC_API=ON`, making these guards unnecessary.

## How to Revert

To revert these files to upstream (base commit `4bfed3f174`):

```bash
cd kicad
git checkout 4bfed3f174 -- \
  common/eda_shape.cpp \
  common/eda_text.cpp \
  common/netclass.cpp \
  include/api/api_utils.h \
  pcbnew/api/api_pcb_utils.h \
  pcbnew/board_connected_item.cpp \
  pcbnew/board_stackup_manager/board_stackup.cpp \
  pcbnew/footprint.cpp \
  pcbnew/pad.cpp \
  pcbnew/padstack.cpp \
  pcbnew/pcb_dimension.cpp \
  pcbnew/pcb_field.cpp \
  pcbnew/pcb_group.cpp \
  pcbnew/pcb_shape.cpp \
  pcbnew/pcb_text.cpp \
  pcbnew/pcb_textbox.cpp \
  pcbnew/pcb_track.cpp \
  pcbnew/zone.cpp
```

Then rebuild:
```bash
./docker/build.sh --clean-kicad
```

## Note: toolbars_pcb_editor.cpp

This file has `#ifdef KICAD_SCRIPTING` guards (not IPC API guards):

```cpp
#ifdef KICAD_SCRIPTING
#include "../scripting/python_scripting.h"
#endif
...
#ifdef KICAD_SCRIPTING
    bool scriptingAvailable = SCRIPTING::IsWxAvailable();
#else
    bool scriptingAvailable = false;
#endif
```

**Cannot be fully reverted** because:
- `KICAD_SCRIPTING=OFF` for WASM builds (CMakeLists.txt lines 135-138)
- Without guards, build fails (python_scripting.h not built, SCRIPTING class doesn't exist)

This is a separate concern from the IPC API and is documented here for completeness.

## Impact of Reversion

- **Fork diff reduction:** 18 fewer modified files
- **Build behavior:** No change (KICAD_IPC_API=ON, code compiles identically)
- **Functionality:** No change (serialization methods still available)

## Related: IPC API Architecture

KiCad's IPC API uses:
- **Protobuf messages** for request/response serialization
- **NNG sockets** for transport (stubbed in WASM - see `wasm/stubs/nng_stub.c`)
- **API_HANDLER_PCB** class for handling requests (instantiated in PCB_EDIT_FRAME)

Our stub at `wasm/stubs/api_plugin_stub.cpp` provides no-op implementations for:
- `KICAD_API_SERVER::Start()`, `Stop()`, `Running()`
- `KICAD_API_SERVER::RegisterHandler()`, `DeregisterHandler()`

## Future: JavaScript Bridge

To expose the IPC API to JavaScript (optional enhancement):

1. Modify `api_plugin_stub.cpp` to store registered handlers
2. Create Embind bindings in `wasm/bindings/api_bridge.cpp`
3. Expose `KiCadApi_HandleRequest(protobufData)` function
4. Use `protobuf.js` on JS side for message creation/parsing

This would enable JS automation without modifying any KiCad source files.