# 03 — Config, not code

> Several `#ifdef __EMSCRIPTEN__` patches re-implement, in C++, behavior that KiCad already
> exposes as a runtime setting or a CMake cache variable. Replacing the patch with a shipped
> config file (or a `-D`) gives identical behavior, removes the source edit, and keeps the
> knob user-changeable.

## 1. Zoom-to-cursor → `input.center_on_zoom`

**Patch today:** `common/view/wx_view_controls.cpp` (+9) and part of
`common/draw_panel_gal.cpp` force `m_warpCursor = false` under `__EMSCRIPTEN__` (browsers
can't warp the OS pointer, so center-on-zoom is wrong; zoom-to-cursor is correct).

**But this is already a user preference.** `common/settings/common_settings.cpp:228` defines
`PARAM<bool>("input.center_on_zoom", …, true)` (the "Center and warp cursor on zoom"
checkbox in Mouse & Touchpad). The two lines the fork patched are *exactly* the consumption
sites: `wx_view_controls.cpp:172` and `draw_panel_gal.cpp:712`. The wheel handler already
implements point-under-cursor-stays-fixed when the pref is false.

**Do instead:** seed the browser FS with a first-run `kicad_common.json` containing
`"input": { "center_on_zoom": false }`. Covers both sites, stays toggleable. Belt-and-
suspenders: the wasm kiplatform `WarpPointer()` should return `false` — callers
(`wx_view_controls.cpp:342,972`) already handle that gracefully, so even if a user re-enables
the pref it degrades, not breaks. Removes 2 source patches.

## 2. Backspace-deletes → default `user.hotkeys`

**Patch today:** `common/tool/actions.cpp` (+7) adds `DefaultHotkeyAlt(WXK_BACK)` to the
delete action under `__EMSCRIPTEN__` so Mac-browser users' Backspace deletes.

**Do instead:** ship a default `user.hotkeys` file in the FS image mapping both
Delete and Backspace to the delete action — pure runtime config.

> ⚠️ The companion change in `common/tool/action_manager.cpp` (+5) is **not** config — it's a
> genuine upstream bug fix (`m_defaultHotKeyAlt` is never applied, so `DefaultHotkeyAlt()` is
> dead upstream in default configs). That one belongs in [06](06-upstreamable-patches.md),
> and the default-`user.hotkeys` route only needs it for the *default*-alt path; an explicit
> user-hotkeys mapping works without it.

## 3. Profile timer → `HAVE_CLOCK_GETTIME`

**Patch today:** `libs/core/profile.cpp` (+9) adds an `#elif defined(__EMSCRIPTEN__)`
branch to `GetRunningMicroSecs()` using `emscripten_get_now()`. The existing upstream
branches gate on the configure-time macros `HAVE_CLOCK_GETTIME` / `HAVE_GETTIMEOFDAY_FUNC`.

**Do instead:** Emscripten supports `clock_gettime`, so set `HAVE_CLOCK_GETTIME` in the wasm
CMake cache / toolchain and the existing branch compiles. Zero source change.

## 4. Static KIFACE startup → call `OnKifaceStart` from the shell

**Patch today:** `common/kiway.cpp` (+33) special-cases `KIWAY::KiFACE()` under
`__EMSCRIPTEN__`: it treats `m_kiface_version == 0` as "OnKifaceStart not yet called" and
either calls the statically-linked `KIFACE_GETTER` or backfills the version for a
pre-`set_kiface()`'d face, then calls `OnKifaceStart`.

**Do instead:** the fork controls startup, so the wasm shell can call
`kiface->OnKifaceStart(&Pgm(), ctl, &kiway)` itself at its `set_kiface()` call site. Then
upstream's existing `if(m_kiface[aFaceId]) return m_kiface[aFaceId];` early-return path works
unmodified, and the single static `KIFACE_GETTER` fallback also lives in the shell. Removes
the 33-line in-source block.

## 5. Keep the scripting member unconditional

`include/pgm_base.h` (+2) wraps `std::unique_ptr<SCRIPTING> m_python_scripting` in
`#ifdef KICAD_SCRIPTING`. A `unique_ptr` to a forward-declared type compiles without the
full header and is simply never populated when scripting is off — so the member can stay
unconditional and the header reverts. (The `.cpp` creation site in `common/pgm_base.cpp`
still needs its guard; that's part of the coherent scripting-optional patch in
[05](05-wx-layer-fixes.md)/[06](06-upstreamable-patches.md), not this doc.)

## Net

| Patch | Replacement | Removes |
|---|---|---|
| `wx_view_controls.cpp`, `draw_panel_gal.cpp` warpCursor | `kicad_common.json` default | 2 sites |
| `actions.cpp` Backspace | default `user.hotkeys` | 1 site (+ see 06) |
| `profile.cpp` timer | `HAVE_CLOCK_GETTIME` cache var | 1 file |
| `kiway.cpp` static KIFACE | `OnKifaceStart` from shell | 33 lines |
| `pgm_base.h` member guard | unconditional `unique_ptr` | 1 header |

The config files live in the `wasm/` / `web/` layer — no upstream footprint.
