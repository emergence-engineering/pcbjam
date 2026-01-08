/**
 * Legacy GL stubs for wxWidgets compatibility
 *
 * wxWidgets GL library may reference these functions at runtime even though:
 * 1. wxGLAPI methods are stubbed as no-ops in C++ for WASM builds
 * 2. KiCad doesn't use wxGLAPI - it has its own GAL
 * 3. Our WEBGL_GAL uses modern WebGL 2.0 / OpenGL ES 3.0 only
 *
 * These no-op stubs satisfy the linker and runtime without affecting rendering.
 * All actual rendering goes through WEBGL_GAL which uses VBOs and shaders.
 */

addToLibrary({
  // Immediate mode rendering (replaced by VBOs in WEBGL_GAL)
  glBegin: function(mode) {},
  glEnd: function() {},

  // Vertex submission (replaced by vertex manager in WEBGL_GAL)
  glVertex2f: function(x, y) {},
  glVertex3f: function(x, y, z) {},
  glVertex2d: function(x, y) {},
  glVertex3d: function(x, y, z) {},
  glVertex4f: function(x, y, z, w) {},
  glVertex4d: function(x, y, z, w) {},

  // Color (replaced by vertex attributes/uniforms in WEBGL_GAL)
  glColor3f: function(r, g, b) {},
  glColor4f: function(r, g, b, a) {},
  glColor3d: function(r, g, b) {},
  glColor4d: function(r, g, b, a) {},
  glColor3ub: function(r, g, b) {},
  glColor4ub: function(r, g, b, a) {},

  // Texture coordinates (replaced by vertex attributes in WEBGL_GAL)
  glTexCoord2f: function(s, t) {},
  glTexCoord2d: function(s, t) {},

  // Normals (replaced by vertex attributes in WEBGL_GAL)
  glNormal3f: function(nx, ny, nz) {},
  glNormal3d: function(nx, ny, nz) {},

  // Matrix mode (replaced by MVP matrix uniform in WEBGL_GAL)
  glMatrixMode: function(mode) {},
  glLoadIdentity: function() {},
  glPushMatrix: function() {},
  glPopMatrix: function() {},

  // Projection (replaced by computeOrthoMatrix in WEBGL_GAL)
  glOrtho: function(left, right, bottom, top, near, far) {},
  glFrustum: function(left, right, bottom, top, near, far) {},

  // Matrix operations (replaced by glm in WEBGL_GAL)
  glLoadMatrixf: function(m) {},
  glLoadMatrixd: function(m) {},
  glMultMatrixf: function(m) {},
  glMultMatrixd: function(m) {},
  glTranslatef: function(x, y, z) {},
  glTranslated: function(x, y, z) {},
  glRotatef: function(angle, x, y, z) {},
  glRotated: function(angle, x, y, z) {},
  glScalef: function(x, y, z) {},
  glScaled: function(x, y, z) {},

  // Fixed function pipeline (not available in WebGL)
  glShadeModel: function(mode) {},
  glLightfv: function(light, pname, params) {},
  glLightf: function(light, pname, param) {},
  glMaterialfv: function(face, pname, params) {},
  glMaterialf: function(face, pname, param) {},
  glColorMaterial: function(face, mode) {},

  // Legacy client state (replaced by glVertexAttribPointer in WEBGL_GAL)
  glEnableClientState: function(array) {},
  glDisableClientState: function(array) {},
  glVertexPointer: function(size, type, stride, pointer) {},
  glColorPointer: function(size, type, stride, pointer) {},
  glTexCoordPointer: function(size, type, stride, pointer) {},
  glNormalPointer: function(type, stride, pointer) {},

  // Legacy texture environment (replaced by shaders in WEBGL_GAL)
  glTexEnvf: function(target, pname, param) {},
  glTexEnvi: function(target, pname, param) {},
  glTexEnvfv: function(target, pname, params) {},

  // glDrawBuffer (replaced by glDrawBuffers in WebGL 2.0)
  glDrawBuffer: function(buf) {},

  // Legacy index mode (not supported in WebGL)
  glIndexi: function(c) {},
  glIndexf: function(c) {},
});
