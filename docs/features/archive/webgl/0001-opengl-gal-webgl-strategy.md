# OpenGL, GAL, and WebGL Strategy for KiCad WASM

> **ARCHIVED / HISTORICAL** — the WebGL-GAL backend described here was implemented (see `kicad/common/gal/webgl/`, ~22.5k lines). Live test docs: [`tests/gal-regression/README.md`](../../../../tests/gal-regression/README.md). Kept for design rationale.

## Summary

This document analyzes KiCad's graphics architecture and evaluates strategies for WebGL rendering in the WASM build.

## Current Implementation: Emscripten LEGACY_GL_EMULATION

We currently use Emscripten's legacy OpenGL emulation:

```bash
-sLEGACY_GL_EMULATION -sMAX_WEBGL_VERSION=2
```

**How it works:**

```
KiCad/wxWidgets C++ (glBegin, glVertex, glColor, etc.)
         │
         ▼
gl_immediate_shim.js (our fix for color-per-vertex bug)
         │
         ▼
Emscripten GLImmediate (translates legacy GL → shaders + VBOs)
         │
         ▼
WebGL 2.0 (ES 3.0 compatible, shader-based)
```

**Key components:**

| Component | File | Purpose |
|-----------|------|---------|
| wxGLCanvas | `wxwidgets/src/wasm/glcanvas.cpp` | Creates WebGL contexts on dedicated HTML5 canvases |
| GL Shim | `wasm/shims/gl_immediate_shim.js` | Fixes color-per-vertex bug in GLImmediate |
| GLU Tesselator | `wasm/stubs/glu_wasm_impl.cpp` | Polygon triangulation using earcut (GLU not available in WebGL) |
| GLEW Stub | `wasm/cmake/FindGLEW.cmake` | Stubs out GLEW (not needed with Emscripten) |
| kiglew.h | `kicad/include/gal/opengl/kiglew.h` | Maps double→float, stubs unsupported functions |

---

## GLU Status

**KiCad uses GLU** for polygon tesselation (`gluTess*` functions for zones, complex shapes).

**We already solved this** with `/wasm/stubs/glu_wasm_impl.cpp` which implements the GLU tesselator API using KiCad's earcut algorithm. This works with both LEGACY_GL_EMULATION and would work with pure ES3.

GLU is NOT a blocker.

---

## Where KiCad Uses Legacy OpenGL

Two separate systems use legacy OpenGL:

### 1. OPENGL_GAL (2D Rendering)

Used for schematic and PCB editors.

**Files:**
- `kicad/common/gal/opengl/opengl_gal.cpp` - Main implementation
- `kicad/common/gal/opengl/gpu_manager.cpp` - VBO management
- `kicad/common/gal/opengl/opengl_compositor.cpp` - Framebuffer compositing
- `kicad/common/gal/opengl/antialiasing.cpp` - AA effects

**Legacy GL usage in opengl_gal.cpp:**
- Lines 1557-1605: Bitmap rendering with `glBegin(GL_QUADS)`
- Lines 2690-2755: Cursor drawing with `glBegin(GL_LINES)`
- Lines 566-629, 1558-1602, 2704-2751: Matrix stack operations (`glPushMatrix`, `glPopMatrix`, `glMatrixMode`)

### 2. 3D Viewer (3D Rendering)

Separate from GAL, used for 3D board visualization.

**Files using legacy GL:**
- `kicad/3d-viewer/3d_rendering/opengl/render_3d_opengl.cpp`
- `kicad/3d-viewer/3d_rendering/opengl/opengl_utils.cpp`
- `kicad/3d-viewer/3d_rendering/opengl/layer_triangles.cpp`
- `kicad/3d-viewer/3d_rendering/opengl/3d_spheres_gizmo.cpp`
- `kicad/3d-viewer/3d_rendering/opengl/3d_model.cpp`
- `kicad/3d-viewer/3d_model_viewer/eda_3d_model_viewer.cpp`
- `kicad/3d-viewer/3d_canvas/eda_3d_canvas_pivot.cpp`

---

## If We Cover GAL, Is That Enough?

**For 2D editing (schematic + PCB): YES**

The entire 2D rendering pipeline goes through GAL. A working GAL backend enables full schematic and PCB editing.

**For 3D viewer: NO**

The 3D viewer is a separate rendering system. It could be disabled/stubbed initially and added later.

---

## The GAL API

GAL (Graphics Abstraction Layer) is a clean 2D drawing interface defined in `kicad/include/gal/graphics_abstraction_layer.h`.

**NO raw OpenGL is exposed.** The API consists of ~40 virtual methods:

