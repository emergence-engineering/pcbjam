# KiCad WASM Tool Activation Investigation

## Summary

This document explains the current investigation into why interactive PCB tools do not work correctly in the browser build of KiCad.

The visible symptom is simple:

- In native KiCad, clicking `Draw Lines` in the right toolbar leaves the tool selected, and two clicks on the board create a line.
- In the browser build, the tool does not remain selected, and board clicks do not start drawing.

The important conclusion so far is that this does **not** look like a normal KiCad tool-definition bug. The evidence points much lower in the stack, into the WebAssembly coroutine/runtime path used to emulate KiCad's native coroutine model in the browser.

## What "Working" Looks Like Natively

On macOS, Linux, and Windows, the flow for a tool like `Draw Lines` is roughly:

```text
User clicks right toolbar button
  -> wxAuiToolBar handles mouse up
  -> ACTION_TOOLBAR emits tool action
  -> TOOL_MANAGER activates the requested tool
  -> KiCad starts or resumes the tool coroutine
  -> User clicks board canvas
  -> GAL / canvas event is forwarded to the active tool
  -> Tool consumes the clicks and creates geometry
```

Two details matter here:

1. KiCad tools are not just plain event handlers. Many of them are coroutine-driven.
2. Native builds can rely on real low-level context switching and on the OS windowing system for input routing.

## Core Concepts

### `wxAuiToolBar`

KiCad's right-side drawing toolbar is an AUI toolbar, not a plain `wxToolBar`. That matters because its rendering, hit-testing, and state transitions go through a different path than the simpler wxWidgets toolbar tests.

### `ACTION_TOOLBAR` and `TOOL_MANAGER`

The toolbar does not draw lines by itself. Clicking a button activates a named KiCad action, and the tool manager is responsible for making the corresponding interactive tool current.

### KiCad coroutines

Interactive tools in KiCad depend on coroutine-style control flow. On native platforms this is implemented with `libcontext`, specifically `make_fcontext()` and `jump_fcontext()`.

### `wxGLCanvas` / `WEBGL_GAL`

Once a tool is active, board clicks are handled through KiCad's graphics/input path. In the browser build that path includes a DOM canvas, wxWidgets' WASM port, and KiCad's WebGL GAL layer.

### Emscripten fibers and Asyncify

WebAssembly in the browser cannot perform the same kind of native stack switching that desktop KiCad uses. Our port therefore has to emulate it with:

- Emscripten fibers
- Asyncify
- generated JavaScript glue around fiber switches

That emulation layer is the main place where the browser build can diverge from the native behavior.

## Native Data Flow

The native path is conceptually:

```text
OS mouse event
  -> wxWidgets window / child-window dispatch
  -> wxAuiToolBar::OnLeftUp()
  -> ACTION_TOOLBAR
  -> TOOL_MANAGER
  -> libcontext coroutine switch
  -> active KiCad tool
  -> board clicks routed to the tool
  -> drawing result appears
```

The key point is that native `libcontext` performs real context switching, and the OS owns the final event routing between the toolbar area and the graphics canvas.

## Browser/WASM Data Flow

The browser path has more moving parts:

```text
Browser pointer event
  -> generated wx.js / WASM event bridge
  -> wxWidgets WASM windowing layer
  -> wxAuiToolBar or wxGLCanvas target
  -> KiCad action dispatch
  -> Emscripten fiber switch
  -> Asyncify suspend/resume bookkeeping
  -> KiCad tool coroutine body
  -> WebGL canvas input handling
  -> drawing result appears
```

This means the browser build must get all of the following correct at the same time:

- AUI toolbar hit-testing
- tool activation
- coroutine entry
- coroutine completion / return
- WebGL canvas event forwarding

If any one of those layers is wrong, the tool appears to "not work".

## What We Observed

At first glance the problem looked like a toolbar-state problem:

- the `Draw Lines` button did not stay selected
- clicking the board did nothing

However, once we added a proper E2E test with logging and delayed screenshots, the picture became clearer:

1. The button state alone was not enough to diagnose the problem.
   An immediate screenshot can capture hover or pressed state, not true persistent selection.
2. After we added explicit `checked`-state tracking and a short delay, it became clear that the tool was still not truly active.
3. The deeper failure was not simply "the toolbar forgot its checked state".

## The First Real Root Cause We Found

The first concrete bug was in generated JavaScript around Asyncify fiber switching.

In the generated KiCad JS, the fiber entry callback in `Fibers.finishContextSwitch()` had effectively become a no-op:

```text
(a1 => {})(userData);
```

That means the code switched into the new fiber, but then did not actually call the tool coroutine entry function.

### Why this matters

If the entry callback is replaced by an empty function, the tool activation path can appear to run, but the coroutine body never really starts. From the outside, that looks like:

- the toolbar click "does something"
- but the tool never becomes truly active
- board clicks are ignored because there is no running interactive tool waiting for them

## Change 1: Fix the generated fiber entry callback

