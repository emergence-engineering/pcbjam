// wxAuiNotebook Test - Tab panels for KiCad editors
// Tests wxAuiNotebook for dockable, closeable tab panels

#include "wx/wx.h"
#include "wx/aui/auibook.h"
#include "wx/aui/aui.h"
#include "wx/textctrl.h"

class AuiNotebookFrame : public wxFrame
{
public:
    AuiNotebookFrame() : wxFrame(nullptr, wxID_ANY, "wxAuiNotebook Test",
                                  wxDefaultPosition, wxSize(1000, 600))
    {
        wxPanel* mainPanel = new wxPanel(this);
        wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

        // Description
        wxStaticText* desc = new wxStaticText(mainPanel, wxID_ANY,
            "KiCad uses wxAuiNotebook for tabbed panels in some editors.\n"
            "Features: closeable tabs, reorderable tabs, split views.");
        mainSizer->Add(desc, 0, wxALL, 5);

        // Controls
        wxBoxSizer* controlSizer = new wxBoxSizer(wxHORIZONTAL);

        wxButton* btnAdd = new wxButton(mainPanel, wxID_ANY, "Add Tab");
        wxButton* btnRemove = new wxButton(mainPanel, wxID_ANY, "Remove Tab");
        wxButton* btnSplit = new wxButton(mainPanel, wxID_ANY, "Split View");

        btnAdd->Bind(wxEVT_BUTTON, &AuiNotebookFrame::OnAddTab, this);
        btnRemove->Bind(wxEVT_BUTTON, &AuiNotebookFrame::OnRemoveTab, this);
        btnSplit->Bind(wxEVT_BUTTON, &AuiNotebookFrame::OnSplitView, this);

        controlSizer->Add(btnAdd, 0, wxRIGHT, 5);
        controlSizer->Add(btnRemove, 0, wxRIGHT, 5);
        controlSizer->Add(btnSplit, 0, wxRIGHT, 20);

        // Style options
        controlSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Tab Style:"), 0, wxALIGN_CENTER_VERTICAL | wxRIGHT, 5);

        wxButton* btnTop = new wxButton(mainPanel, wxID_ANY, "Top");
        wxButton* btnBottom = new wxButton(mainPanel, wxID_ANY, "Bottom");

        btnTop->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { SetTabPosition(wxAUI_NB_TOP); });
        btnBottom->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { SetTabPosition(wxAUI_NB_BOTTOM); });

        controlSizer->Add(btnTop, 0, wxRIGHT, 2);
        controlSizer->Add(btnBottom, 0);

        mainSizer->Add(controlSizer, 0, wxALL, 5);

        // AuiNotebook
        m_notebook = new wxAuiNotebook(mainPanel, wxID_ANY, wxDefaultPosition, wxDefaultSize,
                                        wxAUI_NB_DEFAULT_STYLE | wxAUI_NB_TAB_EXTERNAL_MOVE | wxAUI_NB_CLOSE_ON_ALL_TABS);

        // Create initial tabs like KiCad editor panels
        CreateSchematicTab();
        CreatePCBTab();
        CreateSymbolTab();
        CreateFootprintTab();

        mainSizer->Add(m_notebook, 1, wxEXPAND | wxALL, 5);

        // Event log
        mainSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Event Log"), 0, wxLEFT | wxTOP, 5);
        m_log = new wxTextCtrl(mainPanel, wxID_ANY, "", wxDefaultPosition, wxSize(-1, 80),
                               wxTE_MULTILINE | wxTE_READONLY);
        mainSizer->Add(m_log, 0, wxEXPAND | wxALL, 5);

        mainPanel->SetSizer(mainSizer);

        // Bind notebook events
        m_notebook->Bind(wxEVT_AUINOTEBOOK_PAGE_CHANGED, &AuiNotebookFrame::OnPageChanged, this);
        m_notebook->Bind(wxEVT_AUINOTEBOOK_PAGE_CLOSE, &AuiNotebookFrame::OnPageClose, this);
        m_notebook->Bind(wxEVT_AUINOTEBOOK_TAB_RIGHT_DOWN, &AuiNotebookFrame::OnTabRightClick, this);

        // Status bar
        CreateStatusBar();
        SetStatusText("AuiNotebook test app started");

        Log("AuiNotebook test app started");
        Log("4 tabs created: Schematic, PCB, Symbol, Footprint");

        m_tabCounter = 5;
    }

