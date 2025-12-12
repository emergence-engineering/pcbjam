# KiCad WASM Build System

This document describes how to build KiCad for WebAssembly using the Docker-based build system.

## Prerequisites

- Docker Desktop with ARM64 support (for Apple Silicon) or x86_64
- 10+ GB disk space for build cache
- Recommended: 10 CPUs, 16GB RAM allocated to Docker

## Quick Start

```bash
# Build KiCad WASM (with debug symbols by default, sequential compilation)
./docker/build.sh

# Build with parallel compilation (faster, requires more RAM)
./docker/build.sh -j 4

# Build optimized release (smaller WASM, no debug symbols)
./docker/build.sh --release

# Interactive shell for debugging
./docker/shell.sh
```

**Note:** Builds run sequentially by default (`-j 1`) to avoid memory exhaustion in Docker. Use `-j N` for parallel compilation if you have sufficient RAM (at least 16GB for `-j 4`).

**Build outputs:**
- `build-wasm/kicad-pcbnew/pcbnew/pcbnew.js` - Main WASM loader
- `build-wasm/kicad-pcbnew/pcbnew/pcbnew.wasm` - WASM binary
- `build-wasm/kicad-pcbnew/pcbnew/pcbnew.wasm.map` - Source map (debug builds)

## Docker Architecture

**Base image:** `emscripten/emsdk:4.0.2-arm64`

**Volumes:**
- Source code bind mount: Project root → `/workspace`
- Build cache (named volume): `kicad-build-cache` → `/workspace/build-wasm`
- Output bind mount: `./output` → `/workspace/output`

**Entry scripts:**
| Script | Purpose |
|--------|---------|
| `docker/build.sh` | Run build from host |
| `docker/shell.sh` | Interactive shell in container |
| `docker/entrypoint.sh` | Sources Emscripten environment |

## Dependencies

| Dependency | Version | Build System | Purpose |
|-----------|---------|--------------|---------|
| GLM | 0.9.9.8 | Header-only | Math library |
| Zstd | 1.5.5 | CMake | Compression for project files |
| Protobuf | 3.21.12 | CMake | IPC serialization |
| FreeType | 2.13.2 | CMake | Font rendering |
| HarfBuzz | 8.3.0 | CMake | Text shaping |
| Pixman | 0.42.2 | Meson | Pixel manipulation |
| Cairo | 1.18.0 | Meson | 2D graphics rendering |
| Boost | 1.84.0 | B2 | Locale library |
| wxWidgets | 3.3.1 | Autoconf | GUI framework |
| OpenCASCADE | 7.8.0 | CMake | 3D geometry (optional) |
| ngspice | 45.2 | Autoconf | SPICE simulation (optional) |

### Build Order

1. **Header-only:** GLM
2. **Compression/serialization:** Zstd, Protobuf
3. **Font stack:** FreeType → HarfBuzz
4. **Graphics:** Pixman → Cairo
5. **Optional:** OpenCASCADE, ngspice
6. **GUI framework:** wxWidgets
7. **Application:** KiCad PCBnew

## Build Flags

