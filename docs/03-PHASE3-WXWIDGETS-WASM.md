# Phase 3: wxWidgets wxUniversal for WebAssembly

## Overview

Port wxWidgets with wxUniversal backend to WebAssembly, enabling the full KiCad GUI to run in browsers. This builds on the core library already compiled to WASM (kimath, sexpr).

## Current State (from Phase 2)

Already working in WASM:
- `libkimath.a` - Geometry library (5.1MB)
- `libsexpr.a` - S-expression parser (159KB)
- `libclipper2.a` - Polygon operations (1.2MB)
- `libkicad_core_utils.a` - Core utilities (106KB)
- wxBase (non-GUI utilities) - via existing build script

## Goal

Build wxWidgets with **wxUniversal** backend for Emscripten, enabling:
- Full wxWidgets GUI rendered to HTML5 canvas
- wxGLCanvas for KiCad's GAL (Graphics Abstraction Layer)
- Event handling (mouse, keyboard, touch)

**First Milestone**: Any .kicad_pcb file renders in browser

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ HTML5 Canvas│  │   WebGL     │  │  DOM Events │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
└─────────┼────────────────┼────────────────┼─────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│              wxWidgets (wxUniversal backend)                 │
│  - Draws all widgets to canvas (no native widgets)          │
│  - wxGLCanvas → WebGL context                               │
│  - Event translation (browser → wx events)                  │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                    KiCad Application                         │
│  - GAL (Graphics Abstraction Layer) → uses wxGLCanvas       │
│  - Board data model (already in WASM)                       │
│  - PCB Painter                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Strategy: Create Your Own wxWidgets Fork

Rather than using the abandoned wxWidgets-wasm fork (based on old wx 3.0.x), create a fresh fork from modern wxWidgets 3.2.6 and apply the ~10 required patches.

### Reference: wxWidgets-wasm Commits

