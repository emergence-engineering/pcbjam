# KiCad WASM Build System

This document describes how to build KiCad for WebAssembly using the Docker-based build system.

## Prerequisites

### Docker
- Docker Desktop with ARM64 support (for Apple Silicon) or x86_64
- 10+ GB disk space for build cache
- Recommended: 10 CPUs, 32GB RAM allocated to Docker

### Host Tools

Binaryen (wasm-opt) is downloaded automatically by the build script. No manual installation needed.

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

## Two-Phase Build

The build is split into two phases due to memory requirements:

### Phase 1: Docker Compilation
Compiles KiCad to WASM **without** asyncify transformation. This runs inside Docker with 32GB memory limit.

### Phase 2: Host Asyncify
Applies `wasm-opt --asyncify` on the host machine using Binaryen v121 (downloaded automatically to `tools/`). This transformation uses ~20-30GB RAM.

**Note:** Binaryen v121 is used because v125 has a regression causing crashes in the asyncify liveness analysis.

### Why Asyncify?

Asyncify is an Emscripten transformation that allows WASM code to pause and resume execution. This is required for:

- **Modal dialogs** - `wxDialog::ShowModal()` blocks until user closes the dialog
- **Message boxes** - `wxMessageBox()` waits for user response
- **Clipboard operations** - Browser clipboard API is async
- **Sleep/wait operations** - Any blocking call that needs to yield to the browser

Without asyncify, modal dialogs would freeze the browser because WASM cannot yield control back to JavaScript's event loop.

### How It Works

1. `docker/build.sh` compiles KiCad in Docker (no asyncify flags)
2. Output is copied to `./output/` directory
3. `wasm-opt --asyncify` runs on host, transforming the WASM binary
4. Final output is ready for browser execution

### Technical Details

The asyncify transformation:
- Instruments every function that might be on the call stack during an async operation
- Adds stack save/restore logic to unwind and rewind the WASM stack
- Increases binary size by ~20% (141MB → 171MB for KiCad)
- Uses `asyncify-imports` pattern matching to identify async entry points

Import patterns used:
- `env.invoke_*` - Exception handling trampolines
- `env.__asyncjs__*` - EM_ASYNC_JS functions (like `startModal()`)

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
| `--full` | Full clean rebuild (all deps + wxWidgets + KiCad) |
| `--clean-kicad` | Clean only KiCad build directory |
| `--build-deps` | Build dependencies (skipped by default) |
| `--release` | Disable debug symbols, enable optimizations |
| `--debug` | Enable debug symbols (default) |
| `-j N` | Parallel jobs (default: all cores) |

### Build Modes

| Mode | Command | Description |
|------|---------|-------------|
| **Incremental (default)** | `./docker/build.sh` | Fastest for development (~1.5 min) |
| **Full rebuild** | `./docker/build.sh --full` | Clean everything and rebuild |
| **Rebuild KiCad** | `./docker/build.sh --clean-kicad` | Clean and rebuild KiCad only |
| **With dependencies** | `./docker/build.sh --build-deps` | Also rebuild dependencies |

**Full rebuild removes:**
- `build-wasm/stamps/*` - All build stamps
- `build-wasm/deps/*` - All dependency builds
- `build-wasm/wxwidgets-universal` - wxWidgets build
- `build-wasm/sysroot/*` - Installed headers/libraries
- `build-wasm/kicad-pcbnew` - KiCad build

## Incremental Build System

The build system is optimized for fast development iteration:

### How It Works
- **ccache**: Caches compiled objects by hashing preprocessed source
- **wxWidgets**: `configure` runs once, `make` handles file-level dependencies
- **KiCad**: CMake tracks dependencies, only recompiles changed files
- **Asyncify**: Post-processing runs every build (~1 min, irreducible minimum)

### Performance

| Scenario | Time |
|----------|------|
| No changes | ~1.5 min |
| Single file change (KiCad or wxWidgets) | ~1.5 min |
| Full rebuild | ~10 min |

Most time is spent on asyncify post-processing which runs on every build.

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

Dependency build progress is tracked with stamp files in `build-wasm/stamps/`:

```
build-wasm/stamps/
├── zstd.stamp
├── protobuf.stamp
├── freetype.stamp
├── harfbuzz.stamp
├── pixman.stamp
├── cairo.stamp
└── kicad-pcbnew.stamp
```

**Note:** wxWidgets and KiCad use make/CMake for incremental builds instead of stamps.

**Clear specific component:** `rm build-wasm/stamps/zstd.stamp`
**Clear all stamps:** `rm -f build-wasm/stamps/*.stamp`

After changing build flags (debug/release), use `--full` to force a complete rebuild.

## Build Scripts

| Script | Purpose |
|--------|---------|
| `docker/build.sh` | Host entry point (starts Docker, runs build) |
| `scripts/kicad/build-pcbnew.sh` | KiCad PCBnew build (runs inside Docker) |
| `scripts/build-wxuniversal-wasm.sh` | wxWidgets build |
| `scripts/build-wasm-test.sh` | Build wxWidgets test apps |
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
- For KiCad: use `--clean-kicad` to force rebuild
- For wxWidgets: delete `build-wasm/wxwidgets-universal/Makefile` to force reconfigure

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
# Copy WASM output to test directory
./tests/scripts/setup-kicad-wasm.sh

# Run KiCad tests
cd tests
npm install
npm run test:kicad     # Run Playwright tests
```
