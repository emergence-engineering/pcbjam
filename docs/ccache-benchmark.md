# ccache Build Performance Benchmark

Testing build times before and after adding ccache to measure the impact.

## Test Environment
- Machine: Apple Silicon (M4 Max)
- Docker resources: 10 CPUs, 32GB RAM
- Build command: `./docker/build.sh` (defaults to incremental build)

## Results

### Step 1: Baseline (before ccache)
Command: `./docker/build.sh --skip-deps` (forces KiCad rebuild, old default)
**Time: 7:34.93** (7 min 35 sec)

### Step 2: First build with ccache (populating cache)
Command: `./docker/build.sh --skip-deps` (old default)
**Time: 9:35.52** (9 min 35 sec)
Note: Slower than baseline due to ccache overhead when populating cache
Cache stats: 1335 misses, 0 hits, 1.39GB cached

### Step 3: Single KiCad file change (incremental build)
Changed: `kicad/pcbnew/board.cpp` (added one line)
Command: `./docker/build.sh` (new incremental default)
**Time: 1:45.97** (1 min 46 sec)
- Only `board.cpp` recompiled
- Rest of compilation: instant (CMake detected no changes)
- Most time spent on post-processing (asyncify ~1 min)
- ccache hit rate: 25% (some preprocessed source matched)

### Step 4: wxWidgets incremental build baseline (configure ran)
Command: `./docker/build.sh` (after implementing skip-configure logic)
**Time: 7:43.87** (7 min 44 sec)
- First build after script changes, so configure ran
- This populates the wxWidgets build state for incremental builds

### Step 5: No-change rebuild (configure skipped)
Command: `./docker/build.sh` (no changes to any source files)
**Time: 1:31.13** (1 min 31 sec)
- wxWidgets configure skipped (Makefile exists, configure.in unchanged)
- wxWidgets make: instant (nothing to rebuild)
- KiCad CMake/make: instant (nothing changed)
- All time spent on post-processing (asyncify ~1 min)

### Step 6: Single wxWidgets file change (incremental build)
Changed: `wxwidgets/src/common/memory.cpp` (added one line)
Command: `./docker/build.sh`
**Time: 1:33.99** (1 min 34 sec)
- wxWidgets configure skipped
- Only `memory.cpp` recompiled, library re-archived
- KiCad links against updated wxWidgets
- Most time spent on post-processing (asyncify ~1 min)

## Summary

| Scenario | Before | After | Speedup |
|----------|--------|-------|---------|
| Full rebuild (baseline) | 7:35 | 9:35 | -27% (cache populating) |
| KiCad single file change | 7:35 | 1:46 | **4.3x faster** |
| wxWidgets single file change | ~7:35 | 1:34 | **4.8x faster** |
| No changes | ~7:35 | 1:31 | **5x faster** |

**Note**: Asyncify post-processing takes ~1 min and runs every build. This is the irreducible minimum build time.