We added a new fix in [inject-dyncall-shims.sh](/Users/V/IdeaProjects/kicad-wasm/scripts/common/inject-dyncall-shims.sh) so the generated JS is patched to call the real entry function:

```text
dynCall_vi(entryPoint, userData);
```

### Reasoning

This is a good change because it fixes an objectively broken generated code path at the WASM/JS boundary. It is not a KiCad workaround.

## Change 2: Tell Asyncify that fiber swaps are suspension points

We updated [apply-asyncify.sh](/Users/V/IdeaProjects/kicad-wasm/scripts/common/apply-asyncify.sh) so `env.emscripten_fiber_swap` is included in `ASYNCIFY_IMPORTS`.

### Reasoning

Asyncify needs to know which imports can suspend or unwind control flow. Fiber swaps are exactly that kind of boundary. If Asyncify does not model them correctly, the call stack bookkeeping around coroutine switches becomes unreliable.

This is also a WASM-layer fix, not a KiCad UI workaround.

## What Happened After Those Changes

Those two changes moved the investigation forward, but they did not finish the problem.

After the JS callback fix, the logs started showing that the fiber entry code was actually being reached:

```text
[WASM_FCONTEXT] make
[WASM_FCONTEXT] swap
[WASM_FCONTEXT] entry
```

That is an important result. It means:

- the original "entry callback is a no-op" bug was real
- we did fix it
- but another problem exists after fiber entry

## The Current Deeper Problem

After the fiber starts, the startup sequence still stalls before PCBnew fully finishes bringing up the toolbars.

The clearest evidence comes from the E2E log at:

[pcbnew-spec-ts-pcbnew-wasm-select-draw-lines-and-draw-on-the-board.log](/Users/V/IdeaProjects/kicad-wasm/tests/logs/kicad/pcbnew/pcbnew-spec-ts-pcbnew-wasm-select-draw-lines-and-draw-on-the-board.log)

The rendered-element summary currently ends up as:

```text
{"count":13,"byType":{"sash":2,"searchctrl":3,"searchbutton":4,"auipart":4},"tools":[]}
```

That means the browser-side registry can see some UI pieces, but **no rendered toolbar tools at all**.

So the current failure is no longer best described as "the Draw Lines tool unchecks itself". The stronger diagnosis is:

- PCBnew startup is being interrupted
- the AUI toolbars never fully come online
- the tool registry is therefore empty
- the test cannot even reach a stable active-tool state

## Why Native KiCad Works But Browser KiCad Does Not

Native KiCad works because two hard problems are already solved by the native platform stack:

1. `libcontext` can use real native context switching semantics.
2. The operating system handles input routing across the real window hierarchy.

The browser build does not get either of those for free.

Instead, it must emulate them with:

- generated JS glue
- Asyncify instrumentation
- Emscripten fibers
- a DOM canvas and WebGL canvas bridge

So the browser failure is not evidence that KiCad's tool logic is broken. It is evidence that our WASM adaptation layer is still incomplete.

## Why Existing wxWidgets Tests Can Still Look Fine

This issue can exist even if many wxWidgets tests look correct.

The reason is that the failing KiCad path is more complex than a normal wx control interaction:

- KiCad uses `wxAuiToolBar`, not only basic controls
- KiCad tool activation goes through `ACTION_TOOLBAR` and `TOOL_MANAGER`
- KiCad drawing tools depend on coroutine switching
- the board uses a separate WebGL-backed canvas/input path

Most simple wxWidgets tests do not exercise that exact combination.

## What We Changed During The Investigation

The current working tree contains a mix of real fixes, testing support, and experiments.

### Changes that look fundamentally correct

| Layer | File | Purpose | Why it makes sense |
|------|------|---------|--------------------|
| Build/WASM glue | [scripts/common/inject-dyncall-shims.sh](/Users/V/IdeaProjects/kicad-wasm/scripts/common/inject-dyncall-shims.sh) | Fix empty fiber entry callback in generated JS | Repairs objectively broken generated code |
| Build/WASM glue | [scripts/common/apply-asyncify.sh](/Users/V/IdeaProjects/kicad-wasm/scripts/common/apply-asyncify.sh) | Add `env.emscripten_fiber_swap` to Asyncify imports | Makes Asyncify aware of fiber-switch suspension points |
| Test support | [tests/e2e/utils/element-tracker.ts](/Users/V/IdeaProjects/kicad-wasm/tests/e2e/utils/element-tracker.ts) | Track `checked` state | Lets the test distinguish hover/pressed from real selection |
| Test support | [tests/kicad/pcbnew.spec.ts](/Users/V/IdeaProjects/kicad-wasm/tests/kicad/pcbnew.spec.ts) | Add tool-selection/drawing regression and log capture | Reproduces the bug through the real KiCad flow |
| Test observability | [wxwidgets/src/aui/auibar.cpp](/Users/V/IdeaProjects/kicad-wasm/wxwidgets/src/aui/auibar.cpp) | Export rendered AUI tool items to the browser registry | Gives Playwright a reliable way to see KiCad AUI tools |

### Changes that are investigative, not final

