// Browser bundle entry for the collab e2e: bundles the generic reconciler + Yjs +
// BroadcastChannel transport (from the web frontend) into a single IIFE that the
// pl_editor static harness page can load via <script>. esbuild resolves `yjs` from
// tests/node_modules.
//
// Build: npm run build:collab  (tests/)  → tests/apps/kicad/collab-bundle.js
import {
  startCollab,
  type CollabModule,
  type CollabWindow,
} from "../../web/apps/frontend/src/wasm/collab/index";

declare global {
  interface Window {
    KicadCollab?: {
      start: (
        mod: CollabModule,
        win: CollabWindow,
        opts: { channel: string; settleMs?: number },
      ) => ReturnType<typeof startCollab>;
    };
  }
}

window.KicadCollab = { start: startCollab };
