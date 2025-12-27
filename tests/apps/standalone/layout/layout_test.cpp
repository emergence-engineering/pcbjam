// Layout Test - Tests wxSplitterWindow and wxScrolledWindow in WASM
// KiCad uses splitters and scrolled windows extensively

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/splitter.h"
#include "wx/scrolwin.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

class LayoutTestApp : public wxApp
{
public:
    virtual bool OnInit() override;
};

class LayoutTestFrame : public wxFrame
{
public:
    LayoutTestFrame();

private:
    wxSplitterWindow* m_splitter;
    wxScrolledWindow* m_scrollLeft;
    wxScrolledWindow* m_scrollRight;
    wxTextCtrl* m_log;

    void LogEvent(const wxString& msg);
    void OnSplitterSashPosChanged(wxSplitterEvent& evt);
    void OnScrollWin(wxScrollWinEvent& evt);

    wxDECLARE_EVENT_TABLE();
};

wxBEGIN_EVENT_TABLE(LayoutTestFrame, wxFrame)
    EVT_SPLITTER_SASH_POS_CHANGED(wxID_ANY, LayoutTestFrame::OnSplitterSashPosChanged)
wxEND_EVENT_TABLE()

wxIMPLEMENT_APP(LayoutTestApp);

bool LayoutTestApp::OnInit()
{
    if (!wxApp::OnInit())
        return false;

    LayoutTestFrame* frame = new LayoutTestFrame();
    frame->Show(true);
    return true;
}

LayoutTestFrame::LayoutTestFrame()
    : wxFrame(nullptr, wxID_ANY, "wxSplitter/wxScrolled WASM Test",
              wxDefaultPosition, wxSize(800, 600))
{
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    wxStaticText* desc = new wxStaticText(this, wxID_ANY,
        "wxSplitterWindow and wxScrolledWindow Test - KiCad layout controls");
    mainSizer->Add(desc, 0, wxALL, 5);

    // Create splitter
    m_splitter = new wxSplitterWindow(this, wxID_ANY, wxDefaultPosition,
        wxDefaultSize, wxSP_3D | wxSP_LIVE_UPDATE);

    // Left scrolled window
    m_scrollLeft = new wxScrolledWindow(m_splitter, wxID_ANY);
    m_scrollLeft->SetBackgroundColour(*wxLIGHT_GREY);
    m_scrollLeft->SetScrollbars(10, 10, 100, 100);

    wxBoxSizer* leftSizer = new wxBoxSizer(wxVERTICAL);
    for (int i = 0; i < 20; i++) {
        leftSizer->Add(new wxStaticText(m_scrollLeft, wxID_ANY,
            wxString::Format("Left Item %d", i+1)), 0, wxALL, 5);
    }
    m_scrollLeft->SetSizer(leftSizer);

    // Right scrolled window
    m_scrollRight = new wxScrolledWindow(m_splitter, wxID_ANY);
    m_scrollRight->SetBackgroundColour(*wxWHITE);
    m_scrollRight->SetScrollbars(10, 10, 100, 100);

    wxBoxSizer* rightSizer = new wxBoxSizer(wxVERTICAL);
    for (int i = 0; i < 20; i++) {
        rightSizer->Add(new wxStaticText(m_scrollRight, wxID_ANY,
            wxString::Format("Right Item %d", i+1)), 0, wxALL, 5);
    }
    m_scrollRight->SetSizer(rightSizer);

    m_splitter->SplitVertically(m_scrollLeft, m_scrollRight, 300);
    m_splitter->SetMinimumPaneSize(100);

    mainSizer->Add(m_splitter, 1, wxEXPAND | wxALL, 5);

    // Event log
    wxStaticBoxSizer* logBox = new wxStaticBoxSizer(wxVERTICAL, this, "Event Log");
    m_log = new wxTextCtrl(this, wxID_ANY, "",
        wxDefaultPosition, wxSize(-1, 100), wxTE_MULTILINE | wxTE_READONLY);
    logBox->Add(m_log, 1, wxEXPAND | wxALL, 5);
    mainSizer->Add(logBox, 0, wxEXPAND | wxALL, 5);

    SetSizer(mainSizer);
    CreateStatusBar();
    SetStatusText("Drag splitter sash or scroll the panes");

    LogEvent("Layout test app started");
    LogEvent("Splitter position: 300");

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[LAYOUT_TEST] wxSplitter/wxScrolled test app started successfully');
    });
#endif
}

void LayoutTestFrame::LogEvent(const wxString& msg)
{
    m_log->AppendText(msg + "\n");
    SetStatusText(msg);

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[LAYOUT_EVENT] ' + UTF8ToString($0));
    }, msg.c_str().AsChar());
#endif
}

void LayoutTestFrame::OnSplitterSashPosChanged(wxSplitterEvent& evt)
{
    LogEvent(wxString::Format("Splitter sash moved to: %d", evt.GetSashPosition()));
}

void LayoutTestFrame::OnScrollWin(wxScrollWinEvent& evt)
{
    LogEvent("Scroll event");
    evt.Skip();
}
