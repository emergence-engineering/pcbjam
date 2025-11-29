# 06 - wxGLCanvas WASM Canvas Element Integration

This document describes how to fix wxGLCanvas to render visibly in WASM by creating its own canvas element.

## Problem

wxGLCanvas currently hardcodes `m_canvasTarget = "#canvas"` which creates WebGL context on the main wxUniversal 2D canvas, causing a conflict. The GL rendering doesn't appear because it's overwritten by 2D UI rendering.

## Key Discovery

The WASM port already supports **multiple canvas elements per window**:
- Main window uses `#canvas` for 2D rendering
- Child windows can each get their own canvas element via `createWindow(id, needsCanvas=true)`
- Windows are positioned absolutely with z-index layering
- JavaScript (wx.js) manages canvas creation, positioning, and context stacking

## How KiCad Uses wxGLCanvas

```
wxFrame (EDA_DRAW_FRAME)
  └── EDA_DRAW_PANEL_GAL (wxScrolledCanvas)
         └── OPENGL_GAL (inherits from wxGLCanvas)
              - Sized to match parent
              - Child window positioned within parent
              - Has its own GL context
```

Key KiCad files:
- `kicad/common/gal/opengl/opengl_gal.cpp` - GL rendering implementation
- `kicad/common/draw_panel_gal.cpp` - Creates OPENGL_GAL as child: `new OPENGL_GAL(..., this, ...)`
- `kicad/include/gal/hidpi_gl_canvas.h` - wxGLCanvas wrapper class

---

## Solution

wxGLCanvas should integrate with the existing WASM window system:

1. **Create its own canvas element** - Use `createWindow(id, needsCanvas=true)` in JavaScript
2. **Create WebGL context on that canvas** - Use selector `#window-{id} canvas`
3. **Handle positioning via window system** - `setWindowRect()` positions the canvas

### Key JavaScript Functions (already exist in wx.js)

```javascript
createWindow(id, needsCanvas, isVisible, classList)
setWindowRect(id, x, y, width, height)
setWindowVisibility(id, isVisible)
destroyWindow(id)
```

---

## Implementation

### Step 1: Modify Create() to create canvas element

In `wxwidgets/src/wasm/glcanvas.cpp`:

```cpp
bool wxGLCanvas::Create(wxWindow *parent, ...)
{
    if ( !wxWindow::Create(parent, id, pos, size, style, name) )
        return false;

    // Create a window with canvas element in JavaScript
    int cssId = GetCSSId();
    EM_ASM({
        createWindow($0, true, true, "glcanvas");
    }, cssId);

    // Position the canvas
    wxPoint screenPos = GetScreenPosition();
    wxSize clientSize = GetClientSize();
    EM_ASM({
        setWindowRect($0, $1, $2, $3, $4);
    }, cssId, screenPos.x, screenPos.y, clientSize.GetWidth(), clientSize.GetHeight());

    // Set dynamic canvas selector
    m_canvasTarget = wxString::Format("#window-%d canvas", cssId).ToStdString();

    return CreateWebGLContext(dispAttrs);
}
```

### Step 2: Override DoSetSize for resize handling

```cpp
void wxGLCanvas::DoSetSize(int x, int y, int width, int height, int sizeFlags)
{
    wxWindow::DoSetSize(x, y, width, height, sizeFlags);

    wxPoint screenPos = GetScreenPosition();
    wxSize clientSize = GetClientSize();
    EM_ASM({
        setWindowRect($0, $1, $2, $3, $4);
    }, GetCSSId(), screenPos.x, screenPos.y, clientSize.GetWidth(), clientSize.GetHeight());
}
```

### Step 3: Handle visibility

```cpp
void wxGLCanvas::DoShow(bool show)
{
    wxWindow::DoShow(show);
    EM_ASM({
        setWindowVisibility($0, $1);
    }, GetCSSId(), show);
}
```

### Step 4: Clean up in destructor

```cpp
wxGLCanvas::~wxGLCanvas()
{
    if ( m_webglContext > 0 )
    {
        emscripten_webgl_destroy_context(m_webglContext);
        m_webglContext = 0;
    }
    EM_ASM({
        destroyWindow($0);
    }, GetCSSId());
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `wxwidgets/src/wasm/glcanvas.cpp` | Main implementation - create own canvas, dynamic selector, resize/visibility handling |
| `wxwidgets/include/wx/wasm/glcanvas.h` | Add DoSetSize, DoShow declarations if needed |

---

## Testing

The existing test app in `tests/wasm-app/` with the OpenGL tab will verify:
1. Canvas element is created in DOM
2. WebGL context is on the correct canvas
3. GL rendering appears in the canvas area
4. Legacy GL emulation works (via `-sLEGACY_GL_EMULATION`)
