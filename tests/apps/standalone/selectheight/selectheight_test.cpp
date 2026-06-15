// Select Height Test - Regression guard for the wxChoice (<select>) height fix.
//
// Bug (fixed in commit "fix: 🐛 select height"): an HTML <select>'s height only
// resolves once the browser lays it out, but DoGetBestSize() is frequently
// queried BEFORE layout (wxAuiToolBar freezes a control's min size at AddControl
// time, panel sizers measure during construction). The DOM reported ~0 height,
// so the layout system pinned the control to an unusable sliver.
//
// The fix is wxChoice::DoGetBestSize() (src/wasm/choice.cpp), which floors the
// height to GetCharHeight() + 8 when the DOM-measured height is too small.
//
// This test creates ONE wxChoice and queries GetBestSize() in the constructor,
// BEFORE the frame is shown / laid out. On pre-fix code best.y is ~0 (FAIL);
// with the fix it is GetCharHeight() + 8 (PASS).

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

class SelectHeightTestApp : public wxApp
{
public:
    virtual bool OnInit() override;
};

class SelectHeightTestFrame : public wxFrame
{
public:
    SelectHeightTestFrame();

private:
    wxSize m_earlyBestSize;  // wxChoice best size captured before Show()/layout
};

wxIMPLEMENT_APP(SelectHeightTestApp);

bool SelectHeightTestApp::OnInit()
{
    if (!wxApp::OnInit())
        return false;

    SelectHeightTestFrame* frame = new SelectHeightTestFrame();
    frame->Show(true);
    return true;
}

SelectHeightTestFrame::SelectHeightTestFrame()
    : wxFrame(nullptr, wxID_ANY, "Select Height Test",
              wxDefaultPosition, wxSize(400, 200))
{
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    mainSizer->Add(new wxStaticText(this, wxID_ANY,
        "Select Height Test\n\n"
        "One wxChoice; its GetBestSize() is queried in the constructor,\n"
        "before layout. Height must NOT collapse to ~0px."),
        0, wxALL, 10);

    // The single control under test. wxDefaultSize so the caller does not force
    // a height -- the height must come from DoGetBestSize().
    wxString items[] = { "Red", "Green", "Blue" };
    wxChoice* choice = new wxChoice(this, wxID_ANY, wxDefaultPosition,
                                    wxDefaultSize, 3, items);
    choice->SetSelection(0);

    // === THE KEY MEASUREMENT ===
    // Query best size BEFORE Show()/layout, where the bug manifested. Nothing is
    // cached yet, so this recomputes via wxChoice::DoGetBestSize().
    m_earlyBestSize = choice->GetBestSize();

    // The bug was height-specific; width comes from intrinsic content sizing and
    // was never broken. A real control is at least a line of text tall.
    const int minHeight = GetCharHeight() + 8;
    const bool heightOk = (m_earlyBestSize.y >= minHeight);

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[SELECTHEIGHT_TEST] Choice best size: ' + $0 + 'x' + $1);
        console.log('[SELECTHEIGHT_TEST] Expected min height: ' + $2);
        if ($3) {
            console.log('[SELECTHEIGHT_TEST] PASS: select has a real height');
        } else {
            console.error('[SELECTHEIGHT_TEST] FAIL: select height collapsed to '
                          + $1 + 'px (expected >= ' + $2 + ')');
        }
    }, m_earlyBestSize.x, m_earlyBestSize.y, minHeight, heightOk ? 1 : 0);
#endif

    choice->SetSelection(0);
    mainSizer->Add(choice, 0, wxALL, 10);

    SetSizer(mainSizer);

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[SELECTHEIGHT_TEST] Select height test app started');
    });
#endif
}