| Flag | Description |
|------|-------------|
| `--clean` | Full clean rebuild (all deps + wxWidgets + KiCad) |
| `--no-clean` | Incremental build (don't clean anything) |
| `--skip-deps` | Skip dependency rebuild |
| `--release` | Disable debug symbols, enable optimizations |
| `--debug` | Enable debug symbols (default) |
| `-j N` | Parallel jobs (default: 1 for sequential builds) |

### Clean Modes

| Mode | Command | What gets cleaned |
|------|---------|-------------------|
| **Full clean** | `./docker/build.sh --clean` | All stamps, deps, wxWidgets, sysroot, KiCad |
| **Default** | `./docker/build.sh` | KiCad build only (reuses deps) |
| **Incremental** | `./docker/build.sh --no-clean` | Nothing (fastest for iteration) |

**Full clean removes:**
- `build-wasm/stamps/*` - All build stamps
- `build-wasm/deps/*` - All dependency builds
- `build-wasm/wxwidgets-universal` - wxWidgets build
- `build-wasm/sysroot/*` - Installed headers/libraries
- `build-wasm/kicad-pcbnew` - KiCad build

### Debug vs Release

**Debug (default):**
- Compiler: `-g -O0` (DWARF symbols, no optimization)
- Linker: `-gsource-map` (JavaScript source maps)
- Output: `~30-50MB` WASM with `.wasm.map` file
- Use for: Development, debugging WASM exceptions

**Release:**
- Compiler: `-O2` (optimized)
- Output: `~15MB` WASM
- Use for: Production deployment

## Stamp-based Caching

Build progress is tracked with stamp files in `build-wasm/stamps/`:

```
build-wasm/stamps/
├── zstd.stamp
├── protobuf.stamp
├── freetype.stamp
├── harfbuzz.stamp
├── pixman.stamp
├── cairo.stamp
├── wxwidgets.stamp
└── kicad-pcbnew.stamp
```

**Clear specific component:** `rm build-wasm/stamps/zstd.stamp`
**Clear all stamps:** `rm -f build-wasm/stamps/*.stamp`

After changing build flags (debug/release), clear stamps to force rebuild.

## Build Scripts

| Script | Purpose |
|--------|---------|
| `scripts/build-kicad-wasm.sh` | Master build orchestrator |
| `scripts/kicad/build-pcbnew.sh` | KiCad PCBnew build |
| `scripts/build-wxuniversal-wasm.sh` | wxWidgets GUI build |
| `scripts/deps/build-all-deps.sh` | All dependencies |
| `scripts/deps/build-*.sh` | Individual dependency builds |
| `scripts/common/env.sh` | Environment setup |
| `scripts/common/functions.sh` | Shared utilities |
| `scripts/common/versions.sh` | Dependency versions |

## Build Times

| Component | Approximate Time |
|-----------|-----------------|
| Dependencies (all) | 20-60 minutes |
| wxWidgets | 10-20 minutes |
| KiCad PCBnew | 5-15 minutes |
| **Total fresh build** | **1-2 hours** |

OpenCASCADE is the longest dependency to build (~30 minutes).

## Troubleshooting

### Container freezes during build
- Check Docker resource allocation (increase CPU/memory)
- Reduce parallel jobs: `./docker/build.sh -j 4`
- OpenCASCADE is resource-intensive; consider skipping with separate builds

### Build fails with missing dependency
- Clear the specific stamp: `rm build-wasm/stamps/<dep>.stamp`
- Re-run build

### Incremental build not picking up changes
- Clear KiCad stamp: `rm build-wasm/stamps/kicad-pcbnew.stamp`
- Use `--no-clean` flag to avoid full rebuild

### WASM exception with numeric error (e.g., `3788888`)
- Build with debug symbols (default): No `--release` flag
- Check for `.wasm.map` file
- Use Chrome DevTools to debug with source maps

### Clear build cache completely
```bash
docker volume rm docker_kicad-build-cache
```

## WASM Compatibility Layer

The WASM port requires compatibility layers for browser execution:

| Directory | Purpose |
|-----------|---------|
| `wasm/kiplatform/` | Platform abstraction (app, UI, printing, etc.) |
| `wasm/libcontext/` | Coroutine/fiber implementation for Asyncify |
| `wasm/stubs/` | Stub implementations (libgit2, curl) |
| `wasm/config/` | Build configuration headers |
| `cmake/` | CMake find modules for dependencies |

## Emscripten Flags

Key flags used in the build:

```
-pthread -sUSE_PTHREADS=1          # Threading support
-sASYNCIFY=1                       # Async coroutine support
-sALLOW_MEMORY_GROWTH=1            # Dynamic memory
-sINITIAL_MEMORY=256MB             # Starting memory
-sMAXIMUM_MEMORY=4GB               # Maximum memory
-sLEGACY_GL_EMULATION              # OpenGL compatibility
-sMAX_WEBGL_VERSION=2              # WebGL 2.0
```

## Testing

After building, run the test suite:

```bash
cd tests
npm install
npm run setup:kicad    # Copy WASM from build
npm run test:kicad     # Run Playwright tests
```
