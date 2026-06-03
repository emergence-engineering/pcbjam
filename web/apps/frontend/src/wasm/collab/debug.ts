// Lightweight collab debug logging to the BROWSER DEVTOOLS console (not the in-app
// log panel). On by default while we bring the bridge up; silence with
// `window.__COLLAB_DEBUG = false` (or `localStorage.collabDebug = "0"`).
function on(): boolean {
  const w = window as unknown as { __COLLAB_DEBUG?: boolean };
  if (typeof w.__COLLAB_DEBUG === "boolean") return w.__COLLAB_DEBUG;
  try {
    if (localStorage.getItem("collabDebug") === "0") return false;
  } catch {
    /* ignore */
  }
  return true;
}

const STYLE = "color:#0bd;font-weight:bold";

export function clog(...args: unknown[]): void {
  if (on()) console.log("%c[collab]", STYLE, ...args);
}

export function cwarn(...args: unknown[]): void {
  if (on()) console.warn("%c[collab]", STYLE, ...args);
}
