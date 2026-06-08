/**
 * gl_immediate_shim.js
 *
 * Custom OpenGL immediate mode shims for KiCad WASM port.
 * Fixes Emscripten LEGACY_GL_EMULATION issues:
 * 1. Color-per-vertex requirement - injects color before each vertex automatically
 * 2. Missing double-precision functions (glVertex2d, glVertex3d, glColor3d, glColor4d)
 *
 * Usage: emcc ... --js-library=lib/gl_immediate_shim.js
 */

addToLibrary({
  // ==================================================================
  // GLImmediateShim - State tracking and function wrapping
  // ==================================================================

  $GLImmediateShim__deps: ['$GLImmediate', 'glBegin', 'glEnd', 'glVertex2f', 'glVertex3f', 'glColor3f', 'glColor4f'],
  $GLImmediateShim__postset: 'GLImmediateShim.init();',
  $GLImmediateShim: {
    // Current color state (persistent across vertices)
    currentColor: null,

    // Track if we're inside glBegin/glEnd block
    inBeginEnd: false,

    // Track if color was called since the last vertex
    // This prevents double-injection when code already calls color per vertex
    colorCalledSinceLastVertex: false,

    // Original functions we're wrapping
    origFns: {},

    // Initialization flag
    initialized: false,

    init: function() {
      if (GLImmediateShim.initialized) return;
      if (typeof GLImmediate === 'undefined') {
        // GLImmediate not ready yet, will be called again
        console.log('[GLImmediateShim] Waiting for GLImmediate...');
        return;
      }

      console.log('[GLImmediateShim] Initializing OpenGL immediate mode shims');

      // Initialize current color to white (OpenGL default)
      GLImmediateShim.currentColor = new Float32Array([1.0, 1.0, 1.0, 1.0]);

      // Store original functions
      GLImmediateShim.origFns = {
        glBegin: _glBegin,
        glEnd: _glEnd,
        glVertex2f: _glVertex2f,
        glVertex3f: _glVertex3f,
        glColor3f: _glColor3f,
        glColor4f: _glColor4f,
      };

      // Install shims
      _glBegin = GLImmediateShim.shimBegin;
      _glEnd = GLImmediateShim.shimEnd;
      _glVertex2f = GLImmediateShim.shimVertex2f;
      _glVertex3f = GLImmediateShim.shimVertex3f;
      _glColor3f = GLImmediateShim.shimColor3f;
      _glColor4f = GLImmediateShim.shimColor4f;

      GLImmediateShim.initialized = true;
      console.log('[GLImmediateShim] Initialized successfully');
    },

    // ==================================================================
    // Shim implementations
    // ==================================================================

    shimBegin: function(mode) {
      GLImmediateShim.inBeginEnd = true;
      GLImmediateShim.colorCalledSinceLastVertex = false;
      GLImmediateShim.origFns.glBegin(mode);
    },

    shimEnd: function() {
      GLImmediateShim.inBeginEnd = false;
      GLImmediateShim.origFns.glEnd();
    },

    shimColor3f: function(r, g, b) {
      var c = GLImmediateShim.currentColor;
      c[0] = r;
      c[1] = g;
      c[2] = b;
      c[3] = 1.0;

      if (GLImmediateShim.inBeginEnd) {
        // Mark that color was explicitly called for this vertex
        GLImmediateShim.colorCalledSinceLastVertex = true;
      }

      GLImmediateShim.origFns.glColor3f(r, g, b);
    },

    shimColor4f: function(r, g, b, a) {
      var c = GLImmediateShim.currentColor;
      c[0] = r;
      c[1] = g;
      c[2] = b;
      c[3] = a;

      if (GLImmediateShim.inBeginEnd) {
        // Mark that color was explicitly called for this vertex
        GLImmediateShim.colorCalledSinceLastVertex = true;
      }

      GLImmediateShim.origFns.glColor4f(r, g, b, a);
    },

    // Inject current color before each vertex (only if not already called)
    injectColor: function() {
      if (!GLImmediateShim.inBeginEnd) return;

      // Only inject color if it wasn't already called for this vertex
      if (!GLImmediateShim.colorCalledSinceLastVertex) {
        var c = GLImmediateShim.currentColor;
        GLImmediateShim.origFns.glColor4f(c[0], c[1], c[2], c[3]);
      }

      // Reset the flag for the next vertex
      GLImmediateShim.colorCalledSinceLastVertex = false;
    },

    shimVertex2f: function(x, y) {
      GLImmediateShim.injectColor();
      GLImmediateShim.origFns.glVertex2f(x, y);
    },

    shimVertex3f: function(x, y, z) {
      GLImmediateShim.injectColor();
      GLImmediateShim.origFns.glVertex3f(x, y, z);
    },
  },

  // ==================================================================
  // Double-precision vertex functions (missing in Emscripten)
  // ==================================================================

  glVertex2d__deps: ['glVertex2f'],
  glVertex2d: function(x, y) {
    _glVertex2f(x, y);
  },

  glVertex3d__deps: ['glVertex3f'],
  glVertex3d: function(x, y, z) {
    _glVertex3f(x, y, z);
  },

  glVertex4d__deps: ['glVertex4f'],
  glVertex4d: function(x, y, z, w) {
    _glVertex4f(x, y, z, w);
  },

  // ==================================================================
  // Double-precision color functions
  // ==================================================================

  glColor3d__deps: ['glColor3f'],
  glColor3d: function(r, g, b) {
    _glColor3f(r, g, b);
  },

  glColor4d__deps: ['glColor4f'],
  glColor4d: function(r, g, b, a) {
    _glColor4f(r, g, b, a);
  },
});

// Ensure GLImmediateShim is included in the build
if (typeof extraLibraryFuncs !== 'undefined') {
  extraLibraryFuncs.push('$GLImmediateShim');
}
