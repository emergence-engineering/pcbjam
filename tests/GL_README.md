# Emscripten LEGACY_GL_EMULATION - Immediate Mode Notes

## Overview

This document describes the behavior and limitations of Emscripten's `LEGACY_GL_EMULATION` when using OpenGL immediate mode (glBegin/glEnd) in WebAssembly builds.

## Key Finding: Color Per Vertex Requirement

**Emscripten's immediate mode requires color to be specified per-vertex, not using OpenGL's "current color" semantic.**

### Standard OpenGL Behavior

In desktop OpenGL, you can set a color once and it applies to all subsequent vertices:

```cpp
glBegin(GL_TRIANGLES);
    glColor3f(1.0f, 0.0f, 0.0f);  // Set current color to red
    glVertex3f(0, 0, 0);           // Uses red
    glVertex3f(1, 0, 0);           // Still uses red
    glVertex3f(0, 1, 0);           // Still uses red
glEnd();
```

### Emscripten Behavior

In Emscripten's LEGACY_GL_EMULATION, you **must** call `glColor*()` before **each** `glVertex*()`:

```cpp
glBegin(GL_TRIANGLES);
    glColor3f(1.0f, 0.0f, 0.0f);  // Color for vertex 1
    glVertex3f(0, 0, 0);
    glColor3f(1.0f, 0.0f, 0.0f);  // Color for vertex 2 - REQUIRED!
    glVertex3f(1, 0, 0);
    glColor3f(1.0f, 0.0f, 0.0f);  // Color for vertex 3 - REQUIRED!
    glVertex3f(0, 1, 0);
glEnd();
```

### Why This Happens

Emscripten's GLImmediate module calculates vertex stride based on enabled attributes:
- Position (glVertex3f): 16 bytes (4 floats: x, y, z, w)
- Color (glColor3f/4f): 4 bytes (4 unsigned bytes: r, g, b, a)
- **Total stride: 20 bytes per vertex**

The `numVertices` calculation is:
```javascript
numVertices = 4 * vertexCounter / stride
```

If color is only specified once but vertices are specified multiple times, `vertexCounter` won't be evenly divisible by `stride`, causing the assertion:
```
Assertion failed: `numVertices` must be an integer.
```

## Verified Working Functions

The following immediate mode primitives work correctly with the color-per-vertex pattern:

| Primitive | Status | Notes |
|-----------|--------|-------|
| GL_TRIANGLES | Working | RGB color interpolation works |
| GL_QUADS | Working | Use glVertex3f (glVertex2f also works) |
| GL_LINES | Working | |
| GL_LINE_STRIP | Working | |
| GL_LINE_LOOP | Working | |

## Unsupported Functions

- `glVertex2d` - Not implemented in Emscripten, use `glVertex2f` or `glVertex3f` instead

## Build Flags

Enable legacy GL emulation with these Emscripten flags:
```
-sLEGACY_GL_EMULATION
-sMAX_WEBGL_VERSION=2
```

You may see these warnings (they are expected):
```
WARNING: using emscripten GL emulation. This is a collection of limited workarounds, do not expect it to work.
WARNING: using emscripten GL immediate mode emulation. This is very limited in what it supports
```

## Implications for KiCad

KiCad uses immediate mode in several places:
1. Cursor rendering in `opengl_gal.cpp`
2. Bitmap quad rendering
3. Antialiasing overlays

Any code that sets a color once and draws multiple vertices will need modification for WASM builds.

### Possible Solutions

1. **Compatibility layer**: Wrap glColor/glVertex calls to automatically replicate colors
2. **Code modification**: Update KiCad's GAL to always specify color per-vertex
3. **VBO migration**: Convert immediate mode code to use Vertex Buffer Objects

## Test Results

All immediate mode tests pass with the color-per-vertex pattern:
- RGB triangle with smooth color interpolation
- Yellow quad
- White line
- Cyan line strip
- Magenta line loop

See `apps/minimal_test.cpp` for working examples.
