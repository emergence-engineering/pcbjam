/**
 * gl_immediate_shim.js
 *
 * Custom legacy-OpenGL shims for the KiCad WASM 3D viewer, layered on top of
 * Emscripten's -sLEGACY_GL_EMULATION. Fills the gaps that emulation leaves:
 *
 *  1. Immediate mode (glBegin/glEnd): inject the current color before each
 *     vertex (Emscripten requires a color per vertex) + double-precision
 *     glVertex / glColor overloads.
 *
 *  2. Display lists (glGenLists/glNewList/glCallList/...): NOT implemented by
 *     Emscripten at all. KiCad's 3D renderer compiles every board layer into a
 *     display list (client vertex arrays + glDrawArrays, or immediate mode for
 *     the grid) and replays it each frame. We record the GL calls between
 *     glNewList/glEndList and replay them on glCallList. For glDrawArrays the
 *     client array data may be freed after compile, so we snapshot it into a
 *     real (Emscripten-tracked) VBO at record time and replay from the VBO.
 *
 *  3. Fixed-function lighting entry points Emscripten lacks (glColorMaterial,
 *     glLightModeli) — stubbed so the link resolves; lighting falls back to
 *     flat/vertex color, which still yields a recognizable board.
 *
 * Usage: emcc ... --js-library=wasm/shims/gl_immediate_shim.js
 */

