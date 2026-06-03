// Wire contract shared with the C++ bridge (wasm/bindings/pl_editor_embind.cpp).
// Schema-agnostic by design: an item is just { id, type, …arbitrary fields }. The
// reconciler hardcodes no field names — it diffs values keyed by field name.

export type CollabItem = {
  id: string;
  type: string;
  [field: string]: unknown;
};

export type CollabDelta = {
  added: CollabItem[];
  changed: CollabItem[];
  removed: string[]; // uuids
};

/**
 * The two C++ bridge entry points + the emit hook, abstracted so the reconciler is
 * testable without a real wasm Module. In the browser these map to:
 *   snapshot() -> Module.kicadCollabSnapshot()
 *   apply(d)   -> Module.kicadCollabApply(d)
 *   onDelta(cb): set window.kicadCollab = { onDelta: cb }
 */
export interface CollabBridge {
  snapshot(): string;
  apply(deltaJson: string): void;
  onDelta(cb: (deltaJson: string) => void): void;
}

export function emptyDelta(): CollabDelta {
  return { added: [], changed: [], removed: [] };
}

export function isEmptyDelta(d: CollabDelta): boolean {
  return d.added.length === 0 && d.changed.length === 0 && d.removed.length === 0;
}