private:
    void CreateSchematicTab()
    {
        wxPanel* panel = new wxPanel(m_notebook);
        wxBoxSizer* sizer = new wxBoxSizer(wxVERTICAL);

        sizer->Add(new wxStaticText(panel, wxID_ANY, "Schematic Editor"), 0, wxALL, 10);
        sizer->Add(new wxStaticText(panel, wxID_ANY, "This simulates the KiCad Schematic Editor tab."), 0, wxLEFT, 10);

        wxTextCtrl* content = new wxTextCtrl(panel, wxID_ANY,
            "Components:\n- U1: STM32F103\n- R1-R10: 10k Resistors\n- C1-C5: 100nF Capacitors\n- J1: USB Connector",
            wxDefaultPosition, wxDefaultSize, wxTE_MULTILINE | wxTE_READONLY);
        sizer->Add(content, 1, wxEXPAND | wxALL, 10);

        panel->SetSizer(sizer);
        m_notebook->AddPage(panel, "Schematic", true);
    }

    void CreatePCBTab()
    {
        wxPanel* panel = new wxPanel(m_notebook);
        wxBoxSizer* sizer = new wxBoxSizer(wxVERTICAL);

        sizer->Add(new wxStaticText(panel, wxID_ANY, "PCB Editor"), 0, wxALL, 10);
        sizer->Add(new wxStaticText(panel, wxID_ANY, "This simulates the KiCad PCB Editor tab."), 0, wxLEFT, 10);

        wxTextCtrl* content = new wxTextCtrl(panel, wxID_ANY,
            "Board Info:\n- Size: 100mm x 80mm\n- Layers: 4 (F.Cu, In1.Cu, In2.Cu, B.Cu)\n- Track Width: 0.25mm\n- Via Size: 0.8mm",
            wxDefaultPosition, wxDefaultSize, wxTE_MULTILINE | wxTE_READONLY);
        sizer->Add(content, 1, wxEXPAND | wxALL, 10);

        panel->SetSizer(sizer);
        m_notebook->AddPage(panel, "PCB", false);
    }

    void CreateSymbolTab()
    {
        wxPanel* panel = new wxPanel(m_notebook);
        wxBoxSizer* sizer = new wxBoxSizer(wxVERTICAL);

        sizer->Add(new wxStaticText(panel, wxID_ANY, "Symbol Editor"), 0, wxALL, 10);
        sizer->Add(new wxStaticText(panel, wxID_ANY, "This simulates the KiCad Symbol Editor tab."), 0, wxLEFT, 10);

        wxTextCtrl* content = new wxTextCtrl(panel, wxID_ANY,
            "Symbol: STM32F103\n- Pins: 48\n- Units: 4 (A, B, C, D)\n- Power Pins: VCC, GND\n- Library: MCU_ST_STM32",
            wxDefaultPosition, wxDefaultSize, wxTE_MULTILINE | wxTE_READONLY);
        sizer->Add(content, 1, wxEXPAND | wxALL, 10);

        panel->SetSizer(sizer);
        m_notebook->AddPage(panel, "Symbol", false);
    }

    void CreateFootprintTab()
    {
        wxPanel* panel = new wxPanel(m_notebook);
        wxBoxSizer* sizer = new wxBoxSizer(wxVERTICAL);

        sizer->Add(new wxStaticText(panel, wxID_ANY, "Footprint Editor"), 0, wxALL, 10);
        sizer->Add(new wxStaticText(panel, wxID_ANY, "This simulates the KiCad Footprint Editor tab."), 0, wxLEFT, 10);

        wxTextCtrl* content = new wxTextCtrl(panel, wxID_ANY,
            "Footprint: LQFP-48\n- Pads: 48\n- Pitch: 0.5mm\n- Package: 7x7mm\n- Library: Package_QFP",
            wxDefaultPosition, wxDefaultSize, wxTE_MULTILINE | wxTE_READONLY);
        sizer->Add(content, 1, wxEXPAND | wxALL, 10);

        panel->SetSizer(sizer);
        m_notebook->AddPage(panel, "Footprint", false);
    }

    void Log(const wxString& msg)
    {
        m_log->AppendText(msg + "\n");
    }

    void OnAddTab(wxCommandEvent& event)
    {
        wxPanel* panel = new wxPanel(m_notebook);
        wxBoxSizer* sizer = new wxBoxSizer(wxVERTICAL);

        wxString tabName = wxString::Format("Tab %d", m_tabCounter++);
        sizer->Add(new wxStaticText(panel, wxID_ANY, tabName), 0, wxALL, 10);
        sizer->Add(new wxStaticText(panel, wxID_ANY, "New dynamically created tab"), 0, wxLEFT, 10);

        panel->SetSizer(sizer);
        m_notebook->AddPage(panel, tabName, true);

        Log(wxString::Format("Added new tab: %s", tabName));
    }

    void OnRemoveTab(wxCommandEvent& event)
    {
        int selection = m_notebook->GetSelection();
        if (selection != wxNOT_FOUND && m_notebook->GetPageCount() > 1)
        {
            wxString tabName = m_notebook->GetPageText(selection);
            m_notebook->DeletePage(selection);
            Log(wxString::Format("Removed tab: %s", tabName));
        }
    }

    void OnSplitView(wxCommandEvent& event)
    {
        // wxAuiNotebook supports split views natively
        Log("Split view requested (drag tab to edge to split)");
    }

    void SetTabPosition(int style)
    {
        long currentStyle = m_notebook->GetWindowStyleFlag();
        currentStyle &= ~(wxAUI_NB_TOP | wxAUI_NB_BOTTOM);
        currentStyle |= style;
        m_notebook->SetWindowStyleFlag(currentStyle);
        m_notebook->Refresh();

        Log(style == wxAUI_NB_TOP ? "Tabs moved to top" : "Tabs moved to bottom");
    }

    void OnPageChanged(wxAuiNotebookEvent& event)
    {
        int sel = event.GetSelection();
        if (sel != wxNOT_FOUND)
        {
            Log(wxString::Format("Tab changed to: %s", m_notebook->GetPageText(sel)));
        }
    }

    void OnPageClose(wxAuiNotebookEvent& event)
    {
        int sel = event.GetSelection();
        if (sel != wxNOT_FOUND)
        {
            Log(wxString::Format("Tab closing: %s", m_notebook->GetPageText(sel)));
        }
    }

    void OnTabRightClick(wxAuiNotebookEvent& event)
    {
        Log("Tab right-clicked (context menu would appear)");
    }

    wxAuiNotebook* m_notebook;
    wxTextCtrl* m_log;
    int m_tabCounter;
};

class AuiNotebookApp : public wxApp
{
public:
    virtual bool OnInit() override
    {
        AuiNotebookFrame* frame = new AuiNotebookFrame();
        frame->Show();
        return true;
    }
};

wxIMPLEMENT_APP(AuiNotebookApp);
