# WebGL GAL Port - Implementation Complete

> **ARCHIVED / HISTORICAL** — the WebGL-GAL backend described here was implemented (see `kicad/common/gal/webgl/`). Live test docs: [`tests/gal-regression/README.md`](../../../../tests/gal-regression/README.md). Kept for design rationale.

## Status: ALL PHASES COMPLETE ✅

**Branch:** `webgl` (21+ commits)

## Goal
Port KiCad's GAL (Graphics Abstraction Layer) from OpenGL to WebGL to enable full KiCad functionality in the browser. Use the existing 28-scenario test suite to verify visual parity between native OpenGL and WebGL implementations.

## Final State
- **WebGL GAL**: Fully integrated into `kicad/common/gal/webgl/` (~27,800 lines)
- **GAL Test Suite**: 28 scenarios passing, visual parity with native OpenGL
- **KiCad WASM**: Builds and runs successfully with WebGL GAL
- **3D Viewer**: Disabled with stubs for WASM builds (`KICAD_BUILD_3D_VIEWER_WASM=OFF`)

## Key Decisions
- **Approach**: Copy and modify existing OpenGL GAL code
- **Scope**: Full feature parity (all 28 scenarios)
- **Location**: Developed in `tests/gal-regression/wasm/` first, moved to KiCad for integration

## Architecture

**Two-backend test architecture:**
```
┌─────────────────────────────────────────────────────────────┐
│                   SAME 28 SCENARIO FILES                     │
│            (scenarios/*.cpp - pure GAL API calls)            │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────────┐     ┌─────────────────────────┐
│   NATIVE TEST HARNESS       │     │   WEBGL TEST HARNESS    │
│   (gal_native_test.cpp)     │     │   (gal_webgl_test.cpp)  │
│                             │     │                         │
│   Uses: OPENGL_GAL          │     │   Uses: WEBGL_GAL       │
│   Runs: macOS native        │     │   Runs: Browser/WASM    │
└─────────────────────────────┘     └─────────────────────────┘
              │                               │
              ▼                               ▼
┌─────────────────────────────┐     ┌─────────────────────────┐
│  output/native/gal-*.png    │     │  output/webgl/gal-*.png │
└─────────────────────────────┘     └─────────────────────────┘
```

## Master Test Script: `scripts/test-gal-regression.sh`

**This is the only script we run.** Single command to build, test, and compare everything:

```bash
#!/bin/bash
# Single script to build, run, and compare both backends

# 1. BUILD BOTH
scripts/build-gal-native-test.sh
scripts/build-gal-webgl-test.sh

# 2. RUN BOTH TESTS
./tests/gal-regression/native/build/gal_native_test --output tests/gal-regression/output/native/
npx playwright test gal-webgl.spec.ts  # outputs to tests/gal-regression/output/webgl/

# 3. COMPARE (two-level)
compare_screenshots output/native/ baseline/      # Catch native regressions
compare_screenshots output/webgl/  output/native/ # Verify WebGL matches native

# 4. REPORT
# Exit 0 if all match, exit 1 if any differ
```

**Two-level comparison:**
1. **native vs baseline** → Catches if native code regressed
2. **webgl vs native** → Verifies WebGL implementation matches

**Output structure:**
```
tests/gal-regression/
├── baseline/           # Committed reference screenshots
├── output/
│   ├── native/         # Fresh native run
│   └── webgl/          # WebGL run via Playwright
```

## Phases - ALL COMPLETE ✅

### Phase 1: Native Test Harness ✅
Created unified test infrastructure with 28 scenarios covering 100% of GAL API.

**Commits:** 490f531 → 051fb87

**Deliverables:**
- [x] `scripts/test-gal-regression.sh` - Master build/test/compare script
- [x] `scripts/build-gal-native-test.sh` - Native build script
- [x] `tests/gal-regression/native/` - Native C++ test harness using OPENGL_GAL
- [x] `tests/gal-regression/scenarios/` - 28 shared test scenarios
- [x] `tests/gal-regression/baseline/` - Native OpenGL reference screenshots

### Phase 2: WebGL GAL Implementation ✅
Full port of OPENGL_GAL to WebGL 2.0 / OpenGL ES 3.0.

**Commits:** a4f444f → 74faa7e

**Key Changes:**
- Replaced legacy `glBegin/glEnd` with VBO-based rendering
- Replaced GL matrix stack with glm matrices
- Converted GLSL shaders to ES 3.0 (`attribute`→`in`, `varying`→`out`, etc.)
- Added VAO support (required for WebGL 2.0)
- Replaced GLU tesselator with earcut.hpp

**Deliverables:**
- [x] `tests/gal-regression/wasm/webgl/` - Initial WebGL GAL implementation
- [x] `scripts/build-gal-webgl-test.sh` - WASM build script
- [x] `tests/e2e/gal-webgl.spec.ts` - Playwright spec for screenshots

