// wxToolTip hover-window lifetime reproduction (DOM port).
//
// Bug (src/wasm/tooltip.cpp):
//
//   wxWindow *gs_hoverWindow = NULL;            // raw pointer, set on hover
//   ... wxWasmTooltipTimer::Notify() {
//       wxWindow *win = FindTooltipWindow(gs_hoverWindow);  // 600 ms later:
//       ...                                                 // win->GetParent()/
//   }                                                       // GetToolTip()/...
//
// Nothing clears gs_hoverWindow when the hovered window is destroyed, so a
// window destroyed within the 600 ms tooltip delay leaves gs_hoverWindow
// dangling -> use-after-free when the timer fires.
//
// ASAN can't catch this here (the read lives in the wx library, which is not
// instrumented), so the repro checks the invariant the bug violates directly:
// it arms the hover for a window (the same call wxApp::HandleMouseEvent makes on
// hover-in), destroys that window, and asks — via a diagnostic accessor — whether
// the hovered-window pointer was cleared.
//
//   RED  (bug present): gs_hoverWindow still points at the freed window.
//   GREEN (fixed):      gs_hoverWindow was cleared on destruction.

#include "wx/wxprec.h"
#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include <cstdint>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

// Hooks defined in src/wasm/tooltip.cpp.
extern void wxWasmTooltipOnHoverChange(wxWindow *win);
extern wxWindow *wxWasmTooltipDebugHoverWindow();

static void Report(const char *name, bool pass, const wxString &detail)
{
#ifdef __EMSCRIPTEN__
    EM_ASM({
        var msg = '[REPRO] ' + UTF8ToString($0) + ': ' + ($1 ? 'PASS' : 'FAIL')
                  + ' - ' + UTF8ToString($2);
        if ($1) { console.log(msg); } else { console.error(msg); }
    }, name, pass ? 1 : 0, (const char *)detail.utf8_str());
#endif
}

class ReproFrame : public wxFrame
{
public:
    ReproFrame();

private:
    void RunTest();
};

ReproFrame::ReproFrame()
    : wxFrame(nullptr, wxID_ANY, "wxToolTip lifetime repro")
{
    CallAfter(&ReproFrame::RunTest);
}

void ReproFrame::RunTest()
{
    wxWindow *victim = new wxPanel(this, wxID_ANY,
                                   wxDefaultPosition, wxSize(120, 60));
    victim->SetToolTip("VICTIM_TOOLTIP");

    // Arm the hover exactly like wxApp::HandleMouseEvent does on hover-in:
    // gs_hoverWindow = victim, and the 600 ms tooltip timer starts.
    wxWasmTooltipOnHoverChange(victim);
    const bool armed = (wxWasmTooltipDebugHoverWindow() == victim);

    const uintptr_t victimAddr = reinterpret_cast<uintptr_t>(victim);

    // Destroy the hovered window while the tooltip timer is still pending.
    delete victim;

    // Invariant: the hovered-window pointer must not outlive its window.
    wxWindow *hover = wxWasmTooltipDebugHoverWindow();
    const bool cleared = (hover == nullptr);
    const bool pass = armed && cleared;

    Report("tooltip_hover_window_cleared_on_destroy", pass,
           wxString::Format("armed=%d hover=%p victim=0x%lx",
                            armed ? 1 : 0, (void *)hover,
                            static_cast<unsigned long>(victimAddr)));
}

class ReproApp : public wxApp
{
public:
    bool OnInit() override
    {
        if (!wxApp::OnInit())
            return false;

        (new ReproFrame())->Show(true);
        return true;
    }
};

wxIMPLEMENT_APP(ReproApp);