| Layer | File | Purpose | Current assessment |
|------|------|---------|--------------------|
| KiCad WebGL input | [kicad/common/gal/webgl/webgl_gal.cpp](/Users/V/IdeaProjects/kicad-wasm/kicad/common/gal/webgl/webgl_gal.cpp) | Forward mouse events immediately on WASM instead of posting them | Useful experiment, but not yet proven to be the main fix |
| KiCad startup | [kicad/pcbnew/pcb_edit_frame.cpp](/Users/V/IdeaProjects/kicad-wasm/kicad/pcbnew/pcb_edit_frame.cpp) | Skip auto-invoking the selection tool on WASM | Pure debugging aid to see whether startup tool activation was the blocker |
| KiCad third-party porting layer | [kicad/thirdparty/libcontext/libcontext.cpp](/Users/V/IdeaProjects/kicad-wasm/kicad/thirdparty/libcontext/libcontext.cpp) | Experimental Emscripten-fiber implementation of `libcontext` | Likely the right conceptual layer, but the current implementation is not clean/final |

### Changes that are not meaningful

| File | Note |
|------|------|
| [kicad/common/tool/action_toolbar.cpp](/Users/V/IdeaProjects/kicad-wasm/kicad/common/tool/action_toolbar.cpp) | Trailing newline / formatting-only diff |
| [kicad/common/tool/tools_holder.cpp](/Users/V/IdeaProjects/kicad-wasm/kicad/common/tool/tools_holder.cpp) | Trailing newline / formatting-only diff |
| [wxwidgets/build/wasm/wx.js](/Users/V/IdeaProjects/kicad-wasm/wxwidgets/build/wasm/wx.js) | Generated build artifact, not a source-level design change |

## Why the Current `libcontext` Work Is Still Not "Done"

The current experiments in [libcontext.cpp](/Users/V/IdeaProjects/kicad-wasm/kicad/thirdparty/libcontext/libcontext.cpp) show that we can start a fiber, but not yet return from it with semantics that match what KiCad expects from native `jump_fcontext()`.

The native contract is subtle:

- one context transfers control to another
- control can later resume into the previous context
- returned values and ownership of "who resumes whom" must remain consistent
- cleanup of a finished coroutine must not break the surrounding frame startup

In the browser build, once the first startup coroutine finishes, that handoff is still wrong. The result is not necessarily an immediate crash anymore, but the UI startup is interrupted before the toolbars are fully present.

## Current Best Explanation

The current best explanation is:

1. A toolbar click is not the primary problem.
2. The browser port originally had a broken fiber entry callback, which prevented tool coroutines from starting at all.
3. After fixing that, the browser port still mishandles coroutine completion / return.
4. That deeper runtime mismatch interrupts PCBnew startup before the AUI tools fully appear.
5. Because the tools are not fully rendered and the interactive-tool runtime is not stable, the right-side drawing tools do not remain active and board clicks do not draw.

## Clean Direction From Here

The cleanest direction is to keep the fix low in the WASM/runtime layer and avoid papering over the issue in KiCad UI code.

Recommended direction:

1. Keep the JS fiber-entry fix in [inject-dyncall-shims.sh](/Users/V/IdeaProjects/kicad-wasm/scripts/common/inject-dyncall-shims.sh).
2. Keep the Asyncify import fix in [apply-asyncify.sh](/Users/V/IdeaProjects/kicad-wasm/scripts/common/apply-asyncify.sh).
3. Move the `libcontext` solution toward the dedicated WASM layer under [wasm/libcontext](/Users/V/IdeaProjects/kicad-wasm/wasm/libcontext) instead of continuing to patch KiCad's bundled third-party copy in ad hoc ways.
4. Remove temporary KiCad startup and input experiments once the lower-layer coroutine behavior is correct.
5. Keep the AUI rendered-tool export only if we still want browser E2E tests to target KiCad tools by tooltip and checked state.

## Reproduction and Evidence

### Build and run

```bash
./docker/build.sh
cd tests
npm run test:kicad -- --grep "select draw lines"
```

### Where to look

- E2E spec:
  [pcbnew.spec.ts](/Users/V/IdeaProjects/kicad-wasm/tests/kicad/pcbnew.spec.ts)
- E2E logs:
  [tests/logs/kicad/pcbnew](/Users/V/IdeaProjects/kicad-wasm/tests/logs/kicad/pcbnew)
- Current startup screenshot:
  [wizard-00-initial.png](/Users/V/IdeaProjects/kicad-wasm/tests/test-results/wizard-00-initial.png)

## Bottom Line

The current evidence says the KiCad browser tool failure is fundamentally a WebAssembly coroutine/runtime problem.

The right fix direction is:

- not "change KiCad tool logic"
- not "hack the toolbar state"
- but "make the WASM coroutine and fiber handoff behave like native KiCad expects"

The two most defensible changes so far are the generated-JS fiber-entry fix and the Asyncify import update. Everything else should be treated as either observability support or investigation scaffolding until the underlying `libcontext` behavior is corrected.