addToLibrary({
  $GLImmediateShim__deps: [
    '$GL', '$GLImmediate',
    'glBegin', 'glEnd', 'glVertex2f', 'glVertex3f', 'glColor3f', 'glColor4f',
    'glNormal3f', 'glDrawArrays', 'glClear',
    'glEnable', 'glDisable', 'glBlendFunc', 'glBindTexture', 'glLineWidth',
    'glDepthMask',
    'glLightfv', 'glMaterialfv', 'glLightModelfv', 'glLightModelf',
    'glGenBuffers', 'glBindBuffer', 'glBufferData',
    'glEnableClientState', 'glDisableClientState',
    'glVertexPointer', 'glNormalPointer', 'glColorPointer', 'glTexCoordPointer',
    'malloc', 'free',
  ],
  $GLImmediateShim__postset: 'GLImmediateShim.init();',
  $GLImmediateShim: {
    // ---- GL constants we use directly ----
    GL_ARRAY_BUFFER: 0x8892,
    GL_STATIC_DRAW: 0x88E4,
    GL_FLOAT: 0x1406,
    GL_COMPILE: 0x1300,
    // Client-state enums, indexed by GLImmediate attribute slot.
    CLIENT_STATE: [0x8074 /*VERTEX*/, 0x8075 /*NORMAL*/, 0x8076 /*COLOR*/, 0x8078 /*TEXCOORD*/],

    // ---- immediate-mode color state ----
    currentColor: null,
    inBeginEnd: false,
    colorCalledSinceLastVertex: false,

    // ---- display-list state ----
    lists: null,            // id -> array of replay closures
    listBuffers: null,      // id -> array of malloc'd HEAP ptrs to free on delete
    nextListId: 1,
    compiling: 0,           // id currently being compiled, or 0
    tmpIdPtr: 0,            // scratch HEAP slot for glGenBuffers output
    lastImmediateContext: null, // GL context GLImmediate's FFP programs were built for

    // ---- temporary diagnostics (remove once rendering is confirmed) ----
    dbg: { clears: 0, newLists: 0, snaps: 0, calls: 0, replayDraws: 0 },
    dbgLog: function(cat, msg) {
      var d = GLImmediateShim.dbg;
      if (d[cat] === undefined) d[cat] = 0;
      d[cat]++;
      if (d[cat] <= 30) console.log('[DL] ' + msg);
      else if (d[cat] === 31) console.log('[DL] ...(' + cat + ' further logs suppressed)');
    },

    origFns: {},
    initialized: false,

    init: function() {
      if (GLImmediateShim.initialized) return;
      if (typeof GLImmediate === 'undefined') return;  // retried via postset chain

      console.log('[GLImmediateShim] Initializing legacy-GL + display-list shims');
      GLImmediateShim.currentColor = new Float32Array([1.0, 1.0, 1.0, 1.0]);
      GLImmediateShim.lists = {};
      GLImmediateShim.listBuffers = {};

      var S = GLImmediateShim;
      S.origFns = {
        glBegin: _glBegin, glEnd: _glEnd,
        glVertex2f: _glVertex2f, glVertex3f: _glVertex3f,
        glColor3f: _glColor3f, glColor4f: _glColor4f,
        glNormal3f: _glNormal3f, glDrawArrays: _glDrawArrays, glClear: _glClear,
        glEnable: _glEnable, glDisable: _glDisable, glBlendFunc: _glBlendFunc,
        glBindTexture: _glBindTexture, glLineWidth: _glLineWidth, glDepthMask: _glDepthMask,
      };

      // Immediate-mode wrappers (color injection + display-list recording).
      _glBegin       = S.shimBegin;
      _glEnd         = S.shimEnd;
      _glVertex2f    = S.shimVertex2f;
      _glVertex3f    = S.shimVertex3f;
      _glColor3f     = S.shimColor3f;
      _glColor4f     = S.shimColor4f;
      _glNormal3f    = S.shimNormal3f;
      _glDrawArrays  = S.shimDrawArrays;
      _glClear       = S.shimClear;

      // State-setting calls that may appear inside a display list.
      _glEnable      = S.recWrap('glEnable');
      _glDisable     = S.recWrap('glDisable');
      _glBlendFunc   = S.recWrap('glBlendFunc');
      _glBindTexture = S.recWrap('glBindTexture');
      _glLineWidth   = S.recWrap('glLineWidth');
      _glDepthMask   = S.recWrap('glDepthMask');

      // Emscripten's glemu THROWS on fixed-function light/material pnames it
      // doesn't implement (e.g. glLightfv GL_SPECULAR/GL_POSITION). KiCad's
      // lighting setup runs every frame right after the clear, so an unguarded
      // throw aborts the whole 3D render before the board is drawn. Wrap these
      // so the supported pnames still take effect and the rest are skipped.
      S.origFns.glLightfv = _glLightfv;
      _glLightfv = function(light, pname, params) {
        try { S.origFns.glLightfv(light, pname, params); }
        catch (e) { S.dbgLog('lightSkip', 'glLightfv skipped pname=0x' + pname.toString(16)); }
      };
      S.origFns.glMaterialfv = _glMaterialfv;
      _glMaterialfv = function(face, pname, params) {
        try { S.origFns.glMaterialfv(face, pname, params); }
        catch (e) { S.dbgLog('matSkip', 'glMaterialfv skipped pname=0x' + pname.toString(16)); }
      };
      S.origFns.glLightModelfv = _glLightModelfv;
      _glLightModelfv = function(pname, params) {
        try { S.origFns.glLightModelfv(pname, params); } catch (e) {}
      };
      S.origFns.glLightModelf = _glLightModelf;
      _glLightModelf = function(pname, param) {
        try { S.origFns.glLightModelf(pname, param); } catch (e) {}
      };

      GLImmediateShim.initialized = true;
      console.log('[GLImmediateShim] Initialized successfully');
    },

    record: function(closure) { GLImmediateShim.lists[GLImmediateShim.compiling].push(closure); },

    freeListBuffers: function(list) {
      var bufs = GLImmediateShim.listBuffers[list];
      if (bufs) { for (var i = 0; i < bufs.length; i++) _free(bufs[i]); bufs.length = 0; }
    },

    // Emscripten generates GLImmediate's per-context temp vertex/quad buffer pool
    // (GL.currentContext.tempVertexBuffers1/2) only once, in GLEmulation.init(),
    // for whichever context is current then — i.e. the FIRST WebGL context (the
    // 2D board canvas). The 3D viewer owns a SECOND context that never gets the
    // pool, so its first immediate-mode/client-array draw throws
    // ("tempVertexBuffers1 is undefined"). Lazily generate the pool for any
    // context that lacks it. (quads=true also sets up the quad index buffer the
    // background gradient's GL_QUADS needs.)
    ensureTempBuffers: function() {
      if (typeof GL === 'undefined' || !GL.currentContext || typeof GLImmediate === 'undefined') return;
      var ctx = GL.currentContext;

      // GLImmediate (legacy GL emulation) is single-context: GLEmulation.init()
      // sets up its per-context temp buffers + FFP shader programs only for the
      // FIRST WebGL context (KiCad's 2D board GAL). The 3D viewer owns a SECOND
      // context that GLImmediate never initialised — we detect it as the one
      // lacking the temp vertex buffer pool and patch GLImmediate to work on it.
      if (ctx.tempVertexBuffers1 === undefined && typeof GL.generateTempBuffers === 'function') {
        GL.generateTempBuffers(true, ctx);     // per-context temp vertex/quad buffers
        ctx.__glsForeign = true;               // mark: not GLImmediate's home context
        GLImmediateShim.dbgLog('tempBuf', 'initialised GLImmediate for the 3D viewer context');
      }

      if (ctx.__glsForeign) {
        // createRenderer() reuses the bound user program (GL.currProgram) instead
        // of building its own FFP program when one is set; the 2D GAL leaves its
        // (other-context) program bound, which is "not linked" here → FFP draws
        // silently produce nothing. Zero it every time we render on this context
        // so the FFP builds + uses a program that belongs to THIS context.
        GL.currProgram = 0;

        // The FFP renderer/program cache is global and holds the 2D context's
        // program; drop it once so it regenerates for this context.
        if (GLImmediateShim.lastImmediateContext !== ctx) {
          GLImmediateShim.lastImmediateContext = ctx;
          GLImmediate.currentRenderer = null;
          GLImmediate.fixedFunctionProgram = 0;
          if (GLImmediate.MapTreeLib && GLImmediate.rendererCache) {
            GLImmediate.rendererCache = GLImmediate.MapTreeLib.create();
          }
          // Force the regenerated FFP program to receive the current matrices /
          // light state (a fresh program starts with default uniforms).
          GLImmediate.matricesModified = true;
          GLImmediate.lightingModified = true;
          GLImmediateShim.dbgLog('ctxReset', 'reset FFP program cache for the 3D viewer context');
        }
      }
    },

    // Generic recorder for state calls: when compiling, defer the original call
    // to replay time; otherwise pass through immediately. The non-compiling path
    // (the overwhelmingly common case — these wrap hot calls like glEnable that
    // the 2D GAL makes constantly) forwards arguments without allocating.
    recWrap: function(name) {
      return function() {
        var orig = GLImmediateShim.origFns[name];
        if (!GLImmediateShim.compiling) return orig.apply(null, arguments);
        var args = Array.prototype.slice.call(arguments);
        GLImmediateShim.record(function() { orig.apply(null, args); });
      };
    },

    // ---- immediate mode ----
    shimBegin: function(mode) {
      if (GLImmediateShim.compiling) { GLImmediateShim.record(function() { _glBegin(mode); }); return; }
      GLImmediateShim.ensureTempBuffers();
      GLImmediateShim.inBeginEnd = true;
      GLImmediateShim.colorCalledSinceLastVertex = false;
      GLImmediateShim.origFns.glBegin(mode);
    },
    shimEnd: function() {
      if (GLImmediateShim.compiling) { GLImmediateShim.record(function() { _glEnd(); }); return; }
      GLImmediateShim.inBeginEnd = false;
      GLImmediateShim.origFns.glEnd();
    },
    shimColor3f: function(r, g, b) {
      if (GLImmediateShim.compiling) { GLImmediateShim.record(function() { _glColor3f(r, g, b); }); return; }
      var c = GLImmediateShim.currentColor; c[0] = r; c[1] = g; c[2] = b; c[3] = 1.0;
      if (GLImmediateShim.inBeginEnd) GLImmediateShim.colorCalledSinceLastVertex = true;
      GLImmediateShim.origFns.glColor3f(r, g, b);
    },
    shimColor4f: function(r, g, b, a) {
      if (GLImmediateShim.compiling) { GLImmediateShim.record(function() { _glColor4f(r, g, b, a); }); return; }
      var c = GLImmediateShim.currentColor; c[0] = r; c[1] = g; c[2] = b; c[3] = a;
      if (GLImmediateShim.inBeginEnd) GLImmediateShim.colorCalledSinceLastVertex = true;
      GLImmediateShim.origFns.glColor4f(r, g, b, a);
    },
    injectColor: function() {
      if (!GLImmediateShim.inBeginEnd) return;
      if (!GLImmediateShim.colorCalledSinceLastVertex) {
        var c = GLImmediateShim.currentColor;
        GLImmediateShim.origFns.glColor4f(c[0], c[1], c[2], c[3]);
      }
      GLImmediateShim.colorCalledSinceLastVertex = false;
    },
    shimVertex2f: function(x, y) {
      if (GLImmediateShim.compiling) { GLImmediateShim.record(function() { _glVertex2f(x, y); }); return; }
      GLImmediateShim.injectColor(); GLImmediateShim.origFns.glVertex2f(x, y);
    },
    shimVertex3f: function(x, y, z) {
      if (GLImmediateShim.compiling) { GLImmediateShim.record(function() { _glVertex3f(x, y, z); }); return; }
      GLImmediateShim.injectColor(); GLImmediateShim.origFns.glVertex3f(x, y, z);
    },
    shimNormal3f: function(x, y, z) {
      if (GLImmediateShim.compiling) { GLImmediateShim.record(function() { _glNormal3f(x, y, z); }); return; }
      GLImmediateShim.origFns.glNormal3f(x, y, z);
    },
    shimClear: function(mask) {
      if (GLImmediateShim.compiling) { GLImmediateShim.record(function() { _glClear(mask); }); return; }
      GLImmediateShim.ensureTempBuffers();
      var vp = '?', bw = '?', bh = '?';
      if (typeof GLctx !== 'undefined' && GLctx) {
        try { var v = GLctx.getParameter(GLctx.VIEWPORT); vp = v[0] + ',' + v[1] + ',' + v[2] + ',' + v[3]; } catch (e) {}
        bw = GLctx.drawingBufferWidth; bh = GLctx.drawingBufferHeight;
      }
      GLImmediateShim.dbgLog('clears', 'glClear mask=0x' + mask.toString(16) +
        ' viewport=[' + vp + '] drawingBuffer=' + bw + 'x' + bh +
        ' listsAlive=' + Object.keys(GLImmediateShim.lists).length);
      GLImmediateShim.origFns.glClear(mask);
    },

    // ---- glDrawArrays: snapshot client arrays into a VBO when compiling ----
    shimDrawArrays: function(mode, first, count) {
      if (!GLImmediateShim.compiling) { GLImmediateShim.origFns.glDrawArrays(mode, first, count); return; }

      var S = GLImmediateShim;

      // Snapshot each enabled client array into a PERSISTENT HEAP buffer (the
      // source container may be freed once the list is compiled). At replay we
      // re-point the client arrays at these buffers with NO VBO bound, so glemu
      // takes its native client-array path: it reads each separate array from
      // HEAP and builds its own interleaved per-context temp buffer. (Binding our
      // own VBOs can't work — glemu binds a single GL_ARRAY_BUFFER, so separate
      // vertex/normal/texcoord VBOs collide.)
      var captured = [];
      for (var slot = 0; slot < 4; slot++) {
        if (!GLImmediate.enabledClientAttributes[slot]) continue;
        var a = GLImmediate.clientAttributes[slot];
        if (!a) continue;
        var size = a.size;
        var stride = a.stride || size * 4;       // GL_FLOAT arrays; stride 0 = tight
        var heapPtr = _malloc(count * size * 4);  // persists for the list's lifetime
        var dst = heapPtr >> 2, src = (a.pointer + first * stride) >> 2, strideF = stride >> 2;
        for (var i = 0; i < count; i++)
          for (var j = 0; j < size; j++)
            HEAPF32[dst + i * size + j] = HEAPF32[src + i * strideF + j];
        captured.push({ slot: slot, size: size, heapPtr: heapPtr });
      }
      if (S.listBuffers[S.compiling])
        for (var b = 0; b < captured.length; b++) S.listBuffers[S.compiling].push(captured[b].heapPtr);

      S.dbgLog('snaps', 'snapshot list=' + S.compiling + ' mode=0x' + mode.toString(16) +
        ' count=' + count + ' capturedSlots=[' + captured.map(function(c){return c.slot;}).join(',') + ']');

      S.record(function() {
        S.ensureTempBuffers();
        _glBindBuffer(S.GL_ARRAY_BUFFER, 0);   // client arrays from HEAP, not a VBO
        for (var k = 0; k < captured.length; k++) {
          var c = captured[k];
          _glEnableClientState(S.CLIENT_STATE[c.slot]);
          switch (c.slot) {
            case 0: _glVertexPointer(c.size, S.GL_FLOAT, 0, c.heapPtr); break;
            case 1: _glNormalPointer(S.GL_FLOAT, 0, c.heapPtr); break;
            case 2: _glColorPointer(c.size, S.GL_FLOAT, 0, c.heapPtr); break;
            case 3: _glTexCoordPointer(c.size, S.GL_FLOAT, 0, c.heapPtr); break;
          }
        }
        S.origFns.glDrawArrays(mode, 0, count);
        if (S.dbg.replayDraws < 8) {
          S.dbg.replayDraws++;
          var e = (typeof GLctx !== 'undefined' && GLctx) ? GLctx.getError() : -1;
          var v0 = captured.length ? (captured[0].heapPtr >> 2) : 0;
          var fv = captured.length
            ? '(' + HEAPF32[v0].toFixed(3) + ',' + HEAPF32[v0 + 1].toFixed(3) + ',' + HEAPF32[v0 + 2].toFixed(3) + ')'
            : 'none';
          var mv = GLImmediate.matrix && GLImmediate.matrix[0], pr = GLImmediate.matrix && GLImmediate.matrix[1];
          var fmt = function(m) { return m ? '[' + m[0].toFixed(2) + ',' + m[5].toFixed(2) + ',' + m[10].toFixed(2) + ',' + m[12].toFixed(2) + ',' + m[13].toFixed(2) + ',' + m[14].toFixed(2) + ']' : '?'; };
          console.log('[DL] replay draw count=' + count + ' slots=[' +
            captured.map(function(c){return c.slot;}).join(',') + '] glError=0x' + e.toString(16) +
            ' v0=' + fv + ' mv' + fmt(mv) + ' proj' + fmt(pr));
        }
        for (var m = 0; m < captured.length; m++)
          _glDisableClientState(S.CLIENT_STATE[captured[m].slot]);
      });
    },
  },

  // ==================================================================
  // Display lists
  // ==================================================================
  glGenLists__deps: ['$GLImmediateShim'],
  glGenLists: function(range) {
    if (range <= 0) return 0;
    var base = GLImmediateShim.nextListId;
    GLImmediateShim.nextListId += range;
    for (var i = 0; i < range; i++) {
      GLImmediateShim.lists[base + i] = [];
      GLImmediateShim.listBuffers[base + i] = [];
    }
    return base;
  },
  glIsList__deps: ['$GLImmediateShim'],
  glIsList: function(list) {
    return (GLImmediateShim.lists && GLImmediateShim.lists[list]) ? 1 : 0;
  },
  glNewList__deps: ['$GLImmediateShim'],
  glNewList: function(list, mode) {
    GLImmediateShim.freeListBuffers(list);   // rebuilding: free the prior data
    GLImmediateShim.lists[list] = [];
    GLImmediateShim.listBuffers[list] = [];
    GLImmediateShim.compiling = list;
  },
  glEndList__deps: ['$GLImmediateShim'],
  glEndList: function() { GLImmediateShim.compiling = 0; },
  glCallList__deps: ['$GLImmediateShim'],
  glCallList: function(list) {
    var cmds = GLImmediateShim.lists[list];
    if (!cmds) return;
    GLImmediateShim.dbgLog('calls', 'callList ' + list + ' cmds=' + cmds.length);
    for (var i = 0; i < cmds.length; i++) cmds[i]();
  },
  glDeleteLists__deps: ['$GLImmediateShim'],
  glDeleteLists: function(list, range) {
    for (var i = 0; i < range; i++) {
      GLImmediateShim.freeListBuffers(list + i);
      delete GLImmediateShim.lists[list + i];
      delete GLImmediateShim.listBuffers[list + i];
    }
  },

  // ==================================================================
  // Fixed-function lighting entry points Emscripten lacks (no-op stubs).
  // Lighting falls back to flat/vertex color — still a recognizable board.
  // ==================================================================
  glColorMaterial: function(face, mode) {},
  glLightModeli: function(pname, param) {},
  glMaterialf: function(face, pname, param) {},

  // ==================================================================
  // GLU quadrics (sphere/cylinder/disk) — used for the navigation gizmo and
  // rounded via/segment ends. Emscripten ships no GLU quadric runtime, so stub
  // them: a non-null quadric handle plus no-op draws. The board's layer
  // geometry comes from the display lists, not these, so it still renders.
  // ==================================================================
  gluNewQuadric: function() { return 1; },
  gluDeleteQuadric: function(q) {},
  gluQuadricDrawStyle: function(q, style) {},
  gluQuadricNormals: function(q, normals) {},
  gluCylinder: function(q, base, top, height, slices, stacks) {},
  gluDisk: function(q, inner, outer, slices, loops) {},
  gluSphere: function(q, radius, slices, stacks) {},

  // ==================================================================
  // Double-precision vertex/color overloads (missing in Emscripten)
  // ==================================================================
  glVertex2d__deps: ['glVertex2f'],
  glVertex2d: function(x, y) { _glVertex2f(x, y); },
  glVertex3d__deps: ['glVertex3f'],
  glVertex3d: function(x, y, z) { _glVertex3f(x, y, z); },
  glVertex4d__deps: ['glVertex4f'],
  glVertex4d: function(x, y, z, w) { _glVertex4f(x, y, z, w); },
  glColor3d__deps: ['glColor3f'],
  glColor3d: function(r, g, b) { _glColor3f(r, g, b); },
  glColor4d__deps: ['glColor4f'],
  glColor4d: function(r, g, b, a) { _glColor4f(r, g, b, a); },
});

// Ensure GLImmediateShim is included in the build
if (typeof extraLibraryFuncs !== 'undefined') {
  extraLibraryFuncs.push('$GLImmediateShim');
}
