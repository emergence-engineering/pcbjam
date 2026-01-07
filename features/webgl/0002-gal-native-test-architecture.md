# GAL Native Test Harness Architecture

## Overview

The GAL native test harness is a standalone macOS application that compiles KiCad's actual `OPENGL_GAL` rendering engine against system wxWidgets. It generates baseline PNG screenshots for visual regression testing of WebGL rendering in the WASM build.

**Purpose**: Compare native OpenGL rendering (ground truth) against WebGL rendering in the browser to detect visual regressions.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GAL Native Test                               │
├─────────────────────────────────────────────────────────────────────┤
│  gal_native_test.cpp (wxApp + wxFrame)                              │
│  └─ Creates OPENGL_GAL on wxGLCanvas                                │
│     └─ Runs 11 test scenarios                                       │
│        └─ Captures FBO → PNG for each                               │
├─────────────────────────────────────────────────────────────────────┤
│  kicad_stubs.cpp                │  gal_test_accessor.cpp            │
│  • PGM_BASE singleton           │  • Template accessor for          │
│  • ADVANCED_CFG                 │    private OPENGL_GAL members     │
│  • KIFONT stubs                 │  • FBO reading                    │
│  • Observable stubs             │                                    │
├─────────────────────────────────────────────────────────────────────┤
│                    KiCad OPENGL_GAL (from submodule)                │
│  kicad/common/gal/opengl/*.cpp (18 source files)                    │
├─────────────────────────────────────────────────────────────────────┤
│                    System Dependencies                               │
│  wxWidgets (via homebrew) │ GLEW │ OpenGL                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## GAL Code Source

The test harness compiles **KiCad's actual OPENGL_GAL** from the kicad submodule:

### Source Files (`/kicad/common/gal/opengl/`)

| File | Purpose |
|------|---------|
| `opengl_gal.cpp` | Main GAL implementation - drawing primitives |
| `opengl_compositor.cpp` | FBO management, layer compositing |
| `antialiasing.cpp` | SMAA antialiasing implementation |
| `vertex_manager.cpp` | Vertex buffer accumulation |
| `vertex_item.cpp` | Individual vertex items |
| `vertex_container.cpp` | Vertex storage base class |
| `cached_container.cpp` | Cached geometry container |
| `cached_container_gpu.cpp` | GPU-resident cached geometry |
| `cached_container_ram.cpp` | RAM-backed cached geometry |
| `noncached_container.cpp` | Per-frame geometry |
| `gpu_manager.cpp` | GPU buffer management |
| `shader.cpp` | GLSL shader compilation/linking |
| `utils.cpp` | OpenGL utility functions |
| `gl_resources.cpp` | OpenGL resource management |
| `hidpi_gl_canvas.cpp` | HiDPI-aware GL canvas |
| `graphics_abstraction_layer.cpp` | GAL base class |
| `color4d.cpp` | Color handling |
| `gal_display_options.cpp` | Display options |

### Build Configuration (`CMakeLists.txt`)

```cmake
# Links against system wxWidgets
find_program(WX_CONFIG_EXECUTABLE wx-config
    HINTS /opt/homebrew/bin /usr/local/bin)

# Includes KiCad headers from submodule
target_include_directories(gal_native_test PRIVATE
    ${KICAD_SOURCE}/include
    ${KICAD_SOURCE}/include/gal
    ${KICAD_SOURCE}/include/gal/opengl
    ${KICAD_SOURCE}/libs/kimath/include
    ${KICAD_SOURCE}/libs/core/include
)
```

---

## Generated Files

### Location

`/tests/gal-regression/native/generated/`

### Purpose

GLSL shaders must be embedded as strings at runtime. `generate_shaders.py` converts shader source files to C++ hex arrays.

### Generator Script

`generate_shaders.py` reads from `/kicad/common/gal/shaders/` and creates:

| Shader | Generated Files | Purpose |
|--------|-----------------|---------|
| `kicad.frag` | `glsl_kicad_frag.cpp/h` | Fragment shader (coloring) |
| `kicad.vert` | `glsl_kicad_vert.cpp/h` | Vertex shader (transforms) |
| `smaa_base.glsl` | `glsl_smaa_base.cpp/h` | SMAA common structures |
| `smaa_pass_1_*.glsl` | 3 file pairs | SMAA edge detection |
| `smaa_pass_2_*.glsl` | 2 file pairs | SMAA blending weights |
| `smaa_pass_3_*.glsl` | 2 file pairs | SMAA neighborhood blending |

### Generated Code Structure

```cpp
// generated/glsl_kicad_frag.cpp
namespace KIGFX {
namespace BUILTIN_SHADERS {
static unsigned char glsl_kicad_frag_bytes[] = { 0x2f, 0x2a, ... };
std::string glsl_kicad_frag = std::string(
    reinterpret_cast<char const*>(glsl_kicad_frag_bytes), 4233);
}}
```

---

## Test Harness Components

### `gal_native_test.cpp`

Main test driver with wxApp/wxFrame:

1. Creates `OPENGL_GAL` on a wxGLCanvas
2. Configures coordinate system for 1:1 world-to-screen mapping
3. Iterates through test scenarios
4. Captures FBO contents as PNG screenshots

Key configuration:
```cpp
// Critical: Set 1:1 world-to-screen mapping
// GAL default is for PCB nanometers (3.937e-8), which would
// compress pixel coordinates (0-800) to ~0.003 screen pixels
m_gal->SetWorldUnitLength(1.0 / ADVANCED_CFG::GetCfg().m_ScreenDPI);
```

### `kicad_stubs.cpp`

Minimal implementations for KiCad symbols not included in GAL:

- `PGM_BASE` singleton with `GL_CONTEXT_MANAGER`
- `ADVANCED_CFG` with `m_ScreenDPI = 91`
- `KIFONT` stubs (returns nullptr for fonts)
- `OBSERVABLE_BASE` observer pattern stubs
- UI dialog stubs (`DisplayError`, etc.)

### `gal_test_accessor.cpp`

Uses C++ template technique to access private members:

```cpp
// Access private OPENGL_GAL members without modifying headers
template<typename T, T> struct steal_impl;
template<typename T, T ptr>
struct steal_impl {
    friend T get(steal_impl*) { return ptr; }
};
```

Provides:
- `GetCompositorMainBufferTexture()` - For screenshot reading
- `GetCompositorMainFBO()` - FBO ID access
- `ReadCompositorFBOPixels()` - Direct pixel readback

### `gal_test_scenarios.cpp`

11 rendering test scenarios using the GAL API.

---

## Test Coverage Analysis

### Current Scenarios

| # | Name | GAL Features Tested |
|---|------|-------------------|
| 0 | basic-lines | `DrawLine`, `SetStrokeColor`, `SetLineWidth` |
| 1 | line-widths | `DrawLine` with varying widths (0.5 to 12.0) |
| 2 | circles | `DrawCircle` (filled and stroked) |
| 3 | arcs | `DrawArc` |
| 4 | rectangles | `DrawRectangle` (filled and stroked) |
| 5 | polygons | `DrawPolygon`, `DrawPolyline` |
| 6 | alpha-blending | `SetFillColor` with alpha transparency |
| 7 | transforms | `Save`, `Restore`, `Rotate`, `Translate`, `Scale` |
| 8 | grid-cursor | `DrawGrid`, `DrawCursor` |
| 9 | segments | `DrawSegment` |
| 10 | complex-scene | `SetLayerDepth` (z-ordering) |

### Coverage: ~19% of GAL API (14 of 73 methods)

### Missing Coverage (Priority Order)

**High Priority** (Critical for KiCad functionality):
1. `DrawBitmap()` - Image/icon rendering
2. `DrawCurve()` - Bezier curves
3. `DrawGlyph()` / `BitmapText()` - Text rendering
4. `DrawSegmentChain()` - Complex paths
5. `DrawArcSegment()` - Filled arc segments

**Medium Priority** (Performance-critical features):
6. Group methods: `BeginGroup()`, `EndGroup()`, `DrawGroup()`, `ClearCache()`
7. Render targets: `SetTarget()`, offscreen rendering
8. `SetNegativeDrawMode()` - Gerber-style rendering

**Low Priority** (Already implicit or not relevant to WASM):
9. `EnableDepthTest()` - Implicit in complex-scene
10. Context locking - Single-threaded in WASM

---

## Code Quality Assessment

### Strengths

1. **Clean separation** - Stubs, accessor, scenarios in separate files
2. **Minimal stubs** - Only implements what's needed
3. **Safe accessor** - Template technique avoids `#define private public`
4. **Standard shader embedding** - Common practice for GL applications

### Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Compile actual KiCad GAL | Ground truth for comparison |
| System wxWidgets | Native OpenGL context |
| FBO reading | Clean screenshots without window capture |
| Hex shader embedding | Runtime shader loading like KiCad |

---

## Running the Test

### Build

```bash
./scripts/build-gal-native-test.sh
```

### Execute

```bash
./tests/gal-regression/native/build/gal_native_test --output ./baselines
```

### Options

| Flag | Description |
|------|-------------|
| `--output <dir>` | Output directory for PNG files |
| `--width <w>` | Canvas width (default: 800) |
| `--height <h>` | Canvas height (default: 600) |
| `--show` | Show window instead of headless |

---

## Next Steps

### Immediate: Expand Test Coverage

1. Add `DrawBitmap` scenario with simple test image
2. Add `DrawCurve` (Bezier) scenario
3. Add text rendering scenario (requires KIFONT implementation)
4. Add `DrawSegmentChain` scenario
5. Add `DrawArcSegment` scenario

### Future: WebGL Comparison

1. Run same scenarios in WASM build
2. Compare native vs WebGL screenshots
3. Automate regression detection

---

## File Reference

| File | Location |
|------|----------|
| Test driver | `tests/gal-regression/native/gal_native_test.cpp` |
| Stubs | `tests/gal-regression/native/kicad_stubs.cpp` |
| Private accessor | `tests/gal-regression/native/gal_test_accessor.cpp` |
| Test scenarios | `tests/gal-regression/scenarios/gal_test_scenarios.cpp` |
| CMake config | `tests/gal-regression/native/CMakeLists.txt` |
| Shader generator | `tests/gal-regression/native/generate_shaders.py` |
| Build script | `scripts/build-gal-native-test.sh` |
