# Learning Notes

## Asyncify and Consecutive Modal Dialogs

### Problem
When multiple modal dialogs are triggered in quick succession, Asyncify operations can overlap causing crashes:
- "indirect call to null"
- "func is not a function"
- "index out of bounds"

### Root Cause
Per Emscripten docs: "It is not safe to start an async operation while another is already running."

When the first modal completes:
1. Asyncify begins rewinding the C++ stack
2. C++ code triggers second modal before rewind completes
3. Second modal's Asyncify operation conflicts with first modal's cleanup
4. Asyncify state corruption occurs

### Key Insight
**You cannot use ANY Asyncify mechanism to wait** - neither `EM_ASYNC_JS` await nor `emscripten_sleep()` - while another Asyncify operation is cleaning up. Both use Asyncify internally and cause the same conflict.

### Solution Pattern
1. Use a **global lock** to track when Asyncify is busy
2. Check lock with **synchronous JS** (`EM_JS`, not `EM_ASYNC_JS`) - this doesn't use Asyncify
3. If locked, **return immediately** instead of waiting
4. Release lock via **double setTimeout(0)** to ensure Asyncify fully completes before allowing new operations

```javascript
// Good: Synchronous check (no Asyncify)
EM_JS(int, isLocked, (), { return Module._locked ? 1 : 0; });

// Bad: This uses Asyncify and will cause conflicts
while (isLocked()) {
    emscripten_sleep(10);  // Uses Asyncify!
}
```

### File Reference
`wxwidgets/src/wasm/dialog.cpp` - Modal implementation with lock mechanism
