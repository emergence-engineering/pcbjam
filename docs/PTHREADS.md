# Emscripten pthreads for KiCad WASM

## Overview

Emscripten can compile C++ threading code to WebAssembly using Web Workers and SharedArrayBuffer. This allows KiCad's existing `BS::thread_pool` code to work **unchanged** in the browser.

## How It Works

```
┌──────────────────────────────────────────────────────────────┐
│                    Browser Environment                        │
│                                                              │
│   ┌────────────────────────────────────────────────────┐    │
│   │           SharedArrayBuffer (Shared Memory)         │    │
│   │                                                     │    │
│   │  ┌─────────┐  ┌─────────┐  ┌─────────┐            │    │
│   │  │  Main   │  │ Worker  │  │ Worker  │   ...      │    │
│   │  │ Thread  │  │ Thread  │  │ Thread  │            │    │
│   │  │         │  │         │  │         │            │    │
│   │  │ BOARD*  │  │ BOARD*  │  │ BOARD*  │            │    │
│   │  │ (same!) │  │ (same!) │  │ (same!) │            │    │
│   │  └─────────┘  └─────────┘  └─────────┘            │    │
│   └────────────────────────────────────────────────────┘    │
│                                                              │
│   All threads share memory - C++ pointers work normally      │
└──────────────────────────────────────────────────────────────┘
```

Emscripten:
1. Creates Web Workers for each pthread
2. Uses SharedArrayBuffer for shared memory between workers
3. Implements pthread synchronization primitives (mutex, condition variables)
4. Existing C++ thread code compiles without modification

## Build Configuration

### Minimal Flags

```bash
emcc main.cpp -o app.js \
    -pthread \
    -sPROXY_TO_PTHREAD=1
```

### Recommended Full Configuration

```bash
emcc main.cpp -o app.js \
    -pthread \
    -sPROXY_TO_PTHREAD=1 \
    -sPTHREAD_POOL_SIZE="Math.min(navigator.hardwareConcurrency, 8)" \
    -sALLOW_BLOCKING_ON_MAIN_THREAD=0 \
    -sOFFSCREENCANVAS_SUPPORT=1 \
    -sOFFSCREEN_FRAMEBUFFER=1 \
    -sMALLOC=mimalloc \
    -sINITIAL_MEMORY=512MB \
    -sSTACK_SIZE=5MB \
    -sPTHREAD_POOL_SIZE_STRICT=0
```

### Flag Explanations

| Flag | Purpose |
|------|---------|
| `-pthread` | Enable pthread support (required) |
| `-sPROXY_TO_PTHREAD=1` | Move main() to worker thread, keeps browser responsive |
| `-sPTHREAD_POOL_SIZE=N` | Pre-create N worker threads (avoids async creation delay) |
| `-sALLOW_BLOCKING_ON_MAIN_THREAD=0` | Error if main thread blocks (catches bugs) |
| `-sOFFSCREENCANVAS_SUPPORT=1` | WebGL rendering in worker threads |
| `-sOFFSCREEN_FRAMEBUFFER=1` | Fallback if OffscreenCanvas unavailable |
| `-sMALLOC=mimalloc` | Better allocator for multithreaded code |
| `-sPTHREAD_POOL_SIZE_STRICT=0` | Allow pool to grow beyond initial size |

### Dynamic Thread Pool Size

Use JavaScript expression for dynamic sizing:
```bash
-sPTHREAD_POOL_SIZE="Math.min(navigator.hardwareConcurrency, 8)"
```

This creates threads based on available CPU cores (max 8).

## Required HTTP Headers

**CRITICAL**: SharedArrayBuffer requires these headers or it won't be available.

```http
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

### Server Configuration Examples

**Nginx:**
```nginx
location / {
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
}
```

**Apache (.htaccess):**
```apache
Header set Cross-Origin-Embedder-Policy "require-corp"
Header set Cross-Origin-Opener-Policy "same-origin"
```

**Express.js:**
```javascript
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
});
```

**Vercel (vercel.json):**
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" },
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" }
      ]
    }
  ]
}
```

**CloudFlare Pages (_headers):**
```
/*
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Opener-Policy: same-origin
```

## Browser Support

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 92+ | ✅ Full support |
| Firefox | 79+ | ✅ Full support |
| Safari | 16.4+ | ✅ Full support |
| Edge | 92+ | ✅ Full support (Chromium) |

All modern browsers support SharedArrayBuffer with proper headers.

## Feature Detection

Check if threading is available at runtime:

