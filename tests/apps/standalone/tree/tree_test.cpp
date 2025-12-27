// wxTreeCtrl Test - Tests tree control in WASM
// KiCad uses tree controls for hierarchy browsers (components, nets, etc.)

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/treectrl.h"
#include "wx/imaglist.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

class TreeTestApp : public wxApp
{
public:
    virtual bool OnInit() override;
};

class TreeTestFrame : public wxFrame
{
public:
    TreeTestFrame();

private:
    wxTreeCtrl* m_tree;
    wxTextCtrl* m_log;

    void LogEvent(const wxString& msg);
    void PopulateTree();

    void OnSelChanged(wxTreeEvent& evt);
    void OnItemExpanding(wxTreeEvent& evt);
    void OnItemCollapsing(wxTreeEvent& evt);
    void OnItemActivated(wxTreeEvent& evt);
    void OnExpandAll(wxCommandEvent& evt);
    void OnCollapseAll(wxCommandEvent& evt);
    void OnAddItem(wxCommandEvent& evt);
    void OnDeleteItem(wxCommandEvent& evt);

    wxDECLARE_EVENT_TABLE();
};

enum {
    ID_TREE = wxID_HIGHEST + 1,
    ID_EXPAND_ALL,
    ID_COLLAPSE_ALL,
    ID_ADD_ITEM,
    ID_DELETE_ITEM
};

wxBEGIN_EVENT_TABLE(TreeTestFrame, wxFrame)
    EVT_TREE_SEL_CHANGED(ID_TREE, TreeTestFrame::OnSelChanged)
    EVT_TREE_ITEM_EXPANDING(ID_TREE, TreeTestFrame::OnItemExpanding)
    EVT_TREE_ITEM_COLLAPSING(ID_TREE, TreeTestFrame::OnItemCollapsing)
    EVT_TREE_ITEM_ACTIVATED(ID_TREE, TreeTestFrame::OnItemActivated)
    EVT_BUTTON(ID_EXPAND_ALL, TreeTestFrame::OnExpandAll)
    EVT_BUTTON(ID_COLLAPSE_ALL, TreeTestFrame::OnCollapseAll)
    EVT_BUTTON(ID_ADD_ITEM, TreeTestFrame::OnAddItem)
    EVT_BUTTON(ID_DELETE_ITEM, TreeTestFrame::OnDeleteItem)
wxEND_EVENT_TABLE()

wxIMPLEMENT_APP(TreeTestApp);

bool TreeTestApp::OnInit()
{
    if (!wxApp::OnInit())
        return false;

    TreeTestFrame* frame = new TreeTestFrame();
    frame->Show(true);
    return true;
}

TreeTestFrame::TreeTestFrame()
    : wxFrame(nullptr, wxID_ANY, "wxTreeCtrl WASM Test",
              wxDefaultPosition, wxSize(600, 600))
{
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    wxStaticText* desc = new wxStaticText(this, wxID_ANY,
        "wxTreeCtrl Test\n\n"
        "KiCad uses tree controls for hierarchy browsers, component trees, and net lists.\n"
        "Click items to select, double-click to activate, +/- to expand/collapse.");
    mainSizer->Add(desc, 0, wxALL, 10);

    // Button bar
    wxBoxSizer* btnSizer = new wxBoxSizer(wxHORIZONTAL);
    btnSizer->Add(new wxButton(this, ID_EXPAND_ALL, "Expand All"), 0, wxALL, 5);
    btnSizer->Add(new wxButton(this, ID_COLLAPSE_ALL, "Collapse All"), 0, wxALL, 5);
    btnSizer->Add(new wxButton(this, ID_ADD_ITEM, "Add Item"), 0, wxALL, 5);
    btnSizer->Add(new wxButton(this, ID_DELETE_ITEM, "Delete Selected"), 0, wxALL, 5);
    mainSizer->Add(btnSizer, 0, wxALIGN_CENTER);

    // Tree control
    m_tree = new wxTreeCtrl(this, ID_TREE, wxDefaultPosition, wxSize(-1, 250),
        wxTR_DEFAULT_STYLE | wxTR_EDIT_LABELS);
    mainSizer->Add(m_tree, 1, wxEXPAND | wxALL, 10);

    PopulateTree();

    // Event log
    wxStaticBoxSizer* logBox = new wxStaticBoxSizer(wxVERTICAL, this, "Event Log");
    m_log = new wxTextCtrl(this, wxID_ANY, "",
        wxDefaultPosition, wxSize(-1, 150), wxTE_MULTILINE | wxTE_READONLY);
    logBox->Add(m_log, 1, wxEXPAND | wxALL, 5);
    mainSizer->Add(logBox, 0, wxEXPAND | wxALL, 10);

    SetSizer(mainSizer);
    CreateStatusBar();
    SetStatusText("Ready");

    LogEvent("Tree test app started");
    LogEvent("Tree populated with KiCad-like hierarchy");

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[TREE_TEST] wxTreeCtrl test app started successfully');
    });
#endif
}

