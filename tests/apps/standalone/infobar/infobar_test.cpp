// wxInfoBar Test - Tests info bar in WASM
// KiCad uses info bars for notifications and warnings

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/infobar.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

class InfoBarTestApp : public wxApp
{
public:
    virtual bool OnInit() override;
};

class InfoBarTestFrame : public wxFrame
{
public:
    InfoBarTestFrame();

private:
    wxInfoBar* m_infoBar;
    wxTextCtrl* m_log;
    wxPanel* m_contentPanel;

    void LogEvent(const wxString& msg);

    void OnShowInfo(wxCommandEvent& evt);
    void OnShowWarning(wxCommandEvent& evt);
    void OnShowError(wxCommandEvent& evt);
    void OnShowWithButton(wxCommandEvent& evt);
    void OnDismiss(wxCommandEvent& evt);
    void OnInfoBarButton(wxCommandEvent& evt);

    wxDECLARE_EVENT_TABLE();
};

enum {
    ID_SHOW_INFO = wxID_HIGHEST + 1,
    ID_SHOW_WARNING,
    ID_SHOW_ERROR,
    ID_SHOW_WITH_BUTTON,
    ID_DISMISS,
    ID_INFOBAR_BUTTON
};

wxBEGIN_EVENT_TABLE(InfoBarTestFrame, wxFrame)
    EVT_BUTTON(ID_SHOW_INFO, InfoBarTestFrame::OnShowInfo)
    EVT_BUTTON(ID_SHOW_WARNING, InfoBarTestFrame::OnShowWarning)
    EVT_BUTTON(ID_SHOW_ERROR, InfoBarTestFrame::OnShowError)
    EVT_BUTTON(ID_SHOW_WITH_BUTTON, InfoBarTestFrame::OnShowWithButton)
    EVT_BUTTON(ID_DISMISS, InfoBarTestFrame::OnDismiss)
    EVT_BUTTON(ID_INFOBAR_BUTTON, InfoBarTestFrame::OnInfoBarButton)
wxEND_EVENT_TABLE()

wxIMPLEMENT_APP(InfoBarTestApp);

bool InfoBarTestApp::OnInit()
{
    if (!wxApp::OnInit())
        return false;

    InfoBarTestFrame* frame = new InfoBarTestFrame();
    frame->Show(true);
    return true;
}