### Phase 3: Complete API Coverage ✅
All GAL methods implemented with visual parity.

**Method Groups (all complete):**
- [x] Basic drawing: DrawLine, DrawSegment, DrawCircle, DrawArc
- [x] Shapes: DrawRectangle, DrawPolygon, DrawPolyline
- [x] Advanced: DrawBezier, DrawBezierArc, DrawArcSegment, DrawSegmentChain
- [x] State: Colors, transforms, depth testing, render targets
- [x] Groups: BeginGroup, EndGroup, DrawGroup, ChangeGroupColor/Depth
- [x] Text: DrawGlyph, DrawGlyphs, BitmapText
- [x] Special: DrawGrid, DrawCursor, DrawBitmap

### Phase 4: KiCad Integration ✅
WebGL GAL moved to KiCad source tree with CMake integration.

**Commit:** 37d973f (KiCad submodule: 1b5bb125d2)

**Deliverables:**
- [x] Move `webgl_gal.*` to `kicad/common/gal/webgl/`
- [x] CMake integration for Emscripten builds
- [x] 3D viewer disabled with stubs (`KICAD_BUILD_3D_VIEWER_WASM=OFF`)
- [x] KiCad WASM builds and e2e tests pass

---

## Technical Lessons Learned

### 1. GLSL ES 3.0 Shader Conversion
Desktop OpenGL shaders needed conversion for WebGL 2.0:
```glsl
attribute → in
varying → out (vertex shader) / in (fragment shader)
texture2D() → texture()
gl_FragColor → explicit out variable
```
Automated in `generate_shaders.py`.

### 2. VAO Required for WebGL 2.0
WebGL 2.0 requires Vertex Array Objects (VAOs):
```cpp
glGenVertexArrays(1, &m_vao);
glBindVertexArray(m_vao);
```

### 3. Legacy GL Elimination
All legacy OpenGL calls replaced:
- `glBegin/glEnd` → VBO-based rendering
- `glPushMatrix/glPopMatrix` → glm matrix stack
- `GL_QUADS` → `GL_TRIANGLES` (quads not supported in WebGL)
- `glEnableClientState` → modern vertex attributes

### 4. GLU Tesselator Replacement
GLU not available in WebGL. Implemented using earcut.hpp:
- File: `kicad/common/gal/webgl/glu_tess_impl.cpp`
- Provides `gluNewTess`, `gluTessBeginPolygon`, etc.

### 5. Coordinate System & Retina Scaling
- White background required for screenshot comparison (alpha compositing)
- Retina 2x scaling requires proper `devicePixelRatio` handling
- World-to-screen mapping: `SetWorldUnitLength(1.0 / DPI)`

### 6. Alpha Blending
Proper blend functions required for correct transparency:
```cpp
glBlendFuncSeparate(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA, GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
```

### 7. 3D Viewer Stubbing Strategy
When disabling 3D viewer (`KICAD_BUILD_3D_VIEWER_WASM=OFF`):
- Guard includes/code with `#ifndef __EMSCRIPTEN__`
- Stub classes need wxWidgets event table macros (`BEGIN_EVENT_TABLE`)
- Complex classes (PANEL_PREVIEW_3D_MODEL) require all event handler stubs

## File Structure (Final)

```
kicad/common/gal/webgl/           # WebGL GAL in KiCad source tree
├── webgl_gal.cpp                 # Main implementation (3184 lines)
├── webgl_gal.h                   # Class declaration (618 lines)
├── webgl_compositor.cpp          # FBO compositing
├── webgl_antialiasing.cpp        # SMAA implementation
├── gpu_manager.cpp               # VBO/VAO management
├── vertex_manager.cpp            # Vertex accumulation
├── shader.cpp                    # GLSL compilation
├── glu_tess_impl.cpp             # GLU tesselator (earcut)
├── earcut.hpp                    # Polygon triangulation
└── ... (20+ files total)

tests/gal-regression/
├── baseline/                     # Native OpenGL reference (28 PNGs)
├── baseline-webgl/               # WebGL reference (29 PNGs)
├── native/                       # Native test harness
├── wasm/                         # WebGL test harness (uses KiCad GAL)
└── scenarios/                    # Shared 28 test scenarios

wasm/stubs/
├── 3d_canvas_stub.cpp            # ~500 lines of 3D stubs
├── 3d_viewer_stub.cpp            # EDA_3D_VIEWER_FRAME stub
└── 3d_scenegraph_stub.cpp        # VRML export stubs

scripts/
├── build-gal-native-test.sh      # Native build script
├── build-gal-webgl-test.sh       # WASM build script
└── test-gal-regression.sh        # Master test script
```

---

## Verification Commands

```bash
# Build KiCad WASM
docker/build.sh

# Run GAL regression tests
scripts/test-gal-regression.sh

# Run KiCad e2e tests
cd tests && npm run test:kicad
```
