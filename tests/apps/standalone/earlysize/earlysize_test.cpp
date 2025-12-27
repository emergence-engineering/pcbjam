// Early Size Test - Reproduces KiCad's pattern of calling GetClientSize() before Show()
// This tests whether wxWidgets WASM port returns correct sizes during frame construction.
//
// KiCad's EDA_BASE_FRAME::commonInit() does:
//   m_frameSize = defaultSize();  // 1280x720
//   GetClientSize(&m_frameSize.x, &m_frameSize.y);  // Overwrites with actual client size
//
// In WASM, GetClientSize() returns 20x20 if called before the frame is shown/sized.

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/display.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

class EarlySizeTestApp : public wxApp
{
public:
    virtual bool OnInit() override;
};

class EarlySizeTestFrame : public wxFrame
{
public:
    EarlySizeTestFrame();

private:
    wxSize m_earlyClientSize;  // Captured before Show()
    wxSize m_earlyFrameSize;
    wxStaticText* m_resultLabel;

    void OnPaint(wxPaintEvent& evt);

    wxDECLARE_EVENT_TABLE();
};

wxBEGIN_EVENT_TABLE(EarlySizeTestFrame, wxFrame)
    EVT_PAINT(EarlySizeTestFrame::OnPaint)
wxEND_EVENT_TABLE()

wxIMPLEMENT_APP(EarlySizeTestApp);

bool EarlySizeTestApp::OnInit()
{
    if (!wxApp::OnInit())
        return false;

    // Create frame with wxDefaultSize (like KiCad does)
    EarlySizeTestFrame* frame = new EarlySizeTestFrame();

    // Show the frame (this is where sizing should happen)
    frame->Show(true);
    return true;
}

EarlySizeTestFrame::EarlySizeTestFrame()
    : wxFrame(nullptr, wxID_ANY, "Early Size Test",
              wxDefaultPosition, wxDefaultSize)  // No explicit size!
{
    // === THIS IS THE KEY TEST ===
    // KiCad calls GetClientSize() in commonInit(), BEFORE Show()
    // In WASM, this should NOT return 20x20

    GetClientSize(&m_earlyClientSize.x, &m_earlyClientSize.y);
    m_earlyFrameSize = GetSize();

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[EARLYSIZE_TEST] Constructor called - BEFORE Show()');
        console.log('[EARLYSIZE_TEST] Early client size: ' + $0 + 'x' + $1);
        console.log('[EARLYSIZE_TEST] Early frame size: ' + $2 + 'x' + $3);
    }, m_earlyClientSize.x, m_earlyClientSize.y,
       m_earlyFrameSize.x, m_earlyFrameSize.y);
#endif

    // Create UI
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    wxStaticText* desc = new wxStaticText(this, wxID_ANY,
        "Early Size Test\n\n"
        "This test reproduces KiCad's pattern:\n"
        "- Frame created with wxDefaultSize\n"
        "- GetClientSize() called in constructor BEFORE Show()\n"
        "- Size should NOT be 20x20!");
    mainSizer->Add(desc, 0, wxALL, 10);

    // Results
    wxStaticBoxSizer* resultBox = new wxStaticBoxSizer(wxVERTICAL, this, "Results (from constructor)");

    wxString resultText = wxString::Format(
        "Early Client Size: %dx%d\nEarly Frame Size: %dx%d",
        m_earlyClientSize.x, m_earlyClientSize.y,
        m_earlyFrameSize.x, m_earlyFrameSize.y);
    m_resultLabel = new wxStaticText(this, wxID_ANY, resultText);
    resultBox->Add(m_resultLabel, 0, wxALL, 5);

    mainSizer->Add(resultBox, 0, wxEXPAND | wxALL, 10);

    SetSizer(mainSizer);

    // Maximize like KiCad does
    Maximize(true);

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[EARLYSIZE_TEST] Early size test app started');
    });
#endif
}

void EarlySizeTestFrame::OnPaint(wxPaintEvent& evt)
{
    evt.Skip();

    // Log final result after first paint
    static bool logged = false;
    if (!logged) {
        logged = true;

        wxSize currentClient;
        GetClientSize(&currentClient.x, &currentClient.y);
        wxSize currentFrame = GetSize();

#ifdef __EMSCRIPTEN__
        // The key assertion: early client size should be > 100
        // If it's 20x20, that's the bug!
        bool earlyClientOk = (m_earlyClientSize.x > 100 && m_earlyClientSize.y > 100);
        bool earlyFrameOk = (m_earlyFrameSize.x > 100 && m_earlyFrameSize.y > 100);

        EM_ASM({
            console.log('[EARLYSIZE_TEST] After Show() - current client: ' + $0 + 'x' + $1);
            console.log('[EARLYSIZE_TEST] After Show() - current frame: ' + $2 + 'x' + $3);

            if ($4 && $5) {
                console.log('[EARLYSIZE_TEST] PASS: Early sizes were reasonable');
            } else {
                console.error('[EARLYSIZE_TEST] FAIL: Early sizes were tiny!');
                console.error('[EARLYSIZE_TEST] Early client was: ' + $6 + 'x' + $7);
                console.error('[EARLYSIZE_TEST] Early frame was: ' + $8 + 'x' + $9);
            }
        }, currentClient.x, currentClient.y,
           currentFrame.x, currentFrame.y,
           earlyClientOk ? 1 : 0, earlyFrameOk ? 1 : 0,
           m_earlyClientSize.x, m_earlyClientSize.y,
           m_earlyFrameSize.x, m_earlyFrameSize.y);
#endif
    }
}
