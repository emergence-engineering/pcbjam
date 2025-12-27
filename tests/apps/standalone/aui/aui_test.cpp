// wxAuiManager Test - Tests AUI docking functionality in WASM
// KiCad uses AUI extensively for dockable panels

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/aui/aui.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

class AuiTestApp : public wxApp
{
public:
    virtual bool OnInit() override;
};

class AuiTestFrame : public wxFrame
{
public:
    AuiTestFrame();
    ~AuiTestFrame();

private:
    wxAuiManager m_mgr;
    wxTextCtrl* m_log;

    void LogEvent(const wxString& msg);
    void OnPaneClose(wxAuiManagerEvent& evt);

    wxDECLARE_EVENT_TABLE();
};

wxBEGIN_EVENT_TABLE(AuiTestFrame, wxFrame)
    EVT_AUI_PANE_CLOSE(AuiTestFrame::OnPaneClose)
wxEND_EVENT_TABLE()

wxIMPLEMENT_APP(AuiTestApp);

bool AuiTestApp::OnInit()
{
    if (!wxApp::OnInit())
        return false;

    AuiTestFrame* frame = new AuiTestFrame();
    frame->Show(true);
    return true;
}

AuiTestFrame::AuiTestFrame()
    : wxFrame(nullptr, wxID_ANY, "wxAuiManager WASM Test",
              wxDefaultPosition, wxSize(800, 600))
{
    m_mgr.SetManagedWindow(this);

    // Create center pane with event log
    m_log = new wxTextCtrl(this, wxID_ANY, "",
        wxDefaultPosition, wxDefaultSize,
        wxTE_MULTILINE | wxTE_READONLY);
    m_mgr.AddPane(m_log, wxAuiPaneInfo().Name("log").Caption("Event Log")
        .Center().CloseButton(false));

    // Create left panel (like KiCad's properties panel)
    wxPanel* leftPanel = new wxPanel(this);
    leftPanel->SetBackgroundColour(*wxLIGHT_GREY);
    wxBoxSizer* leftSizer = new wxBoxSizer(wxVERTICAL);
    leftSizer->Add(new wxStaticText(leftPanel, wxID_ANY, "Properties Panel"), 0, wxALL, 10);
    leftSizer->Add(new wxStaticText(leftPanel, wxID_ANY, "Like KiCad's"), 0, wxALL, 5);
    leftSizer->Add(new wxStaticText(leftPanel, wxID_ANY, "property editor"), 0, wxALL, 5);
    leftPanel->SetSizer(leftSizer);

    m_mgr.AddPane(leftPanel, wxAuiPaneInfo().Name("properties").Caption("Properties")
        .Left().Layer(1).Position(1).CloseButton(true).MaximizeButton(true)
        .MinSize(150, 200));

    // Create right panel (like KiCad's layer manager)
    wxPanel* rightPanel = new wxPanel(this);
    rightPanel->SetBackgroundColour(wxColour(240, 240, 255));
    wxBoxSizer* rightSizer = new wxBoxSizer(wxVERTICAL);
    rightSizer->Add(new wxStaticText(rightPanel, wxID_ANY, "Layers Panel"), 0, wxALL, 10);
    rightSizer->Add(new wxStaticText(rightPanel, wxID_ANY, "Like KiCad's"), 0, wxALL, 5);
    rightSizer->Add(new wxStaticText(rightPanel, wxID_ANY, "layer manager"), 0, wxALL, 5);
    rightPanel->SetSizer(rightSizer);

    m_mgr.AddPane(rightPanel, wxAuiPaneInfo().Name("layers").Caption("Layers")
        .Right().Layer(1).Position(1).CloseButton(true).MaximizeButton(true)
        .MinSize(150, 200));

    // Create bottom panel (like KiCad's message panel)
    wxPanel* bottomPanel = new wxPanel(this);
    bottomPanel->SetBackgroundColour(wxColour(255, 255, 240));
    wxBoxSizer* bottomSizer = new wxBoxSizer(wxVERTICAL);
    bottomSizer->Add(new wxStaticText(bottomPanel, wxID_ANY,
        "Message Panel - Like KiCad's message area"), 0, wxALL, 5);
    bottomPanel->SetSizer(bottomSizer);

    m_mgr.AddPane(bottomPanel, wxAuiPaneInfo().Name("messages").Caption("Messages")
        .Bottom().Layer(0).Position(1).CloseButton(true)
        .MinSize(-1, 80));

    m_mgr.Update();

    CreateStatusBar();
    SetStatusText("AUI Manager ready - try dragging and docking panels");

    LogEvent("AUI test app started");
    LogEvent("Created dockable panels: Properties, Layers, Messages");

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[AUI_TEST] wxAuiManager test app started successfully');
    });
#endif
}

AuiTestFrame::~AuiTestFrame()
{
    m_mgr.UnInit();
}

void AuiTestFrame::LogEvent(const wxString& msg)
{
    m_log->AppendText(msg + "\n");
    SetStatusText(msg);

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[AUI_EVENT] ' + UTF8ToString($0));
    }, msg.c_str().AsChar());
#endif
}

void AuiTestFrame::OnPaneClose(wxAuiManagerEvent& evt)
{
    wxAuiPaneInfo* pane = evt.GetPane();
    if (pane) {
        LogEvent(wxString::Format("Pane closing: %s", pane->name));
    }
}