```cpp
// Drawing primitives
virtual void DrawLine(const VECTOR2D& start, const VECTOR2D& end);
virtual void DrawSegment(const VECTOR2D& start, const VECTOR2D& end, double width);
virtual void DrawPolyline(const std::vector<VECTOR2D>& points);
virtual void DrawCircle(const VECTOR2D& center, double radius);
virtual void DrawArc(const VECTOR2D& center, double radius, const EDA_ANGLE& start, const EDA_ANGLE& angle);
virtual void DrawRectangle(const VECTOR2D& start, const VECTOR2D& end);
virtual void DrawPolygon(const SHAPE_POLY_SET& polySet);
virtual void DrawBitmap(const BITMAP_BASE& bitmap, double alpha);
virtual void DrawGlyph(const KIFONT::GLYPH& glyph);

// Attributes
virtual void SetFillColor(const COLOR4D& color);
virtual void SetStrokeColor(const COLOR4D& color);
virtual void SetLineWidth(float width);
virtual void SetIsFill(bool enabled);
virtual void SetIsStroke(bool enabled);
virtual void SetLayerDepth(double depth);

// Transforms (matrix stack)
virtual void Save();
virtual void Restore();
virtual void Transform(const MATRIX3x3D& matrix);
virtual void Rotate(double angle);
virtual void Translate(const VECTOR2D& translation);
virtual void Scale(const VECTOR2D& scale);

// Rendering control
virtual void BeginDrawing();
virtual void EndDrawing();
virtual void SetTarget(RENDER_TARGET target);
virtual void ClearTarget(RENDER_TARGET target);
virtual void ClearScreen();

// Grid and cursor
virtual void DrawGrid();
virtual void DrawCursor(const VECTOR2D& position);
```

**Existing GAL implementations:**

| Class | File | Purpose |
|-------|------|---------|
| `OPENGL_GAL` | `kicad/include/gal/opengl/opengl_gal.h` | OpenGL rendering (uses legacy GL internally) |
| `CAIRO_GAL` | `kicad/include/gal/cairo/cairo_gal.h` | Cairo software rendering |
| `CALLBACK_GAL` | `kicad/include/callback_gal.h` | Hit testing, no actual rendering |

---

## What Breaks with FULL_ES3 (No Legacy Emulation)

If we removed `LEGACY_GL_EMULATION`:

| Feature | Used In | Status in FULL_ES3 |
|---------|---------|-------------------|
| `gluTess*` (tesselation) | Polygon rendering | **Our stub works** |
| `glBegin/glEnd` | Bitmap quads, cursor | Not available |
| `glVertex/glColor` | Immediate mode drawing | Not available |
| `glPushMatrix/glPopMatrix` | Transformations | Not available |
| `glMatrixMode` | Matrix switching | Not available |
| `GL_QUADS` | Bitmap rendering | Not available (only triangles) |
| `glEnableClientState` | Legacy vertex arrays | Not available |

---

## Strategy Options

### Option 1: Keep LEGACY_GL_EMULATION (Current)

**Pros:**
- Works now
- Minimal code changes to KiCad
- All immediate mode functions available

**Cons:**
- ~200KB binary overhead from GLImmediate
- Runtime overhead from emulation
- Color-per-vertex bug requires our shim
- Some edge cases may not work

**Build flags:**
```bash
-sLEGACY_GL_EMULATION -sMAX_WEBGL_VERSION=2
```

### Option 2: Create WEBGL_GAL (New Backend)

Create a new GAL implementation that uses pure WebGL 2.0 (ES 3.0) without legacy emulation.

**Pros:**
- No emulation overhead
- Smaller binary
- Cleaner, more maintainable
- Better performance

**Cons:**
- Development effort (~2-3 weeks)
- Need to maintain separate backend

**Estimated scope:**
```
New class: WEBGL_GAL : public GAL

Files needed:
├── webgl_gal.h         (~300 lines)
├── webgl_gal.cpp       (~2500 lines)
├── webgl_shaders.cpp   (~500 lines)
└── webgl_compositor.cpp (~500 lines)

Total: ~3500-4000 lines
```

**Why it's feasible:**
- GAL API is clean - no raw GL leaks through
- CAIRO_GAL proves it works (~2500 lines)
- All drawing is 2D with simple primitives
- KiCad's shaders already exist and work in WebGL

### Option 3: Cairo-only (Software Rendering)

Use CAIRO_GAL exclusively, render to HTML5 2D canvas.

**Pros:**
- Already exists
- No WebGL needed
- Works everywhere

**Cons:**
- Slow (CPU-only)
- May struggle with complex boards
- No hardware acceleration

---

## Recommendation

**Short-term:** Keep LEGACY_GL_EMULATION - it works and allows rapid development.

**Medium-term:** Create WEBGL_GAL - cleaner architecture, better performance, removes emulation hacks.

**For 3D viewer:** Disable initially, add later as separate effort.

---

## Key Files Reference

| Purpose | File |
|---------|------|
| Build flags | `scripts/common/env.sh` |
| wxGLCanvas WASM | `wxwidgets/src/wasm/glcanvas.cpp` |
| GL immediate shim | `wasm/shims/gl_immediate_shim.js` |
| GLU tesselator | `wasm/stubs/glu_wasm_impl.cpp` |
| KiCad GL compat | `kicad/include/gal/opengl/kiglew.h` |
| KiCad shaders | `kicad/common/gal/shaders/kicad_*.glsl` |
| GAL base class | `kicad/include/gal/graphics_abstraction_layer.h` |
| OPENGL_GAL | `kicad/include/gal/opengl/opengl_gal.h` |
| CAIRO_GAL | `kicad/include/gal/cairo/cairo_gal.h` |
| GL documentation | `tests/GL_README.md` |