```javascript
function checkThreadingSupport() {
    const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
    const isCrossOriginIsolated = crossOriginIsolated;

    console.log('SharedArrayBuffer available:', hasSharedArrayBuffer);
    console.log('Cross-origin isolated:', isCrossOriginIsolated);

    if (!hasSharedArrayBuffer) {
        console.error('SharedArrayBuffer not available - check HTTPS');
    }
    if (!isCrossOriginIsolated) {
        console.error('Not cross-origin isolated - check COOP/COEP headers');
    }

    return hasSharedArrayBuffer && isCrossOriginIsolated;
}
```

## PROXY_TO_PTHREAD Explained

Without `PROXY_TO_PTHREAD`:
- main() runs on browser's main thread
- Any blocking call (mutex, sleep, join) freezes the browser
- User can't interact while computation runs

With `PROXY_TO_PTHREAD`:
- Emscripten creates a new main() that spawns a worker
- Your original main() runs entirely in that worker
- Browser main thread stays responsive
- Blocking calls work normally

**Always use PROXY_TO_PTHREAD for applications with UI.**

## Memory Considerations

Each worker thread loads:
- Complete JavaScript glue code
- Complete WASM module

Memory usage scales with thread count:
- 2 threads: ~200MB typical
- 8 threads: ~400MB typical
- 20 threads: ~600MB+ typical

Keep thread pool size reasonable (4-8 threads recommended).

## Debugging

### Check if pthreads are working

```cpp
#include <emscripten/threading.h>
#include <thread>

int main() {
    printf("Main thread: %d\n", emscripten_is_main_runtime_thread());
    printf("Hardware concurrency: %d\n", std::thread::hardware_concurrency());

    std::thread t([]() {
        printf("Worker thread: %d\n", emscripten_is_main_runtime_thread());
    });
    t.join();

    return 0;
}
```

### Common Issues

**"SharedArrayBuffer is not defined"**
- Missing COOP/COEP headers
- Not served over HTTPS (except localhost)

**"pthread_create failed"**
- Thread pool exhausted, increase PTHREAD_POOL_SIZE
- Or use PTHREAD_POOL_SIZE_STRICT=0 to allow growth

**Browser hangs/freezes**
- Missing PROXY_TO_PTHREAD flag
- Blocking on main thread

**Memory errors**
- Increase INITIAL_MEMORY
- Increase STACK_SIZE (each thread needs stack space)

## Comparison with Alternatives

| Approach | KiCad Changes | Deployment | Performance |
|----------|---------------|------------|-------------|
| **Emscripten pthreads** | None | Needs headers | Best |
| Synchronous stub | None (stub only) | Works everywhere | Slowest |
| Manual Web Workers | Significant | Works everywhere | Good |

## KiCad-Specific Notes

KiCad uses `BS::thread_pool` (Barak Shoshany's thread pool):
- Location: `kicad/thirdparty/thread-pool/bs_thread_pool.hpp`
- Uses standard C++ threads internally
- Works unchanged with Emscripten pthreads

Heavy threading usage in:
- DRC (Design Rule Check) - `pcbnew/drc/`
- Zone filling - `pcbnew/zone_filler.cpp`
- 3D raytracing - `3d-viewer/3d_rendering/raytracing/`
- Library loading - background tasks

With pthreads enabled, all these run in parallel as they do natively.

## Hosting Compatibility

| Host | Headers Configurable | pthreads Work |
|------|---------------------|---------------|
| GitHub Pages | ❌ No | ❌ No |
| Netlify Free | ❌ No | ❌ No |
| Netlify Pro | ✅ Yes | ✅ Yes |
| Vercel | ✅ Yes | ✅ Yes |
| CloudFlare Pages | ✅ Yes | ✅ Yes |
| AWS S3 + CloudFront | ✅ Yes | ✅ Yes |
| Your own server | ✅ Yes | ✅ Yes |
| localhost | ✅ N/A | ✅ Yes |

## Quick Start

1. **Add build flags:**
```bash
-pthread -sPROXY_TO_PTHREAD=1 -sPTHREAD_POOL_SIZE=4
```

2. **Configure server headers:**
```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

3. **Test in browser:**
```javascript
console.log('Threading:', crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined');
```

4. **Done.** Existing C++ threading code works.

## References

- [Emscripten pthreads documentation](https://emscripten.org/docs/porting/pthreads.html)
- [MDN SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
- [Chrome SharedArrayBuffer update](https://developer.chrome.com/blog/enabling-shared-array-buffer)
- [web.dev WebAssembly threads guide](https://web.dev/articles/webassembly-threads)