From [ahilss/wxWidgets-wasm](https://github.com/ahilss/wxWidgets-wasm):

| Commit | Purpose | Likely Files |
|--------|---------|--------------|
| Suppress locale warnings | Browser env | `src/common/intl.cpp` |
| Touch → mouse events | Web input | `src/univ/topluniv.cpp` |
| Font size in pixels | Web rendering | `src/univ/themes/*.cpp` |
| Size top window before run | WASM init | `src/univ/topluniv.cpp` |
| Mouse window crash fix | Event stability | `src/common/wincmn.cpp` |

### Configure Flags (from wxWidgets-wasm)

```bash
--host=emscripten \
--with-cxx=17 \
--enable-utf8 \
--enable-universal \      # Key: Use wxUniversal backend
--disable-shared \
--disable-exceptions \
--disable-richtext \
--without-libtiff \
--disable-xlocale \
--with-opengl             # Enable wxGLCanvas for WebGL
```

---

## Implementation Steps

### Step 1: Fork wxWidgets

1. Fork wxWidgets on GitHub (e.g., `VV-EE/wxWidgets`)
2. Clone locally
3. Checkout tag `v3.2.6`
4. Create branch `wasm-port`

```bash
git clone git@github.com:VV-EE/wxWidgets.git
cd wxWidgets
git checkout v3.2.6
git checkout -b wasm-port
```

### Step 2: Study wxWidgets-wasm Patches

Clone wxWidgets-wasm and identify the specific changes:

```bash
git clone https://github.com/ahilss/wxWidgets-wasm.git wxwidgets-wasm-ref
cd wxwidgets-wasm-ref

# Find commits that differ from upstream
git log --oneline | head -20
```

For each WASM-specific commit:
1. Identify changed files
2. Understand the change
3. Create equivalent patch for 3.2.6

### Step 3: Apply Patches to Your Fork

Create patch files and apply:

```bash
# In your wxWidgets fork
git apply ../patches/0001-suppress-locale-warnings.patch
git apply ../patches/0002-touch-to-mouse-events.patch
# etc.
git commit -m "Add Emscripten/WASM support"
```

### Step 4: Create Build Script

Create `scripts/build-wxuniversal-wasm.sh`:

```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_ROOT/build-wasm/wxwidgets-universal"
WX_SOURCE="$PROJECT_ROOT/wxwidgets"

# Environment setup
export CFLAGS="-I$EMSDK/upstream/emscripten/system/local/include"
export CXXFLAGS="-I$EMSDK/upstream/emscripten/system/local/include"
export LDFLAGS="-L$EMSDK/upstream/emscripten/system/local/lib -sERROR_ON_UNDEFINED_SYMBOLS=0"

CONFIGURE_ARGS="--host=emscripten \
    --with-cxx=17 \
    --enable-utf8 \
    --enable-universal \
    --disable-shared \
    --disable-exceptions \
    --disable-richtext \
    --without-libtiff \
    --disable-xlocale \
    --with-opengl"

if [ "$1" = "--clean" ]; then
    rm -rf "$BUILD_DIR"
fi

mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# Initialize submodules if needed
cd "$WX_SOURCE"
git submodule update --init src/jpeg 2>/dev/null || true
git submodule update --init 3rdparty/catch 2>/dev/null || true
cd "$BUILD_DIR"

# Configure and build
emconfigure "$WX_SOURCE/configure" $CONFIGURE_ARGS
emmake make -j$(sysctl -n hw.ncpu 2>/dev/null || nproc)

echo ""
echo "=== Build complete ==="
ls -lh "$BUILD_DIR"/lib/*.a 2>/dev/null || echo "Libraries in $BUILD_DIR/lib/"
```

### Step 5: Verify wxUniversal Build

Expected output libraries:
```
lib/
├── libwx_baseu-3.2.a           # Base utilities (strings, files, etc.)
├── libwx_coreu-3.2.a           # wxUniversal core (widgets, events)
├── libwx_glu-3.2.a             # OpenGL/WebGL support
└── libwxregexu-3.2.a           # Regex support
```

Verify `setup.h` contains:
```c
#define wxUSE_UNIVERSAL 1
#define __WXUNIVERSAL__ 1
#define wxUSE_GLCANVAS 1
```

---

## Phase 3.1: Minimal wxApp Test

### Test Application

Create `test/wx_minimal/main.cpp`:

```cpp
#include <wx/wx.h>

class MinimalApp : public wxApp {
public:
    bool OnInit() override {
        wxFrame* frame = new wxFrame(nullptr, wxID_ANY,
            "KiCad WASM Test", wxDefaultPosition, wxSize(800, 600));

        // Add a simple panel with text
        wxPanel* panel = new wxPanel(frame);
        new wxStaticText(panel, wxID_ANY, "wxWidgets in WebAssembly!",
                         wxPoint(10, 10));

        frame->Show(true);
        return true;
    }
};

wxIMPLEMENT_APP(MinimalApp);
```

### Build Command

```bash
emcc main.cpp \
    -I$WX_BUILD/lib/wx/include/emscripten-unicode-static-3.2 \
    -I$WX_SOURCE/include \
    -L$WX_BUILD/lib \
    -lwx_baseu-3.2 \
    -lwx_coreu-3.2 \
    -o minimal.html \
    -s ASYNCIFY=1 \
    -s ALLOW_MEMORY_GROWTH=1
```

### Verification

- [ ] HTML file loads in browser
- [ ] wxFrame window appears (rendered to canvas)
- [ ] Text displays
- [ ] No JavaScript errors in console

---

## Phase 3.2: wxGLCanvas + WebGL

### Test Application

Create `test/wx_glcanvas/main.cpp`:

```cpp
#include <wx/wx.h>
#include <wx/glcanvas.h>

#ifdef __EMSCRIPTEN__
#include <GLES2/gl2.h>
#else
#include <GL/gl.h>
#endif

class GLFrame : public wxFrame {
    wxGLCanvas* m_canvas;
    wxGLContext* m_context;

public:
    GLFrame() : wxFrame(nullptr, wxID_ANY, "WebGL Test",
                        wxDefaultPosition, wxSize(800, 600)) {
        wxGLAttributes attrs;
        attrs.RGBA().DoubleBuffer().Depth(16).EndList();

        m_canvas = new wxGLCanvas(this, attrs);
        m_context = new wxGLContext(m_canvas);

        m_canvas->Bind(wxEVT_PAINT, &GLFrame::OnPaint, this);
        m_canvas->Bind(wxEVT_SIZE, &GLFrame::OnSize, this);
    }

    void OnPaint(wxPaintEvent& evt) {
        wxPaintDC dc(m_canvas);
        m_context->SetCurrent(*m_canvas);

        glClearColor(0.2f, 0.3f, 0.3f, 1.0f);
        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

        // Draw a simple triangle
        // (shader code omitted for brevity)

        m_canvas->SwapBuffers();
    }

    void OnSize(wxSizeEvent& evt) {
        m_canvas->Refresh();
    }
};

class GLApp : public wxApp {
public:
    bool OnInit() override {
        GLFrame* frame = new GLFrame();
        frame->Show(true);
        return true;
    }
};

wxIMPLEMENT_APP(GLApp);
```

### Build Command (with WebGL)

```bash
emcc main.cpp \
    -I$WX_BUILD/lib/wx/include/emscripten-unicode-static-3.2 \
    -I$WX_SOURCE/include \
    -L$WX_BUILD/lib \
    -lwx_baseu-3.2 \
    -lwx_coreu-3.2 \
    -lwx_glu-3.2 \
    -o glcanvas.html \
    -s ASYNCIFY=1 \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s USE_WEBGL2=1 \
    -s FULL_ES3=1
```

### Verification

- [ ] WebGL context created successfully
- [ ] Canvas clears to specified color
- [ ] No WebGL errors in console
- [ ] Window resizing works

---

## Phase 3.3: KiCad GAL Integration

### Shader Conversion (GLSL 1.2 → GLSL ES 3.0)

KiCad shaders need conversion for WebGL 2.0:

**Vertex Shader:**
```glsl
// Before (GLSL 1.2)
#version 120
attribute vec4 a_position;
varying vec4 v_color;

// After (GLSL ES 3.0)
#version 300 es
precision highp float;
in vec4 a_position;
out vec4 v_color;
```

**Fragment Shader:**
```glsl
// Before (GLSL 1.2)
#version 120
varying vec4 v_color;
void main() {
    gl_FragColor = v_color;
}

// After (GLSL ES 3.0)
#version 300 es
precision highp float;
in vec4 v_color;
out vec4 fragColor;
void main() {
    fragColor = v_color;
}
```

### Files to Convert

- `kicad/common/gal/shaders/kicad_frag.glsl`
- `kicad/common/gal/shaders/kicad_vert.glsl`
- `kicad/common/gal/shaders/smaa_*.glsl` (anti-aliasing, optional)

### WebGL GAL Adapter

Create `core/gal-wasm/webgl_gal.h`:

```cpp
// Adapter for OPENGL_GAL to work with Emscripten WebGL
class WEBGL_GAL : public OPENGL_GAL {
public:
    WEBGL_GAL(...);

    // Override shader loading to use GLSL ES
    void loadShaders() override;

    // Skip GLEW initialization (not needed in Emscripten)
    void initGLEW() override { /* no-op */ }
};
```

---

## Phase 3.4: PCB Viewer

### Application Structure

```
viewer/
├── main.cpp              # wxApp entry point
├── pcb_view_frame.cpp    # Main frame with canvas
├── pcb_view_canvas.cpp   # wxGLCanvas + GAL + VIEW
├── index.html            # HTML shell
└── CMakeLists.txt
```

### PCB View Canvas

```cpp
class PCB_VIEW_CANVAS : public wxGLCanvas {
    std::unique_ptr<WEBGL_GAL> m_gal;
    std::unique_ptr<KIGFX::VIEW> m_view;
    std::unique_ptr<KIGFX::PCB_PAINTER> m_painter;
    BOARD* m_board = nullptr;

public:
    PCB_VIEW_CANVAS(wxWindow* parent);

    void LoadBoard(const std::string& sexpr);

protected:
    void OnPaint(wxPaintEvent& evt);
    void OnMouseWheel(wxMouseEvent& evt);  // Zoom
    void OnMouseMove(wxMouseEvent& evt);   // Pan
};
```

### JavaScript Integration

```javascript
// Load PCB file via fetch and pass to WASM
async function loadPCB(url) {
    const response = await fetch(url);
    const content = await response.text();

    // Call WASM function
    Module.ccall('loadPCBContent', 'void', ['string'], [content]);
}

// File input handler
document.getElementById('fileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const content = await file.text();
    Module.ccall('loadPCBContent', 'void', ['string'], [content]);
});
```

---

## Directory Structure

```
kicad-wasm/
├── wxwidgets/                    # Your wxWidgets fork (with WASM patches)
├── kicad/                        # KiCad source (submodule)
├── core/
│   ├── CMakeLists.txt           # Existing: kimath, sexpr, etc.
│   ├── wasm-config/             # WASM config.h
│   └── gal-wasm/                # NEW: WebGL GAL
│       ├── webgl_gal.h
│       ├── webgl_gal.cpp
│       └── shaders/
│           ├── kicad_frag_es.glsl
│           └── kicad_vert_es.glsl
├── viewer/                       # NEW: PCB Viewer app
│   ├── CMakeLists.txt
│   ├── main.cpp
│   ├── pcb_view_frame.cpp
│   ├── pcb_view_canvas.cpp
│   └── index.html
├── scripts/
│   ├── build-wxbase-wasm.sh     # Existing
│   ├── build-wxuniversal-wasm.sh # NEW
│   ├── build-core-wasm.sh       # Existing
│   └── build-viewer.sh          # NEW
├── test/
│   ├── wx_minimal/              # NEW: Test wxApp
│   └── wx_glcanvas/             # NEW: Test WebGL
└── docs/
    ├── 00-OVERVIEW.md
    ├── 01-KNOWLEDGE-BASE.md
    ├── 02-PHASE2-CORE-EXTRACTION.md
    └── 03-PHASE3-WXWIDGETS-WASM.md  # This file
```

---

## Success Criteria

### Phase 3.1: wxUniversal Build
- [ ] wxWidgets fork created with WASM patches
- [ ] `./configure` completes with `--enable-universal`
- [ ] `libwx_baseu-3.2.a`, `libwx_coreu-3.2.a`, `libwx_glu-3.2.a` built

### Phase 3.2: Minimal wxApp
- [ ] wxFrame renders in browser
- [ ] Text/widgets display correctly
- [ ] Events (click, resize) work

### Phase 3.3: wxGLCanvas
- [ ] WebGL context created
- [ ] Basic OpenGL rendering works
- [ ] Canvas clears and draws

### Phase 3.4: KiCad GAL
- [ ] Shaders converted to GLSL ES
- [ ] WEBGL_GAL draws basic shapes
- [ ] Lines, circles, polygons render

### Phase 3.5: PCB Viewer (First Milestone!)
- [ ] .kicad_pcb file loads
- [ ] Board outline visible
- [ ] Tracks visible
- [ ] Pads visible
- [ ] Pan/zoom works

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| wxWidgets 3.2 vs old wx patches | High | Patches are small (~10 commits), review carefully |
| GLSL shader incompatibility | Medium | Use WebGL 2.0 (GLSL ES 3.0), test incrementally |
| Performance with large boards | Medium | Accept slow initially, optimize later |
| Event handling differences | Medium | Test thoroughly, refer to wxWidgets-wasm solutions |

---

## References

- [wxWidgets-wasm Repository](https://github.com/ahilss/wxWidgets-wasm)
- [Wavacity (Audacity WASM port)](https://github.com/ahilss/wavacity)
- [wxWidgets WebAssembly Discussion](https://forums.wxwidgets.org/viewtopic.php?t=51463)
- [Emscripten wxWidgets Issue](https://github.com/emscripten-core/emscripten/issues/13983)