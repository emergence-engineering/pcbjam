// === Asyncify / fiber / modal diagnostics (LOGGING ONLY — no behavior change) ===
//
// Injected only when inject-dyncall-shims.sh runs with SHIM_DIAGNOSTICS=1.
// Observability for the Chrome/V8 renderer crash on the first coroutine resume
// (the main-context Asyncify rewind). Does NOT swallow or alter any call — it
// logs and traces, then delegates, so the real crash still happens and can be
// observed right up to the faulting point.
(function() {
  var modalActive = false;
  var tableLen = function() { return (typeof wasmTable !== "undefined" && wasmTable) ? wasmTable.length : -1; };
  var asyncState = function() { return (typeof Asyncify !== "undefined") ? Asyncify.state : "N/A"; };

  // 1. Timer scheduling — flag function pointers already out of bounds at schedule time.
  if (typeof _emscripten_async_call !== "undefined") {
    var __origAsyncCall = _emscripten_async_call;
    _emscripten_async_call = function(func, arg, millis) {
      var inBounds = func >= 0 && func < tableLen();
      console.warn("[DIAG_ASYNC_CALL] func=" + func + " arg=" + arg + " millis=" + millis +
                   " inBounds=" + inBounds + " modalActive=" + modalActive + " state=" + asyncState());
      if (!inBounds) { console.error("[DIAG_ASYNC_CALL] OUT OF BOUNDS at schedule time! func=" + func); console.trace(); }
      return __origAsyncCall(func, arg, millis);
    };
  }

  // 2. Rewind target selection — which export Asyncify will re-enter on rewind.
  if (typeof Asyncify !== "undefined" && Asyncify.setDataRewindFunc) {
    var __origSetRewind = Asyncify.setDataRewindFunc.bind(Asyncify);
    Asyncify.setDataRewindFunc = function(ptr, forced) {
      console.warn("[DIAG_REWIND_FUNC] ptr=" + ptr + " forced=" + forced + " state=" + Asyncify.state +
                   " modalActive=" + modalActive + " callStack=" + JSON.stringify(Asyncify.exportCallStack));
      return __origSetRewind(ptr, forced);
    };
  }

  // 3. doRewind — the actual rewind that crashes V8. Log the buffer + saved rewind id
  //    immediately before re-entering wasm, so the last line before the crash names it.
  if (typeof Asyncify !== "undefined" && typeof Asyncify.doRewind === "function") {
    var __origDoRewind = Asyncify.doRewind.bind(Asyncify);
    Asyncify.doRewind = function(ptr) {
      var rewindId = -1;
      try { rewindId = (typeof GROWABLE_HEAP_I32 === "function") ? GROWABLE_HEAP_I32()[((ptr + 8) >> 2)] : HEAP32[((ptr + 8) >> 2)]; } catch (e) {}
      console.warn("[DIAG_DOREWIND] ptr=" + ptr + " rewindId=" + rewindId + " state=" + asyncState() +
                   " modalActive=" + modalActive + " — re-entering wasm now");
      return __origDoRewind(ptr);
    };
  }

  // 4. dynCall_vi — log (and trace) out-of-bounds pointers but DO NOT swallow; call through.
  if (typeof dynCall_vi === "function") {
    var __origDynCallVi = dynCall_vi;
    dynCall_vi = function(index, a0) {
      if (index < 0 || index >= tableLen()) {
        console.error("[DIAG_DYNCALL_VI] OUT OF BOUNDS index=" + index + " tableLen=" + tableLen() +
                      " modalActive=" + modalActive + " state=" + asyncState());
        console.trace();
      }
      return __origDynCallVi(index, a0);
    };
  }

  // 5. Modal lifecycle (startModal sets Module._endModal; detect appear/disappear).
  if (typeof Module !== "undefined") {
    var seen = false;
    setInterval(function() {
      if (Module._endModal && !seen) {
        seen = true; modalActive = true;
        console.warn("[DIAG_MODAL] modal started, state=" + asyncState());
        var __origEnd = Module._endModal;
        Module._endModal = function(code) {
          console.warn("[DIAG_MODAL] EndModal code=" + code + " state=" + asyncState());
          modalActive = false;
          return __origEnd(code);
        };
      } else if (!Module._endModal && seen) {
        seen = false;
        console.warn("[DIAG_MODAL] modal cleanup, state=" + asyncState());
      }
    }, 100);
  }

  // 6. EM_ASYNC_JS sleeps (startModal, js_enumerateFonts, clipboard, etc.) — log
  //    enter/wake so we can see whether an async sleep is NESTED with a fiber swap
  //    at the crash (the #9153 collision). Logging only; delegates unchanged.
  if (typeof Asyncify !== "undefined" && typeof Asyncify.handleSleep === "function") {
    var __diagOrigHandleSleep = Asyncify.handleSleep.bind(Asyncify);
    var diagSleepId = 0;
    Asyncify.handleSleep = function(startAsync) {
      var id = ++diagSleepId;
      console.warn("[DIAG_SLEEP] ENTER id=" + id + " state=" + asyncState() +
                   " currData=" + ((typeof Asyncify.currData !== "undefined" && Asyncify.currData) || "null"));
      return __diagOrigHandleSleep(function(wakeUp) {
        return startAsync(function(result) {
          console.warn("[DIAG_SLEEP] WAKE id=" + id + " state=" + asyncState() +
                       " currData=" + ((typeof Asyncify.currData !== "undefined" && Asyncify.currData) || "null"));
          return wakeUp(result);
        });
      });
    };
  }

  console.warn("[DIAG] Asyncify/fiber/modal diagnostics installed (logging only)");
})();
// === End diagnostics ===
