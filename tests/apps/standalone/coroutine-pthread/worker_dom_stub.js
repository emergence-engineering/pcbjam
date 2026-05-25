// pthread workers have no DOM, but wxWidgets' glue touches `document` at module-eval
// (e.g. document.getElementById("window-container") in the wxNonOwnedWindow code), which
// throws "document is not defined" in every worker. Provide a no-op document stub when it
// is undefined so workers initialize; the real DOM work still runs on the main thread.
if (typeof document === 'undefined') {
  var __noopEl = {
    style: {},
    getContext: function () { return null; },
    appendChild: function () {},
    setAttribute: function () {},
    addEventListener: function () {},
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 0, height: 0 }; },
  };
  globalThis.document = {
    getElementById: function () { return null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    createElement: function () { return __noopEl; },
    body: __noopEl,
    documentElement: __noopEl,
    addEventListener: function () {},
  };
}