InfoBarTestFrame::InfoBarTestFrame()
    : wxFrame(nullptr, wxID_ANY, "wxInfoBar WASM Test",
              wxDefaultPosition, wxSize(700, 500))
{
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    // Info bar at the top (like KiCad)
    m_infoBar = new wxInfoBar(this);
    mainSizer->Add(m_infoBar, 0, wxEXPAND);

    // Description
    wxStaticText* desc = new wxStaticText(this, wxID_ANY,
        "wxInfoBar Test\n\n"
        "KiCad uses wxInfoBar for notifications, warnings, and error messages.\n"
        "Click the buttons below to show different types of messages.");
    mainSizer->Add(desc, 0, wxALL, 10);

    // Button panel
    wxStaticBoxSizer* btnBox = new wxStaticBoxSizer(wxVERTICAL, this, "Show Messages");

    wxFlexGridSizer* btnGrid = new wxFlexGridSizer(2, 10, 10);

    btnGrid->Add(new wxButton(this, ID_SHOW_INFO, "Show Info Message"), 0, wxEXPAND);
    btnGrid->Add(new wxStaticText(this, wxID_ANY, "Blue info bar with info icon"), 0, wxALIGN_CENTER_VERTICAL);

    btnGrid->Add(new wxButton(this, ID_SHOW_WARNING, "Show Warning Message"), 0, wxEXPAND);
    btnGrid->Add(new wxStaticText(this, wxID_ANY, "Yellow warning bar with warning icon"), 0, wxALIGN_CENTER_VERTICAL);

    btnGrid->Add(new wxButton(this, ID_SHOW_ERROR, "Show Error Message"), 0, wxEXPAND);
    btnGrid->Add(new wxStaticText(this, wxID_ANY, "Red error bar with error icon"), 0, wxALIGN_CENTER_VERTICAL);

    btnGrid->Add(new wxButton(this, ID_SHOW_WITH_BUTTON, "Show With Action Button"), 0, wxEXPAND);
    btnGrid->Add(new wxStaticText(this, wxID_ANY, "Info bar with clickable action button"), 0, wxALIGN_CENTER_VERTICAL);

    btnGrid->Add(new wxButton(this, ID_DISMISS, "Dismiss"), 0, wxEXPAND);
    btnGrid->Add(new wxStaticText(this, wxID_ANY, "Hide the info bar"), 0, wxALIGN_CENTER_VERTICAL);

    btnBox->Add(btnGrid, 0, wxALL, 10);
    mainSizer->Add(btnBox, 0, wxEXPAND | wxALL, 10);

    // Sample KiCad-like messages box
    wxStaticBoxSizer* exampleBox = new wxStaticBoxSizer(wxVERTICAL, this, "Example KiCad Messages");

    wxArrayString examples;
    examples.Add("INFO: Board successfully loaded from 'myproject.kicad_pcb'");
    examples.Add("WARNING: Footprint 'R_0402' not found in library, using fallback");
    examples.Add("ERROR: DRC violation: Clearance 0.15mm < 0.2mm required");
    examples.Add("INFO: Design rules check completed: 0 errors, 2 warnings");
    examples.Add("WARNING: Component 'U3' has unconnected pins: 12, 14, 15");

    wxListBox* exampleList = new wxListBox(this, wxID_ANY, wxDefaultPosition, wxSize(-1, 100),
        examples, wxLB_SINGLE);
    exampleBox->Add(exampleList, 0, wxEXPAND | wxALL, 5);
    mainSizer->Add(exampleBox, 0, wxEXPAND | wxALL, 10);

    // Event log
    wxStaticBoxSizer* logBox = new wxStaticBoxSizer(wxVERTICAL, this, "Event Log");
    m_log = new wxTextCtrl(this, wxID_ANY, "",
        wxDefaultPosition, wxSize(-1, 100), wxTE_MULTILINE | wxTE_READONLY);
    logBox->Add(m_log, 1, wxEXPAND | wxALL, 5);
    mainSizer->Add(logBox, 0, wxEXPAND | wxALL, 10);

    SetSizer(mainSizer);
    CreateStatusBar();
    SetStatusText("Ready - wxInfoBar test");

    LogEvent("InfoBar test app started");

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[INFOBAR_TEST] wxInfoBar test app started successfully');
    });
#endif
}

void InfoBarTestFrame::LogEvent(const wxString& msg)
{
#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[INFOBAR_EVENT] ' + UTF8ToString($0));
    }, msg.c_str().AsChar());
#endif

    if (!m_log)
        return;
    m_log->AppendText(msg + "\n");
    SetStatusText(msg);
}

void InfoBarTestFrame::OnShowInfo(wxCommandEvent& WXUNUSED(evt))
{
    m_infoBar->ShowMessage("Board successfully loaded. Design contains 245 components and 89 nets.",
                           wxICON_INFORMATION);
    LogEvent("Showed info message");
}

void InfoBarTestFrame::OnShowWarning(wxCommandEvent& WXUNUSED(evt))
{
    m_infoBar->ShowMessage("Warning: Some footprints could not be found in the configured libraries.",
                           wxICON_WARNING);
    LogEvent("Showed warning message");
}

void InfoBarTestFrame::OnShowError(wxCommandEvent& WXUNUSED(evt))
{
    m_infoBar->ShowMessage("Error: DRC check failed. 3 clearance violations found.",
                           wxICON_ERROR);
    LogEvent("Showed error message");
}

void InfoBarTestFrame::OnShowWithButton(wxCommandEvent& WXUNUSED(evt))
{
    m_infoBar->RemoveButton(ID_INFOBAR_BUTTON);
    m_infoBar->AddButton(ID_INFOBAR_BUTTON, "View Details");
    m_infoBar->ShowMessage("ERC completed with 2 warnings. Click to view details.",
                           wxICON_WARNING);
    LogEvent("Showed message with action button");
}

void InfoBarTestFrame::OnDismiss(wxCommandEvent& WXUNUSED(evt))
{
    m_infoBar->Dismiss();
    LogEvent("Info bar dismissed");
}

void InfoBarTestFrame::OnInfoBarButton(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Info bar action button clicked - would open details dialog");
    wxMessageBox("This would open the ERC results dialog in KiCad.",
                 "Action Button Clicked", wxOK | wxICON_INFORMATION);
}
