# Docker Build Environment for KiCad WASM

This directory contains Docker configuration for building KiCad for WebAssembly in a reproducible, isolated environment.

## Prerequisites

- Docker Desktop (with Docker Compose v2)
- Git submodules initialized: `git submodule update --init --recursive`

## Quick Start

```bash
# Build KiCad WASM (full build)
./docker/build.sh

# Build with options
./docker/build.sh --no-clean    # Skip cleaning build directory
./docker/build.sh --debug       # Build with debug symbols

# Interactive shell for debugging
./docker/shell.sh
```

## What Gets Built

The build process includes:

1. **Dependencies** (cached in Docker volume):
   - GLM (header-only)
   - Zstd, Protobuf
   - FreeType, HarfBuzz
   - Pixman, Cairo
   - Boost (Locale)
   - OpenCASCADE (optional, for 3D/STEP)
   - CURL headers, libgit2 headers (stubs)

2. **wxWidgets** (built from submodule)

3. **KiCad PCBnew** (main application)

## Container Resources

Configured for M4 Max (adjust in docker-compose.yml):
- CPUs: 10 cores
- Memory: 16GB

## Volume Strategy

| Path | Type | Purpose |
|------|------|---------|
| `/workspace` | Bind mount | Source code |
| `/workspace/build-wasm` | Named volume | Build cache (deps, sysroot) |
| `/workspace/output` | Bind mount | Final WASM output |

## Common Commands

```bash
# Start container
docker compose -f docker/docker-compose.yml up -d

# Run a command inside
docker compose -f docker/docker-compose.yml exec kicad-wasm-builder <command>

# View logs
docker compose -f docker/docker-compose.yml logs -f

# Stop container
docker compose -f docker/docker-compose.yml down

# Clear build cache (full rebuild)
docker volume rm docker_kicad-build-cache
```

## Troubleshooting

### Build freezes
The OpenCASCADE build is very resource-intensive. If it freezes:
1. Reduce parallel jobs: Edit script to use `-j4` instead of `-j$(nproc)`
2. Monitor with `docker stats`
3. Consider building OpenCASCADE separately with `./scripts/deps/build-opencascade.sh`

### Permission issues
Files created in container are owned by root. To fix:
```bash
sudo chown -R $(whoami) output/
```

### Cache issues
```bash
# Clear all cached builds
docker volume rm docker_kicad-build-cache

# Or clear specific stamps inside container
./docker/shell.sh
rm /workspace/build-wasm/stamps/*.stamp
```
