# KiCad WebAssembly Port

Run KiCad PCBnew in the browser using WebAssembly.

## Quick Start

### Full Build (KiCad + All Tests)

```bash
# 1. Initialize submodules
git submodule update --init --recursive

# 2. Build KiCad WASM (Docker, ~10 min incremental, ~1-2 hours full)
./docker/build.sh

# 3. Build wxWidgets for local testing
./scripts/build-wxuniversal-wasm.sh

# 4. Build wxWidgets test apps
./scripts/build-wasm-test.sh

# 5. Run all tests
cd tests && npm install
npm test              # wxWidgets tests (256 tests)
npm run test:kicad    # KiCad tests (2 tests)
```

### wxWidgets Only (No Docker)

```bash
# Requires: Emscripten SDK 4.0+, Node.js 18+
./scripts/build-wxuniversal-wasm.sh
./scripts/build-wasm-test.sh
cd tests && npm install && npm test
```

## Project Structure

```
kicad-wasm/
├── kicad/                  # KiCad source (git submodule)
├── wxwidgets/              # wxWidgets source (git submodule)
├── wasm/                   # WASM compatibility layer
│   ├── bindings/           # Embind bindings for JavaScript
│   ├── cmake/              # CMake find modules
│   ├── kiplatform/         # Platform abstraction (app, UI, printing)
│   ├── libcontext/         # Coroutine/fiber implementation
│   ├── shims/              # Runtime JavaScript shims
│   └── stubs/              # Stub implementations (libgit2, curl)
├── scripts/                # Build scripts
│   ├── build-wxuniversal-wasm.sh   # Build wxWidgets for WASM
│   ├── build-wasm-test.sh          # Build wxWidgets test apps
│   ├── deps/               # Dependency build scripts
│   ├── kicad/              # KiCad build scripts
│   ├── common/             # Shared utilities
│   └── config/             # Build config wrappers
├── docker/                 # Docker build environment
├── tests/                  # Playwright E2E tests
│   ├── e2e/                # Test specs
│   └── apps/               # WASM test applications
├── tools/                  # External tools (binaryen)
└── output/                 # Build output (pcbnew.js, pcbnew.wasm)
```

## Two Build Workflows

### 1. KiCad Build (Docker)

Full KiCad PCBnew build using Docker:

```bash
# Build KiCad WASM
./docker/build.sh

# Copy output to test directory
./tests/scripts/setup-kicad-wasm.sh

# Run KiCad tests
cd tests && npm install && npm run test:kicad
```

Output: `output/pcbnew.js`, `output/pcbnew.wasm`

See [build.md](build.md) for detailed build documentation.

### 2. wxWidgets Test Apps (Local)

Build standalone wxWidgets test apps for feature testing:

```bash
# Build wxWidgets for WASM
./scripts/build-wxuniversal-wasm.sh

# Build test apps
./scripts/build-wasm-test.sh

# Run wxWidgets tests
cd tests && npm install && npm test
```

Output: `tests/apps/standalone/`

## Prerequisites

### For KiCad Build (Docker)
- Docker Desktop with 16GB+ RAM allocated
- 10+ GB disk space for build cache

### For wxWidgets Build (Local)
- Emscripten SDK 4.0+
- Node.js 18+ (for tests)

```bash
# macOS
brew install emscripten node

# Initialize submodules
git submodule update --init --recursive
```

## Testing

```bash
cd tests
npm install

# Run all tests
npm test

# Run specific tests
npm run test:kicad          # KiCad tests only
npx playwright test menu    # Menu tests only
```

See [tests/README.md](tests/README.md) for test documentation.

## Current Status

- **wxWidgets WASM**: Core widgets working (menus, dialogs, grids, trees, OpenGL)
- **KiCad PCBnew**: Builds and loads in browser, canvas rendering working
- **In Progress**: Testing wxWidgets features used by KiCad

## Documentation

- [Build System](build.md) - Docker build details
- [Docker README](docker/README.md) - Container setup
- [Tests README](tests/README.md) - Test infrastructure

## License

KiCad is GPL-3.0. This project follows the same license.
