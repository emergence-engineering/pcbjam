# KiCad Threading Analysis for WebAssembly Migration

> **See also:** [PTHREADS.md](./PTHREADS.md) for Emscripten pthreads implementation details.

## Executive Summary

KiCad relies **heavily** on multithreading for performance and UI responsiveness. Moving to single-threaded WASM will cause **significant performance degradation** in specific features, but the application will remain **functional**. The wxWidgets WASM layer already stubs out threading APIs, proving the approach is viable.

---

## 1. Threading Infrastructure Overview

### Core Thread Pool System
- **Implementation**: `BS::priority_thread_pool` (Barak Shoshany's library)
- **Location**: `kicad/include/thread_pool.h`, `kicad/thirdparty/thread-pool/bs_thread_pool.hpp`
- **Access**: Global `GetKiCadThreadPool()` function
- **Configuration**: Thread count via `ADVANCED_CFG::GetCfg().m_MaximumThreads`

### Synchronization Primitives Used
| Primitive | Usage Count | Purpose |
|-----------|-------------|---------|
| `std::mutex` | ~50+ files | Shared data protection |
| `std::atomic<T>` | 192 files | Lock-free counters/flags |
| `KISPINLOCK` | Core connectivity | Low-contention locking |
| `SYNC_QUEUE<T>` | PCM, tasks | Thread-safe queues |
| `std::condition_variable` | ~10 files | Thread signaling |

---

## 2. Features Using Threading (Impact Analysis)

### CRITICAL IMPACT (Will be noticeably slower)

#### DRC (Design Rule Check)
- **Files**: `pcbnew/drc/drc_test_provider_*.cpp` (10+ test providers)
- **Pattern**: `tp.submit_loop(0, items.size(), check_lambda)`
- **Why threads?**: Thousands of items, O(n²) clearance checks
- **Without threads**:
  - 4-8x slower (proportional to CPU cores)
  - UI freeze for 30 seconds to several minutes on large boards
  - **Workaround**: Must add progress reporting + time-slicing

#### Zone Filling
- **File**: `pcbnew/zone_filler.cpp` (lines 609-697)
- **Pattern**: Two-stage parallel queue (fill → tessellate)
- **Why threads?**: Complex polygon operations (Clipper library), GPU tessellation
- **Without threads**:
  - 5-30 second freeze per zone refill
  - **Workaround**: Chunked processing with progress callbacks

#### 3D Viewer Raytracing
- **File**: `3d-viewer/3d_rendering/raytracing/render_3d_raytrace_base.cpp`
- **Pattern**: Work-stealing with `atomic<size_t>` counter, screen divided into blocks
- **Why threads?**: Embarrassingly parallel (each pixel independent)
- **Without threads**:
  - 10-40 seconds per frame (unusable for interaction)
  - **Workaround**: Progressive rendering, lower resolution, skip raytracing in WASM

### MEDIUM IMPACT (Noticeable but manageable)

#### Library Loading (Symbols/Footprints)
- **Files**: `eeschema/libraries/symbol_library_adapter.cpp`, `pcbnew/footprint_library_adapter.cpp`
- **Pattern**: Low-priority background tasks (`BS::pr::lowest`)
- **Why threads?**: Hundreds of libraries, file I/O blocking
- **Without threads**:
  - 10+ second startup hang
  - **Workaround**: Progressive loading with Asyncify, show loading indicator

#### Connectivity Graph
- **Files**: `eeschema/connection_graph.cpp`, `pcbnew/connectivity/connectivity_algo.cpp`
- **Pattern**: `submit_loop()` for parallel subgraph updates
- **Why threads?**: Large schematics have thousands of connections
- **Without threads**:
  - 2-10 second lag on large schematics after edits
  - **Workaround**: Incremental updates, defer full recalculation

#### 3D Layer Creation
- **File**: `3d-viewer/3d_canvas/create_layer_items.cpp`
- **Pattern**: Per-layer mutexes, parallel zone processing
- **Without threads**: Slower initial 3D view load

### LOW IMPACT (Acceptable degradation)

| Feature | File | Impact |
|---------|------|--------|
| Font polling | `common/widgets/font_choice.cpp` | 30s poll just runs on main thread |
| Git status | `kicad/project_tree_pane.cpp` | Slower git operations |
| Update checker | `kicad/update_manager.cpp` | Blocks during check |
| PCM downloads | `kicad/pcm/pcm_task_manager.cpp` | Sequential downloads |
| Python plugins | `scripting/python_manager.cpp` | Slower plugin load |
| STEP export | `pcbnew/dialogs/dialog_export_step_process.cpp` | Blocking export |

---

## 3. Current WASM Threading Status

### wxWidgets WASM Layer (Already Implemented)

```
wxUSE_THREADS = 1  (API available, but stubbed)
```

**Pthread Shim** (`wxwidgets/include/wx/wasm/pthread.h`):
- `pthread_attr_getschedpolicy()` → no-op
- `pthread_attr_setschedparam()` → no-op
- `pthread_setschedparam()` → no-op
- `sched_get_priority_*()` → returns 0

**Event Loop** (`wxwidgets/src/wasm/evtloop.cpp`):
- Uses `emscripten_set_main_loop()` - browser's requestAnimationFrame
- Single-threaded cooperative scheduler
- ~16ms per frame at 60fps

### Proven Async Patterns

| Pattern | File | Status |
|---------|------|--------|
| Modal dialogs | `wxwidgets/src/wasm/dialog.cpp` | Working via Asyncify |
| Clipboard | `wxwidgets/src/wasm/clipbrd.cpp` | Working via Asyncify |
| Timers | `wxwidgets/src/wasm/timer.cpp` | Working via `emscripten_async_call` |

**Asyncify Configuration** (`tests/wasm-app/Makefile.wasm`):
```makefile
-sASYNCIFY=1
-sASYNCIFY_STACK_SIZE=8192
-sASYNCIFY_IMPORTS=['startModal','js_writeTextToClipboard',...]
```

---

## 4. Migration Strategies

### Option A: Sequential with Progress Feedback (Recommended for MVP)

**Approach**: Let all operations run sequentially, add progress UI

```cpp
#ifdef __EMSCRIPTEN__
    // Run sequentially with progress updates
    for (size_t i = 0; i < items.size(); i++) {
        checkItem(items[i]);
        if (i % 100 == 0) {
            reporter.SetCurrentProgress(i, items.size());
            emscripten_sleep(0);  // Yield to browser
        }
    }
#else
    // Original threaded code
    tp.submit_loop(0, items.size(), check_lambda);
#endif
```

**Pros**: Simple, predictable, works everywhere
**Cons**: Slower, UI shows "working" frequently

### Option B: Asyncify Time-Slicing

**Approach**: Break operations into 10-50ms chunks, yield between

```cpp
class TimeSlicedDRC {
    void RunChunk() {
        auto start = std::chrono::steady_clock::now();
        while (m_currentItem < m_items.size()) {
            checkItem(m_items[m_currentItem++]);
            if (elapsed(start) > 16ms) {  // One frame
                emscripten_async_call(RunChunk, this, 0);
                return;  // Yield to browser
            }
        }
        OnComplete();
    }
};
```

**Pros**: Responsive UI during long operations
**Cons**: More complex, requires state machine refactoring

### Option C: Web Workers (Heavy Operations Only)

**Approach**: Run DRC/Router in separate WASM instance

```javascript
// Main thread
const drcWorker = new Worker('kicad-drc-worker.js');
drcWorker.postMessage({ type: 'runDRC', boardData: serializedBoard });
drcWorker.onmessage = (e) => updateDRCResults(e.data);
```

**Pros**: True parallelism, responsive UI
**Cons**:
- Requires `SharedArrayBuffer` (security headers)
- Memory duplication (can't share pointers)
- Complex serialization/deserialization
- Separate WASM binary for worker

---

## 5. Severity Assessment

| Severity | Features | User Experience |
|----------|----------|-----------------|
| **Blocking** | None | KiCad will run |
| **Degraded** | DRC, Zone Fill, 3D Raytrace | Slower, may need UI changes |
| **Minor** | Library loading, connectivity | Slight delays |
| **Unaffected** | Most editing, viewing | Normal operation |

### What Users Will Notice

1. **DRC takes 4-8x longer** - Was 5 seconds, now 20-40 seconds
2. **Zone fills freeze UI** - Need progress indicator
3. **3D raytracing unusable** - Should default to OpenGL mode
4. **Startup slightly slower** - Library preloading blocks

### What Won't Change

- Schematic editing responsiveness
- PCB editing (non-DRC operations)
- File save/load (already uses Asyncify patterns)
- Symbol/footprint placement
- Most dialogs and UI interactions

---

## 6. Recommended Approach

### Phase 1: Stub Threading (Immediate)
- Ensure `GetKiCadThreadPool()` returns a functional single-threaded shim
- All `submit_loop()` calls execute sequentially
- All `submit_task()` calls execute immediately
- Remove mutex locks (single-threaded guarantee)

### Phase 2: Add Progress Reporting (Short-term)
- DRC: Report progress every N items, add cancel button
- Zone fill: Report per-zone progress
- Library loading: Show loading indicator

### Phase 3: Time-Slicing (If Needed)
- Only if Phase 2 results in unacceptable UI freezes
- Prioritize DRC and zone filling
- Use Asyncify + `emscripten_sleep(0)` pattern

### Phase 4: Web Workers (Future/Optional)
- Only if WASM threading becomes critical
- Would require significant architecture changes
- Consider for heavy features like autorouter

---

## 7. Key Files to Modify

| File | Change Required |
|------|-----------------|
| `kicad/include/thread_pool.h` | Add WASM single-threaded shim |
| `kicad/common/thread_pool.cpp` | Implement sequential fallback |
| `kicad/pcbnew/drc/drc_engine.cpp` | Add progress reporting for WASM |
| `kicad/pcbnew/zone_filler.cpp` | Add chunked processing option |
| `kicad/3d-viewer/3d_rendering/raytracing/render_3d_raytrace_base.cpp` | Disable raytracing or make progressive |

---

## 8. Conclusion

**Is threading a blocker for WASM?** No.

**Will it impact performance?** Yes, significantly for DRC, zone filling, and 3D raytracing.

**Is it manageable?** Yes, with proper progress reporting and potentially disabling raytracing.

The wxWidgets WASM port already proves that threading can be stubbed out. KiCad will run slower for certain operations but remain fully functional. The recommended approach is to start simple (sequential with progress feedback) and only add complexity (time-slicing, Web Workers) if user experience demands it.