void TreeTestFrame::PopulateTree()
{
    // Create a KiCad-like component hierarchy
    wxTreeItemId root = m_tree->AddRoot("Project: MyBoard");

    // Schematic hierarchy
    wxTreeItemId schematic = m_tree->AppendItem(root, "Schematic");
    wxTreeItemId sheet1 = m_tree->AppendItem(schematic, "Sheet 1 - Main");
    m_tree->AppendItem(sheet1, "U1 - MCU");
    m_tree->AppendItem(sheet1, "U2 - Power Regulator");
    m_tree->AppendItem(sheet1, "C1-C10 - Capacitors");
    m_tree->AppendItem(sheet1, "R1-R20 - Resistors");

    wxTreeItemId sheet2 = m_tree->AppendItem(schematic, "Sheet 2 - IO");
    m_tree->AppendItem(sheet2, "J1 - USB Connector");
    m_tree->AppendItem(sheet2, "J2 - GPIO Header");
    m_tree->AppendItem(sheet2, "LED1-LED4 - Status LEDs");

    // PCB hierarchy
    wxTreeItemId pcb = m_tree->AppendItem(root, "PCB");
    wxTreeItemId layers = m_tree->AppendItem(pcb, "Layers");
    m_tree->AppendItem(layers, "F.Cu - Front Copper");
    m_tree->AppendItem(layers, "B.Cu - Back Copper");
    m_tree->AppendItem(layers, "F.SilkS - Front Silkscreen");
    m_tree->AppendItem(layers, "B.SilkS - Back Silkscreen");
    m_tree->AppendItem(layers, "Edge.Cuts - Board Outline");

    wxTreeItemId nets = m_tree->AppendItem(pcb, "Nets");
    m_tree->AppendItem(nets, "GND (45 pads)");
    m_tree->AppendItem(nets, "VCC (12 pads)");
    m_tree->AppendItem(nets, "3V3 (8 pads)");
    m_tree->AppendItem(nets, "SDA (4 pads)");
    m_tree->AppendItem(nets, "SCL (4 pads)");

    // Libraries
    wxTreeItemId libraries = m_tree->AppendItem(root, "Libraries");
    m_tree->AppendItem(libraries, "Device.lib");
    m_tree->AppendItem(libraries, "Connector.lib");
    m_tree->AppendItem(libraries, "MCU_ST.lib");

    m_tree->Expand(root);
    m_tree->Expand(schematic);
    m_tree->Expand(pcb);
}

void TreeTestFrame::LogEvent(const wxString& msg)
{
#ifdef __EMSCRIPTEN__
    // Always log to console, even during early initialization
    EM_ASM({
        console.log('[TREE_EVENT] ' + UTF8ToString($0));
    }, msg.c_str().AsChar());
#endif

    // Guard against events firing before m_log is initialized
    if (!m_log)
        return;
    m_log->AppendText(msg + "\n");
    SetStatusText(msg);
}

void TreeTestFrame::OnSelChanged(wxTreeEvent& evt)
{
    wxTreeItemId item = evt.GetItem();
    if (item.IsOk()) {
        LogEvent(wxString::Format("Selection changed: '%s'", m_tree->GetItemText(item)));
    }
}

void TreeTestFrame::OnItemExpanding(wxTreeEvent& evt)
{
    wxTreeItemId item = evt.GetItem();
    if (item.IsOk()) {
        LogEvent(wxString::Format("Expanding: '%s'", m_tree->GetItemText(item)));
    }
}

void TreeTestFrame::OnItemCollapsing(wxTreeEvent& evt)
{
    wxTreeItemId item = evt.GetItem();
    if (item.IsOk()) {
        LogEvent(wxString::Format("Collapsing: '%s'", m_tree->GetItemText(item)));
    }
}

void TreeTestFrame::OnItemActivated(wxTreeEvent& evt)
{
    wxTreeItemId item = evt.GetItem();
    if (item.IsOk()) {
        LogEvent(wxString::Format("Activated (double-click): '%s'", m_tree->GetItemText(item)));
    }
}

void TreeTestFrame::OnExpandAll(wxCommandEvent& WXUNUSED(evt))
{
    m_tree->ExpandAll();
    LogEvent("All items expanded");
}

void TreeTestFrame::OnCollapseAll(wxCommandEvent& WXUNUSED(evt))
{
    m_tree->CollapseAll();
    LogEvent("All items collapsed");
}

void TreeTestFrame::OnAddItem(wxCommandEvent& WXUNUSED(evt))
{
    wxTreeItemId sel = m_tree->GetSelection();
    if (sel.IsOk()) {
        static int itemNum = 1;
        wxTreeItemId newItem = m_tree->AppendItem(sel,
            wxString::Format("New Item %d", itemNum++));
        m_tree->Expand(sel);
        m_tree->SelectItem(newItem);
        LogEvent(wxString::Format("Added new item under '%s'", m_tree->GetItemText(sel)));
    } else {
        LogEvent("No item selected - select a parent first");
    }
}

void TreeTestFrame::OnDeleteItem(wxCommandEvent& WXUNUSED(evt))
{
    wxTreeItemId sel = m_tree->GetSelection();
    if (sel.IsOk() && sel != m_tree->GetRootItem()) {
        wxString itemText = m_tree->GetItemText(sel);
        m_tree->Delete(sel);
        LogEvent(wxString::Format("Deleted item: '%s'", itemText));
    } else {
        LogEvent("Cannot delete root or no item selected");
    }
}
