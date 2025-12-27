// wxCollapsiblePane Test - Tests collapsible pane in WASM
// KiCad uses collapsible panes for property panel grouping

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/collpane.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

class CollapsibleTestApp : public wxApp
{
public:
    virtual bool OnInit() override;
};

class CollapsibleTestFrame : public wxFrame
{
public:
    CollapsibleTestFrame();

private:
    wxCollapsiblePane* m_pane1;
    wxCollapsiblePane* m_pane2;
    wxCollapsiblePane* m_pane3;
    wxTextCtrl* m_log;

    void LogEvent(const wxString& msg);
    void CreatePaneContents(wxCollapsiblePane* pane, const wxString& type);

    void OnPaneChanged(wxCollapsiblePaneEvent& evt);
    void OnExpandAll(wxCommandEvent& evt);
    void OnCollapseAll(wxCommandEvent& evt);

    wxDECLARE_EVENT_TABLE();
};

enum {
    ID_PANE_1 = wxID_HIGHEST + 1,
    ID_PANE_2,
    ID_PANE_3,
    ID_EXPAND_ALL,
    ID_COLLAPSE_ALL
};

wxBEGIN_EVENT_TABLE(CollapsibleTestFrame, wxFrame)
    EVT_COLLAPSIBLEPANE_CHANGED(ID_PANE_1, CollapsibleTestFrame::OnPaneChanged)
    EVT_COLLAPSIBLEPANE_CHANGED(ID_PANE_2, CollapsibleTestFrame::OnPaneChanged)
    EVT_COLLAPSIBLEPANE_CHANGED(ID_PANE_3, CollapsibleTestFrame::OnPaneChanged)
    EVT_BUTTON(ID_EXPAND_ALL, CollapsibleTestFrame::OnExpandAll)
    EVT_BUTTON(ID_COLLAPSE_ALL, CollapsibleTestFrame::OnCollapseAll)
wxEND_EVENT_TABLE()

wxIMPLEMENT_APP(CollapsibleTestApp);

bool CollapsibleTestApp::OnInit()
{
    if (!wxApp::OnInit())
        return false;

    CollapsibleTestFrame* frame = new CollapsibleTestFrame();
    frame->Show(true);
    return true;
}

CollapsibleTestFrame::CollapsibleTestFrame()
    : wxFrame(nullptr, wxID_ANY, "wxCollapsiblePane WASM Test",
              wxDefaultPosition, wxSize(600, 700))
{
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    wxStaticText* desc = new wxStaticText(this, wxID_ANY,
        "wxCollapsiblePane Test\n\n"
        "KiCad uses collapsible panes for grouping properties in property panels.\n"
        "Click the arrows to expand/collapse each section.");
    mainSizer->Add(desc, 0, wxALL, 10);

    // Button bar
    wxBoxSizer* btnSizer = new wxBoxSizer(wxHORIZONTAL);
    btnSizer->Add(new wxButton(this, ID_EXPAND_ALL, "Expand All"), 0, wxALL, 5);
    btnSizer->Add(new wxButton(this, ID_COLLAPSE_ALL, "Collapse All"), 0, wxALL, 5);
    mainSizer->Add(btnSizer, 0, wxALIGN_CENTER);

    // Scrolled window to hold collapsible panes
    wxScrolledWindow* scrollWin = new wxScrolledWindow(this, wxID_ANY,
        wxDefaultPosition, wxDefaultSize, wxVSCROLL);
    scrollWin->SetScrollRate(0, 10);

    wxBoxSizer* scrollSizer = new wxBoxSizer(wxVERTICAL);

    // Collapsible pane 1: General Properties (like KiCad component properties)
    m_pane1 = new wxCollapsiblePane(scrollWin, ID_PANE_1, "General Properties");
    CreatePaneContents(m_pane1, "general");
    scrollSizer->Add(m_pane1, 0, wxEXPAND | wxALL, 5);

    // Collapsible pane 2: Position Properties
    m_pane2 = new wxCollapsiblePane(scrollWin, ID_PANE_2, "Position & Orientation");
    CreatePaneContents(m_pane2, "position");
    scrollSizer->Add(m_pane2, 0, wxEXPAND | wxALL, 5);

    // Collapsible pane 3: Display Properties
    m_pane3 = new wxCollapsiblePane(scrollWin, ID_PANE_3, "Display Options");
    CreatePaneContents(m_pane3, "display");
    scrollSizer->Add(m_pane3, 0, wxEXPAND | wxALL, 5);

    scrollWin->SetSizer(scrollSizer);
    mainSizer->Add(scrollWin, 1, wxEXPAND | wxALL, 10);

    // Event log
    wxStaticBoxSizer* logBox = new wxStaticBoxSizer(wxVERTICAL, this, "Event Log");
    m_log = new wxTextCtrl(this, wxID_ANY, "",
        wxDefaultPosition, wxSize(-1, 120), wxTE_MULTILINE | wxTE_READONLY);
    logBox->Add(m_log, 1, wxEXPAND | wxALL, 5);
    mainSizer->Add(logBox, 0, wxEXPAND | wxALL, 10);

    SetSizer(mainSizer);
    CreateStatusBar();
    SetStatusText("Ready - wxCollapsiblePane test");

    // Expand first pane by default
    m_pane1->Expand();

    LogEvent("CollapsiblePane test app started");
    LogEvent("3 collapsible sections created");

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[COLLAPSIBLE_TEST] wxCollapsiblePane test app started successfully');
    });
#endif
}

