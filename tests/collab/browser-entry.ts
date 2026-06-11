// Browser bundle entry for the collab e2e: bundles the generic reconciler + Yjs +
// BroadcastChannel transport (from the web standalone editor) into a single IIFE
// that the pl_editor static harness page can load via <script>. esbuild resolves
// `yjs` from tests/node_modules.
//
// Build: npm run build:collab  (tests/)  → tests/apps/kicad/collab-bundle.js
import {
  startCollab,
  type CollabModule,
  type CollabWindow,
} from "../../web/standalone/src/wasm/collab/index";

// The e2e harness API predates the provider abstraction: specs pass a flat
// { channel, settleMs }. Translate to startCollab's ProviderConfig form here so
// the spec/harness callsites stay stable across web-side API evolution.
function start(
  mod: CollabModule,
  win: CollabWindow,
  // Same opts as startCollab itself (ysync 0004: { provider, room }).
        opts: Parameters<typeof startCollab>[2],
): ReturnType<typeof startCollab> {
  return startCollab(mod, win, {
    provider: { kind: "broadcastchannel", settleMs: opts.settleMs },
    room: opts.room,
  });
}

declare global {
  interface Window {
    KicadCollab?: { start: typeof start };
  }
}

window.KicadCollab = { start };
