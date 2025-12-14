// Maximize Test - Tests wxFrame::Maximize() which KiCad uses
// This reproduces the bug where Maximize() returns a tiny window when
// GetScreenSize() returns incorrect values at startup.

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/display.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

class MaximizeTestApp : public wxApp
{
public:
    virtual bool OnInit() override;
};

class MaximizeTestFrame : public wxFrame
{
public:
    MaximizeTestFrame();

private:
    wxStaticText* m_sizeLabel;
    wxStaticText* m_displayLabel;

    void UpdateSizeDisplay();
    void OnSize(wxSizeEvent& evt);
    void OnMaximize(wxCommandEvent& evt);
    void OnRestore(wxCommandEvent& evt);

    wxDECLARE_EVENT_TABLE();
};

enum {
    ID_MAXIMIZE = wxID_HIGHEST + 1,
    ID_RESTORE
};

wxBEGIN_EVENT_TABLE(MaximizeTestFrame, wxFrame)
    EVT_SIZE(MaximizeTestFrame::OnSize)
    EVT_BUTTON(ID_MAXIMIZE, MaximizeTestFrame::OnMaximize)
    EVT_BUTTON(ID_RESTORE, MaximizeTestFrame::OnRestore)
wxEND_EVENT_TABLE()

wxIMPLEMENT_APP(MaximizeTestApp);

bool MaximizeTestApp::OnInit()
{
    if (!wxApp::OnInit())
        return false;

    // Create frame WITHOUT explicit size - uses wxDefaultSize
    // This is what KiCad does
    MaximizeTestFrame* frame = new MaximizeTestFrame();

    // KiCad calls Maximize() after creation
    frame->Maximize(true);

    frame->Show(true);
    return true;
}

MaximizeTestFrame::MaximizeTestFrame()
    : wxFrame(nullptr, wxID_ANY, "Maximize Test",
              wxDefaultPosition, wxDefaultSize)  // No explicit size!
{
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    wxStaticText* desc = new wxStaticText(this, wxID_ANY,
        "Maximize Test\n\n"
        "This test reproduces the KiCad startup issue.\n"
        "The frame is created with wxDefaultSize and Maximize() is called.\n"
        "If display size detection works, the window should be fullscreen.");
    mainSizer->Add(desc, 0, wxALL, 10);

    // Display info
    wxStaticBoxSizer* infoBox = new wxStaticBoxSizer(wxVERTICAL, this, "Display Info");

    m_displayLabel = new wxStaticText(this, wxID_ANY, "Display: querying...");
    infoBox->Add(m_displayLabel, 0, wxALL, 5);

    m_sizeLabel = new wxStaticText(this, wxID_ANY, "Window size: querying...");
    infoBox->Add(m_sizeLabel, 0, wxALL, 5);

    mainSizer->Add(infoBox, 0, wxEXPAND | wxALL, 10);

    // Buttons
    wxBoxSizer* btnSizer = new wxBoxSizer(wxHORIZONTAL);
    btnSizer->Add(new wxButton(this, ID_MAXIMIZE, "Maximize"), 0, wxALL, 5);
    btnSizer->Add(new wxButton(this, ID_RESTORE, "Restore"), 0, wxALL, 5);
    mainSizer->Add(btnSizer, 0, wxALIGN_CENTER | wxALL, 10);

    SetSizer(mainSizer);

    // Query display info
    wxDisplay display(wxDisplay::GetFromWindow(this));
    wxRect geom = display.GetGeometry();
    wxRect client = display.GetClientArea();

    wxString displayInfo = wxString::Format(
        "Display geometry: %dx%d, Client area: %dx%d",
        geom.GetWidth(), geom.GetHeight(),
        client.GetWidth(), client.GetHeight());
    m_displayLabel->SetLabel(displayInfo);

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[MAXIMIZE_TEST] Display geometry: ' + $0 + 'x' + $1);
        console.log('[MAXIMIZE_TEST] Client area: ' + $2 + 'x' + $3);
    }, geom.GetWidth(), geom.GetHeight(), client.GetWidth(), client.GetHeight());
#endif

    // Update size display after creation
    CallAfter(&MaximizeTestFrame::UpdateSizeDisplay);

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[MAXIMIZE_TEST] Maximize test app started');
    });
#endif
}

void MaximizeTestFrame::UpdateSizeDisplay()
{
    wxSize size = GetSize();
    wxSize clientSize = GetClientSize();

    wxString sizeInfo = wxString::Format(
        "Window size: %dx%d, Client: %dx%d, Maximized: %s",
        size.GetWidth(), size.GetHeight(),
        clientSize.GetWidth(), clientSize.GetHeight(),
        IsMaximized() ? "YES" : "NO");
    m_sizeLabel->SetLabel(sizeInfo);

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[MAXIMIZE_TEST] Window size: ' + $0 + 'x' + $1);
        console.log('[MAXIMIZE_TEST] Client size: ' + $2 + 'x' + $3);
        console.log('[MAXIMIZE_TEST] Is maximized: ' + ($4 ? 'YES' : 'NO'));

        // Test assertion: window should be larger than 100px if maximize worked
        if ($0 < 100 || $1 < 100) {
            console.error('[MAXIMIZE_TEST] FAIL: Window is too small! Expected fullscreen, got ' + $0 + 'x' + $1);
        } else {
            console.log('[MAXIMIZE_TEST] PASS: Window size is reasonable');
        }
    }, size.GetWidth(), size.GetHeight(),
       clientSize.GetWidth(), clientSize.GetHeight(),
       IsMaximized() ? 1 : 0);
#endif
}

void MaximizeTestFrame::OnSize(wxSizeEvent& evt)
{
    evt.Skip();
    CallAfter(&MaximizeTestFrame::UpdateSizeDisplay);
}

void MaximizeTestFrame::OnMaximize(wxCommandEvent& WXUNUSED(evt))
{
#ifdef __EMSCRIPTEN__
    EM_ASM({ console.log('[MAXIMIZE_TEST] Maximize button clicked'); });
#endif
    Maximize(true);
}

void MaximizeTestFrame::OnRestore(wxCommandEvent& WXUNUSED(evt))
{
#ifdef __EMSCRIPTEN__
    EM_ASM({ console.log('[MAXIMIZE_TEST] Restore button clicked'); });
#endif
    Maximize(false);
}