void CollapsibleTestFrame::CreatePaneContents(wxCollapsiblePane* pane, const wxString& type)
{
    wxWindow* paneWin = pane->GetPane();
    wxBoxSizer* paneSizer = new wxBoxSizer(wxVERTICAL);

    if (type == "general") {
        // KiCad-like component properties
        wxFlexGridSizer* grid = new wxFlexGridSizer(2, 10, 10);
        grid->AddGrowableCol(1);

        grid->Add(new wxStaticText(paneWin, wxID_ANY, "Reference:"), 0, wxALIGN_CENTER_VERTICAL);
        grid->Add(new wxTextCtrl(paneWin, wxID_ANY, "R1"), 1, wxEXPAND);

        grid->Add(new wxStaticText(paneWin, wxID_ANY, "Value:"), 0, wxALIGN_CENTER_VERTICAL);
        grid->Add(new wxTextCtrl(paneWin, wxID_ANY, "10k"), 1, wxEXPAND);

        grid->Add(new wxStaticText(paneWin, wxID_ANY, "Footprint:"), 0, wxALIGN_CENTER_VERTICAL);
        grid->Add(new wxTextCtrl(paneWin, wxID_ANY, "Resistor_SMD:R_0402"), 1, wxEXPAND);

        grid->Add(new wxStaticText(paneWin, wxID_ANY, "Datasheet:"), 0, wxALIGN_CENTER_VERTICAL);
        grid->Add(new wxTextCtrl(paneWin, wxID_ANY, "~"), 1, wxEXPAND);

        paneSizer->Add(grid, 0, wxEXPAND | wxALL, 10);
    }
    else if (type == "position") {
        wxFlexGridSizer* grid = new wxFlexGridSizer(2, 10, 10);
        grid->AddGrowableCol(1);

        grid->Add(new wxStaticText(paneWin, wxID_ANY, "X Position:"), 0, wxALIGN_CENTER_VERTICAL);
        grid->Add(new wxTextCtrl(paneWin, wxID_ANY, "100.5 mm"), 1, wxEXPAND);

        grid->Add(new wxStaticText(paneWin, wxID_ANY, "Y Position:"), 0, wxALIGN_CENTER_VERTICAL);
        grid->Add(new wxTextCtrl(paneWin, wxID_ANY, "50.25 mm"), 1, wxEXPAND);

        grid->Add(new wxStaticText(paneWin, wxID_ANY, "Rotation:"), 0, wxALIGN_CENTER_VERTICAL);
        wxChoice* rotChoice = new wxChoice(paneWin, wxID_ANY);
        rotChoice->Append("0°");
        rotChoice->Append("90°");
        rotChoice->Append("180°");
        rotChoice->Append("270°");
        rotChoice->SetSelection(1);
        grid->Add(rotChoice, 1, wxEXPAND);

        grid->Add(new wxStaticText(paneWin, wxID_ANY, "Side:"), 0, wxALIGN_CENTER_VERTICAL);
        wxChoice* sideChoice = new wxChoice(paneWin, wxID_ANY);
        sideChoice->Append("Front");
        sideChoice->Append("Back");
        sideChoice->SetSelection(0);
        grid->Add(sideChoice, 1, wxEXPAND);

        paneSizer->Add(grid, 0, wxEXPAND | wxALL, 10);
    }
    else if (type == "display") {
        wxBoxSizer* checkSizer = new wxBoxSizer(wxVERTICAL);

        checkSizer->Add(new wxCheckBox(paneWin, wxID_ANY, "Show Reference"), 0, wxALL, 5);
        checkSizer->Add(new wxCheckBox(paneWin, wxID_ANY, "Show Value"), 0, wxALL, 5);
        checkSizer->Add(new wxCheckBox(paneWin, wxID_ANY, "Show Footprint"), 0, wxALL, 5);
        checkSizer->Add(new wxCheckBox(paneWin, wxID_ANY, "Highlight on Selection"), 0, wxALL, 5);

        paneSizer->Add(checkSizer, 0, wxEXPAND | wxALL, 5);
    }

    paneWin->SetSizer(paneSizer);
}

void CollapsibleTestFrame::LogEvent(const wxString& msg)
{
#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[COLLAPSIBLE_EVENT] ' + UTF8ToString($0));
    }, msg.c_str().AsChar());
#endif

    if (!m_log)
        return;
    m_log->AppendText(msg + "\n");
    SetStatusText(msg);
}

void CollapsibleTestFrame::OnPaneChanged(wxCollapsiblePaneEvent& evt)
{
    wxString paneName;
    switch (evt.GetId()) {
        case ID_PANE_1: paneName = "General Properties"; break;
        case ID_PANE_2: paneName = "Position & Orientation"; break;
        case ID_PANE_3: paneName = "Display Options"; break;
        default: paneName = "Unknown"; break;
    }

    LogEvent(wxString::Format("Pane '%s' %s",
        paneName,
        evt.GetCollapsed() ? "collapsed" : "expanded"));

    // Relayout the parent
    Layout();
}

void CollapsibleTestFrame::OnExpandAll(wxCommandEvent& WXUNUSED(evt))
{
    m_pane1->Expand();
    m_pane2->Expand();
    m_pane3->Expand();
    Layout();
    LogEvent("All panes expanded");
}

void CollapsibleTestFrame::OnCollapseAll(wxCommandEvent& WXUNUSED(evt))
{
    m_pane1->Collapse();
    m_pane2->Collapse();
    m_pane3->Collapse();
    Layout();
    LogEvent("All panes collapsed");
}
