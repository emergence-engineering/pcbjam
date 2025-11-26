# KiCad WebAssembly Port

Experimental project to run KiCad's core logic in WebAssembly.

## Project Structure

```
kicad-wasm/
├── kicad/              # KiCad source (git submodule)
├── patches/            # Patches for KiCad source
│   └── 0001-wasm-optional-deps.patch
├── stubs/              # Stub implementations for disabled deps
│   ├── include/        # Stub headers
│   │   ├── curl/       # CURL stub headers
│   │   ├── git2.h      # libgit2 stub header
│   │   ├── ngspice/    # ngspice stub headers
│   │   └── Standard_Version.hxx  # OCC stub header
│   └── src/            # Stub source files
│       ├── disabled_features_stubs.cpp
│       ├── occ_stubs.cpp
│       ├── panel_git_repos_stub.cpp
│       └── kicad_git_all_stubs.cpp
├── cmake/              # CMake override modules
│   ├── FindCURL.cmake
│   ├── Findlibgit2.cmake
│   ├── Findngspice.cmake
│   └── FindOCC.cmake
├── scripts/            # Build scripts
└── docs/               # Documentation
```

## Goals

1. **Phase 1**: Build KiCad with optional deps disabled (curl, git, OCC, ngspice) ✅ **Complete**
2. **Phase 2**: Extract core computation code as standalone library
3. **Phase 3**: Compile core to WebAssembly
4. **Phase 4**: Run native GUI with Wasm worker backend
5. **Phase 5**: Browser-based UI

## Documentation

- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md)
- [Knowledge Base (Summary)](docs/KNOWLEDGE_BASE.md)
- [Knowledge Base (Full)](docs/KNOWLEDGE_BASE_FULL.md)

## Design Decisions

- **Memory**: Serialize/deserialize on every operation (proof of concept)
- **Threading**: Web Workers (browser-first design)
- **Updates**: Full board re-serialization

## Getting Started

### Prerequisites

- CMake 3.22+
- C++20 compiler (GCC 10+, Clang 12+, or MSVC 2019+)
- wxWidgets 3.2+
- Required libraries

#### macOS (Homebrew)

```bash
brew install cmake wxwidgets boost cairo pixman freetype harfbuzz fontconfig \
             glm glew swig protobuf pkg-config nng python@3.14 zstd unixodbc
```

#### Ubuntu/Debian

```bash
sudo apt install cmake build-essential libwxgtk3.2-dev libboost-all-dev \
                 libcairo2-dev libpixman-1-dev libfreetype-dev libharfbuzz-dev \
                 libfontconfig-dev libglm-dev libglew-dev swig libprotobuf-dev \
                 protobuf-compiler libnng-dev python3-dev libzstd-dev
```

### Quick Start (with dependencies disabled)

```bash
# Clone with submodules
git clone --recursive <repo-url>
cd kicad-wasm

# Apply patches to KiCad source
cd kicad
git apply ../patches/0001-wasm-optional-deps.patch
cd ..

# Build
mkdir build && cd build
cmake ../kicad \
    -DCMAKE_MODULE_PATH="$(pwd)/../cmake" \
    -DKICAD_USE_CURL=OFF \
    -DKICAD_USE_GIT=OFF \
    -DKICAD_USE_OCC=OFF \
    -DKICAD_USE_NGSPICE=OFF \
    -DKICAD_SCRIPTING_WXPYTHON=OFF
make -j$(nproc)
```

### Build Options

| Option | Default | Description |
|--------|---------|-------------|
| `KICAD_USE_CURL` | ON | Enable network features (PCM, update check) |
| `KICAD_USE_GIT` | ON | Enable git integration |
| `KICAD_USE_OCC` | ON | Enable OpenCASCADE (STEP import/export) |
| `KICAD_USE_NGSPICE` | ON | Enable SPICE simulation |
| `KICAD_USE_DATABASE` | ON | Enable database libraries (ODBC) |

### Using the Build Script

```bash
# Build with all optional deps disabled (default)
./scripts/build.sh

# Build with specific features enabled
./scripts/build.sh --with-curl --with-git

# Clean build
./scripts/build.sh --clean

# Debug build
./scripts/build.sh --debug

# Just configure, don't build
./scripts/build.sh --configure-only

# See all options
./scripts/build.sh --help
```

## Current Status

### Phase 1 Complete
- CMake override modules for optional dependencies (FindOCC, Findngspice, FindCURL, Findlibgit2)
- Stub headers and implementations for disabled features
- KiCad source patches (`patches/0001-wasm-optional-deps.patch`)
- Full native build verified on macOS with all optional deps disabled

### Built Components
- `kicad` - Main application
- `kicad-cli` - Command line interface
- `_pcbnew.kiface` - PCB editor
- `_eeschema.kiface` - Schematic editor
- `_cvpcb.kiface` - Component to footprint association
- `_gerbview.kiface` - Gerber viewer
- `_pl_editor.kiface` - Page layout editor
- `_pcb_calculator.kiface` - PCB calculator

### Next Steps
- Verify build on Linux/Windows
- Begin Phase 2 (core library extraction)

## License

KiCad is GPL-3.0. This wrapper/tooling follows the same license.
