// wxToolBar/wxStatusBar Test - Tests toolbar and statusbar in WASM
// KiCad uses toolbars extensively for actions

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/artprov.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

class ToolbarTestApp : public wxApp
{
public:
    virtual bool OnInit() override;
};

class ToolbarTestFrame : public wxFrame
{
public:
    ToolbarTestFrame();

private:
    wxTextCtrl* m_log;

    void LogEvent(const wxString& msg);

    void OnToolNew(wxCommandEvent& evt);
    void OnToolOpen(wxCommandEvent& evt);
    void OnToolSave(wxCommandEvent& evt);
    void OnToolZoomIn(wxCommandEvent& evt);
    void OnToolZoomOut(wxCommandEvent& evt);
    void OnToolToggle(wxCommandEvent& evt);

    wxDECLARE_EVENT_TABLE();
};

enum {
    ID_TOOL_NEW = wxID_HIGHEST + 1,
    ID_TOOL_OPEN,
    ID_TOOL_SAVE,
    ID_TOOL_ZOOM_IN,
    ID_TOOL_ZOOM_OUT,
    ID_TOOL_TOGGLE
};

wxBEGIN_EVENT_TABLE(ToolbarTestFrame, wxFrame)
    EVT_TOOL(ID_TOOL_NEW, ToolbarTestFrame::OnToolNew)
    EVT_TOOL(ID_TOOL_OPEN, ToolbarTestFrame::OnToolOpen)
    EVT_TOOL(ID_TOOL_SAVE, ToolbarTestFrame::OnToolSave)
    EVT_TOOL(ID_TOOL_ZOOM_IN, ToolbarTestFrame::OnToolZoomIn)
    EVT_TOOL(ID_TOOL_ZOOM_OUT, ToolbarTestFrame::OnToolZoomOut)
    EVT_TOOL(ID_TOOL_TOGGLE, ToolbarTestFrame::OnToolToggle)
wxEND_EVENT_TABLE()

wxIMPLEMENT_APP(ToolbarTestApp);

bool ToolbarTestApp::OnInit()
{
    if (!wxApp::OnInit())
        return false;

    ToolbarTestFrame* frame = new ToolbarTestFrame();
    frame->Show(true);
    return true;
}

ToolbarTestFrame::ToolbarTestFrame()
    : wxFrame(nullptr, wxID_ANY, "wxToolBar/wxStatusBar WASM Test",
              wxDefaultPosition, wxSize(700, 500))
{
    // Create toolbar
    wxToolBar* toolbar = CreateToolBar(wxTB_HORIZONTAL | wxTB_TEXT);

    toolbar->AddTool(ID_TOOL_NEW, "New",
        wxArtProvider::GetBitmap(wxART_NEW, wxART_TOOLBAR),
        "Create new file");
    toolbar->AddTool(ID_TOOL_OPEN, "Open",
        wxArtProvider::GetBitmap(wxART_FILE_OPEN, wxART_TOOLBAR),
        "Open existing file");
    toolbar->AddTool(ID_TOOL_SAVE, "Save",
        wxArtProvider::GetBitmap(wxART_FILE_SAVE, wxART_TOOLBAR),
        "Save current file");

    toolbar->AddSeparator();

    toolbar->AddTool(ID_TOOL_ZOOM_IN, "Zoom In",
        wxArtProvider::GetBitmap(wxART_PLUS, wxART_TOOLBAR),
        "Zoom in");
    toolbar->AddTool(ID_TOOL_ZOOM_OUT, "Zoom Out",
        wxArtProvider::GetBitmap(wxART_MINUS, wxART_TOOLBAR),
        "Zoom out");

    toolbar->AddSeparator();

    toolbar->AddCheckTool(ID_TOOL_TOGGLE, "Toggle",
        wxArtProvider::GetBitmap(wxART_TICK_MARK, wxART_TOOLBAR),
        wxNullBitmap,
        "Toggle tool example");

    toolbar->Realize();

    // Create status bar with multiple fields
    CreateStatusBar(3);
    SetStatusText("Ready", 0);
    SetStatusText("X: 0, Y: 0", 1);
    SetStatusText("Zoom: 100%", 2);

    // Set status bar field widths
    int widths[] = {-1, 150, 100};
    GetStatusBar()->SetStatusWidths(3, widths);

    // Main content
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    wxStaticText* desc = new wxStaticText(this, wxID_ANY,
        "wxToolBar and wxStatusBar Test\n\n"
        "KiCad uses toolbars for quick access to tools.\n"
        "Click toolbar buttons to see events.");
    mainSizer->Add(desc, 0, wxALL, 10);

    wxStaticBoxSizer* logBox = new wxStaticBoxSizer(wxVERTICAL, this, "Event Log");
    m_log = new wxTextCtrl(this, wxID_ANY, "",
        wxDefaultPosition, wxSize(-1, 200), wxTE_MULTILINE | wxTE_READONLY);
    logBox->Add(m_log, 1, wxEXPAND | wxALL, 5);
    mainSizer->Add(logBox, 1, wxEXPAND | wxALL, 10);

    SetSizer(mainSizer);

    LogEvent("Toolbar test app started");
    LogEvent("Toolbar created with 6 tools");
    LogEvent("Status bar created with 3 fields");

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[TOOLBAR_TEST] wxToolBar test app started successfully');
    });
#endif
}

void ToolbarTestFrame::LogEvent(const wxString& msg)
{
    m_log->AppendText(msg + "\n");
    SetStatusText(msg, 0);

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[TOOLBAR_EVENT] ' + UTF8ToString($0));
    }, msg.c_str().AsChar());
#endif
}

void ToolbarTestFrame::OnToolNew(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Toolbar: New clicked");
}

void ToolbarTestFrame::OnToolOpen(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Toolbar: Open clicked");
}

void ToolbarTestFrame::OnToolSave(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Toolbar: Save clicked");
}

void ToolbarTestFrame::OnToolZoomIn(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Toolbar: Zoom In clicked");
    SetStatusText("Zoom: 150%", 2);
}

void ToolbarTestFrame::OnToolZoomOut(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Toolbar: Zoom Out clicked");
    SetStatusText("Zoom: 75%", 2);
}

void ToolbarTestFrame::OnToolToggle(wxCommandEvent& evt)
{
    bool checked = evt.IsChecked();
    LogEvent(wxString::Format("Toolbar: Toggle %s", checked ? "ON" : "OFF"));
}
