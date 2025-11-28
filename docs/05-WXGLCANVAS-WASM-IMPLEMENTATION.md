# 05 - wxGLCanvas WASM Implementation

This document outlines the plan to implement wxGLCanvas (OpenGL/WebGL support) for the wxWidgets WASM port, enabling KiCad's OpenGL-based rendering in the browser.

## Current Status: Completed ✅

**wxGLCanvas implementation is complete.** The GL library builds successfully:
```
libwx_wasmunivu_gl-3.2-emscripten.a
```

### Build Command
```bash
./scripts/build-wxuniversal-wasm.sh        # Incremental build
./scripts/build-wxuniversal-wasm.sh --clean # Clean build
```

### Implementation Summary
- Created `wxwidgets/include/wx/wasm/glcanvas.h`
- Created `wxwidgets/src/wasm/glcanvas.cpp`
- Updated `wxwidgets/configure.in` for WASM OpenGL support
- Updated `wxwidgets/build/bakefiles/files.bkl`
- Added empty stubs for legacy wxGLAPI functions in `glcmn.cpp` (KiCad doesn't use these)

---

## Phase 1: Fix wxWidgets Build (PCRE2 Issue) ✅ Completed

### Problem
```
fatal error: 'pcre2.h' file not found
```

### Root Cause
Build race condition during parallel make. With `-j` parallel builds, `regex.cpp` can compile before PCRE generates its headers.

### Solution
Modify `scripts/build-wxuniversal-wasm.sh` to build PCRE first:

```bash
# After configure section, add:
echo ""
echo "=== Building PCRE first (dependency) ==="
emmake make -C 3rdparty/pcre

# Then existing make:
echo ""
echo "=== Building ==="
emmake make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu)
```

---

## Phase 2: Implement wxGLCanvas for WASM ✅ Completed

### Estimated Effort: 18-27 hours (Actual: ~8 hours)

| Component | Files | Effort |
|-----------|-------|--------|
| Header file | `include/wx/wasm/glcanvas.h` | 2-3 hours |
| Implementation | `src/wasm/glcanvas.cpp` | 8-12 hours |
| Configure updates | `configure.in` | 1-2 hours |
| Build system | `build/files.bkl` | 1 hour |
| Testing & debug | - | 6-10 hours |

### Implementation Approach: Direct WebGL via Emscripten

Use Emscripten's HTML5 API (`emscripten/html5.h`) for WebGL context management.

#### 1. Create `include/wx/wasm/glcanvas.h` (~100-150 lines)

```cpp
#ifndef _WX_WASM_GLCANVAS_H_
#define _WX_WASM_GLCANVAS_H_

#include "wx/glcanvas.h"
#include <emscripten/html5.h>

class WXDLLIMPEXP_GL wxGLContext : public wxGLContextBase
{
public:
    wxGLContext(wxGLCanvas *win, const wxGLContext *other = NULL,
                const wxGLContextAttrs *ctxAttrs = NULL);
    virtual ~wxGLContext();

    virtual bool SetCurrent(const wxGLCanvas& win) const wxOVERRIDE;

private:
    EMSCRIPTEN_WEBGL_CONTEXT_HANDLE m_context;

    wxDECLARE_CLASS(wxGLContext);
};

class WXDLLIMPEXP_GL wxGLCanvas : public wxGLCanvasBase
{
public:
    wxGLCanvas(wxWindow *parent,
               const wxGLAttributes& dispAttrs,
               wxWindowID id = wxID_ANY,
               const wxPoint& pos = wxDefaultPosition,
               const wxSize& size = wxDefaultSize,
               long style = 0,
               const wxString& name = wxGLCanvasName,
               const wxPalette& palette = wxNullPalette);

    virtual ~wxGLCanvas();

    virtual bool SwapBuffers() wxOVERRIDE;

    // Get the canvas element ID for Emscripten
    const char* GetCanvasId() const { return m_canvasId.c_str(); }

private:
    bool CreateWindow(wxWindow *parent, const wxGLAttributes& dispAttrs,
                      wxWindowID id, const wxPoint& pos, const wxSize& size,
                      long style, const wxString& name);

    std::string m_canvasId;

    wxDECLARE_CLASS(wxGLCanvas);
};

#endif // _WX_WASM_GLCANVAS_H_
```

#### 2. Create `src/wasm/glcanvas.cpp` (~500-700 lines)

Key implementation tasks:
- Parse wxGL_* attributes → WebGL context attributes
- Create WebGL context using `emscripten_webgl_create_context()`
- Implement `SetCurrent()` using `emscripten_webgl_make_context_current()`
- Handle canvas resize events
- `SwapBuffers()` - typically no-op for WebGL (auto-swaps)

#### 3. Update `configure.in` (line ~3890)

```autoconf
elif test "$wxUSE_WASM" = 1; then
    dnl WASM uses WebGL through Emscripten
    OPENGL_LIBS=""
    wxUSE_OPENGL="yes"
```

#### 4. Update `build/files.bkl`

Add `glcanvas.cpp` to WASM sources list.

### Reference Files
- `src/unix/glegl.cpp` - EGL implementation (922 lines)
- `src/gtk/glcanvas.cpp` - GTK implementation (303 lines)
- `src/common/glcmn.cpp` - Base implementation shared by all ports

---

## Phase 3: Legacy OpenGL Emulation for KiCad

### The Problem

**KiCad uses legacy OpenGL immediate mode** which is **NOT supported in WebGL**. KiCad does NOT use wxGLAPI (wxWidgets' wrapper), but calls raw OpenGL directly:

| Function Category | Count | Examples |
|---|---|---|
| glBegin/glEnd | 70 | Immediate mode drawing |
| glVertex2f/3f/2d/3d | 112 | Vertex specification |
| glMatrixMode/glPushMatrix/glPopMatrix | 88 | Matrix stack operations |
| glEnableClientState/glDisableClientState | 43 | Legacy vertex arrays |
| glColor3f/4f/3d/4d | 34 | Per-vertex colors |
| glTranslatef/glRotatef/glScalef | 26 | Matrix transforms |
| glTexCoord2f/2d | 19 | Texture coordinates |
| glVertexPointer/glColorPointer | 18 | Legacy vertex arrays |
| glNormal3f/3d | 12 | Normal vectors |
| **TOTAL** | **423+** | **Must be emulated** |

### Most Affected KiCad Files

**3D Viewer (heaviest usage):**
- `opengl_utils.cpp` - 88+ calls (bounding boxes, debug geometry)
- `render_3d_opengl.cpp` - 50+ calls (core 3D board rendering)
- `3d_spheres_gizmo.cpp` - 48+ calls (interactive gizmos)
- `layer_triangles.cpp` - 34 calls (layer mesh rendering)

**2D PCB Viewer:**
- `opengl_gal.cpp` - 39+ calls (bitmap text, cursor)
- `antialiasing.cpp` - 37+ calls (fullscreen AA post-processing)
- `opengl_compositor.cpp` - 19+ calls (screen compositing)

### Solution: Emscripten Legacy GL Emulation

**Link flag:** `-sLEGACY_GL_EMULATION`

This built-in Emscripten feature emulates legacy OpenGL (immediate mode, matrix stack, etc.) on top of WebGL. It was used to port the Sauerbraten 3D game (BananaBread).

**Optional performance flags:**
- `-sGL_UNSAFE_OPTS` - Skip redundant GL work
- `-sGL_FFP_ONLY` - Disable programmable pipeline detection

**Alternatives (if needed later):**
- [gl4es](https://github.com/ptitSeb/gl4es) - OpenGL 2.1 → GLES 2.0 translation
- [Regal](https://github.com/emscripten-ports/regal) - Used by D3Wasm (Doom 3 port)

---

## Phase 4: Test Graphics

### Goal

Create tests that exercise **all GL functions KiCad uses** to verify emulation works.

### GL Functions to Test (Based on KiCad Usage)

#### Immediate Mode Drawing
```cpp
glBegin(GL_TRIANGLES);
glBegin(GL_QUADS);
glBegin(GL_LINE_STRIP);
glBegin(GL_LINE_LOOP);
glBegin(GL_LINES);
glEnd();
```

#### Vertex Specification
```cpp
glVertex2f(x, y);
glVertex3f(x, y, z);
glVertex2d(x, y);
glVertex3d(x, y, z);
```

#### Color Specification
```cpp
glColor3f(r, g, b);
glColor4f(r, g, b, a);
glColor3ub(r, g, b);
glColor4ub(r, g, b, a);
```

#### Matrix Operations
```cpp
glMatrixMode(GL_PROJECTION);
glMatrixMode(GL_MODELVIEW);
glLoadIdentity();
glPushMatrix();
glPopMatrix();
glTranslatef(x, y, z);
glRotatef(angle, x, y, z);
glScalef(x, y, z);
glOrtho(...);
gluPerspective(...);
```

#### Texture Coordinates
```cpp
glTexCoord2f(s, t);
glTexCoord2d(s, t);
```

#### Normal Vectors
```cpp
glNormal3f(nx, ny, nz);
glNormal3d(nx, ny, nz);
```

#### Legacy Vertex Arrays
```cpp
glEnableClientState(GL_VERTEX_ARRAY);
glEnableClientState(GL_COLOR_ARRAY);
glDisableClientState(...);
glVertexPointer(...);
glColorPointer(...);
glDrawArrays(...);
```

#### State Management
```cpp
glEnable(GL_BLEND);
glEnable(GL_DEPTH_TEST);
glEnable(GL_TEXTURE_2D);
glDisable(...);
glBlendFunc(...);
```

### Test File: `tests/wasm-app/gl_test.cpp`

Create test application that:
1. Creates wxGLCanvas with WebGL context
2. Tests each category of GL functions
3. Renders a known pattern (e.g., colored shapes)
4. Logs results to console

### Playwright Tests: `tests/e2e/gl.spec.ts`

Automated tests:
- WebGL context creation succeeds
- Each GL function category executes without errors
- Visual verification of rendered output (screenshot comparison)

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `scripts/build-wxuniversal-wasm.sh` | Modify - fix PCRE build order |
| `wxwidgets/include/wx/wasm/glcanvas.h` | Create - wxGLCanvas header |
| `wxwidgets/src/wasm/glcanvas.cpp` | Create - wxGLCanvas implementation |
| `wxwidgets/configure.in` | Modify - add WASM OpenGL support |
| `wxwidgets/build/files.bkl` | Modify - add source file |
| `tests/wasm-app/gl_test.cpp` | Create - test application |
| `tests/e2e/gl.spec.ts` | Create - Playwright tests |

---

## Why This Matters for KiCad

KiCad uses a Graphics Abstraction Layer (GAL) with two backends:
- **Cairo backend**: Uses wxDC (2D) - works with existing wxUniversal WASM
- **OpenGL backend**: Uses wxGLCanvas - **requires this implementation**

KiCad's OpenGL GAL provides:
- Hardware-accelerated rendering
- Better performance for complex PCBs
- 3D viewer support

Without wxGLCanvas, KiCad would be limited to Cairo rendering only.
