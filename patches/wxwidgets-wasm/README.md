# wxWidgets WASM Port Patch

Single unified patch that transforms wxWidgets into a WASM-capable build.

## Base Version

- Repository: git@github.com:VV-EE/wxWidgets.git
- Commit: 5ff25322553c1870cf20a2e1ba6f20ed50d9fe9a
- Generated: 2025-11-27 14:10:12 UTC

## Patch Contents

This single patch includes:
- Main wxWidgets modifications (config.sub, configure.in, headers, sources)
- New WASM platform: src/wasm/, include/wx/wasm/
- New build files: build/wasm/
- WASM theme renderer: src/univ/themes/wasm.cpp
- Submodule config.sub updates for emscripten/wasm32 support:
  - 3rdparty/pcre/config.sub
  - src/expat/expat/conftools/config.sub
  - src/jpeg/config.sub
  - src/png/config.sub
  - src/tiff/config/config.sub

## Apply Instructions

```bash
# Clone wxWidgets fork at the base commit
git clone git@github.com:VV-EE/wxWidgets.git wxwidgets-clean
cd wxwidgets-clean
git checkout 5ff25322553c1870cf20a2e1ba6f20ed50d9fe9a
git submodule update --init --recursive

# Apply the unified patch
patch -p1 < /path/to/patches/wxwidgets-wasm/wxwidgets-wasm.patch

# Build
mkdir build && cd build
emconfigure ../configure --host=emscripten --enable-universal ...
emmake make
```

## Verification

```bash
shasum -a 256 -c checksums.sha256
```
