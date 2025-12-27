// wxDataViewCtrl Test - Tests DataViewCtrl in WASM
// KiCad uses DataViewCtrl for Zone Manager, Net Inspector, Library browsers
// This is CRITICAL for KiCad functionality

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/dataview.h"
#include "wx/notebook.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

class DataViewTestApp : public wxApp
{
public:
    virtual bool OnInit() override;
};

class DataViewTestFrame : public wxFrame
{
public:
    DataViewTestFrame();

private:
    wxDataViewListCtrl* m_listCtrl;
    wxDataViewTreeCtrl* m_treeCtrl;
    wxTextCtrl* m_log;
    wxNotebook* m_notebook;

    void LogEvent(const wxString& msg);
    void PopulateList();
    void PopulateTree();

    // List events
    void OnListSelectionChanged(wxDataViewEvent& evt);
    void OnListItemActivated(wxDataViewEvent& evt);
    void OnListColumnHeaderClick(wxDataViewEvent& evt);
    void OnListItemStartEditing(wxDataViewEvent& evt);
    void OnListItemEditingDone(wxDataViewEvent& evt);

    // Tree events
    void OnTreeSelectionChanged(wxDataViewEvent& evt);
    void OnTreeItemExpanding(wxDataViewEvent& evt);
    void OnTreeItemCollapsing(wxDataViewEvent& evt);
    void OnTreeItemActivated(wxDataViewEvent& evt);

    // Button handlers
    void OnAddListItem(wxCommandEvent& evt);
    void OnRemoveListItem(wxCommandEvent& evt);
    void OnClearList(wxCommandEvent& evt);
    void OnExpandTree(wxCommandEvent& evt);
    void OnCollapseTree(wxCommandEvent& evt);
    void OnAddTreeItem(wxCommandEvent& evt);

    wxDECLARE_EVENT_TABLE();
};

enum {
    ID_LIST = wxID_HIGHEST + 1,
    ID_TREE,
    ID_ADD_LIST_ITEM,
    ID_REMOVE_LIST_ITEM,
    ID_CLEAR_LIST,
    ID_EXPAND_TREE,
    ID_COLLAPSE_TREE,
    ID_ADD_TREE_ITEM
};

wxBEGIN_EVENT_TABLE(DataViewTestFrame, wxFrame)
    // List events
    EVT_DATAVIEW_SELECTION_CHANGED(ID_LIST, DataViewTestFrame::OnListSelectionChanged)
    EVT_DATAVIEW_ITEM_ACTIVATED(ID_LIST, DataViewTestFrame::OnListItemActivated)
    EVT_DATAVIEW_COLUMN_HEADER_CLICK(ID_LIST, DataViewTestFrame::OnListColumnHeaderClick)
    EVT_DATAVIEW_ITEM_START_EDITING(ID_LIST, DataViewTestFrame::OnListItemStartEditing)
    EVT_DATAVIEW_ITEM_EDITING_DONE(ID_LIST, DataViewTestFrame::OnListItemEditingDone)
    // Tree events
    EVT_DATAVIEW_SELECTION_CHANGED(ID_TREE, DataViewTestFrame::OnTreeSelectionChanged)
    EVT_DATAVIEW_ITEM_EXPANDING(ID_TREE, DataViewTestFrame::OnTreeItemExpanding)
    EVT_DATAVIEW_ITEM_COLLAPSING(ID_TREE, DataViewTestFrame::OnTreeItemCollapsing)
    EVT_DATAVIEW_ITEM_ACTIVATED(ID_TREE, DataViewTestFrame::OnTreeItemActivated)
    // Buttons
    EVT_BUTTON(ID_ADD_LIST_ITEM, DataViewTestFrame::OnAddListItem)
    EVT_BUTTON(ID_REMOVE_LIST_ITEM, DataViewTestFrame::OnRemoveListItem)
    EVT_BUTTON(ID_CLEAR_LIST, DataViewTestFrame::OnClearList)
    EVT_BUTTON(ID_EXPAND_TREE, DataViewTestFrame::OnExpandTree)
    EVT_BUTTON(ID_COLLAPSE_TREE, DataViewTestFrame::OnCollapseTree)
    EVT_BUTTON(ID_ADD_TREE_ITEM, DataViewTestFrame::OnAddTreeItem)
wxEND_EVENT_TABLE()

wxIMPLEMENT_APP(DataViewTestApp);

bool DataViewTestApp::OnInit()
{
    if (!wxApp::OnInit())
        return false;

    DataViewTestFrame* frame = new DataViewTestFrame();
    frame->Show(true);
    return true;
}

DataViewTestFrame::DataViewTestFrame()
    : wxFrame(nullptr, wxID_ANY, "wxDataViewCtrl WASM Test",
              wxDefaultPosition, wxSize(800, 700))
{
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    wxStaticText* desc = new wxStaticText(this, wxID_ANY,
        "wxDataViewCtrl Test\n\n"
        "KiCad uses DataViewCtrl for Zone Manager, Net Inspector, and Library browsers.\n"
        "Test both list and tree views.");
    mainSizer->Add(desc, 0, wxALL, 10);

    // Notebook for list and tree tabs
    m_notebook = new wxNotebook(this, wxID_ANY);

    // === List Tab ===
    wxPanel* listPanel = new wxPanel(m_notebook);
    wxBoxSizer* listSizer = new wxBoxSizer(wxVERTICAL);

    // List button bar
    wxBoxSizer* listBtnSizer = new wxBoxSizer(wxHORIZONTAL);
    listBtnSizer->Add(new wxButton(listPanel, ID_ADD_LIST_ITEM, "Add Item"), 0, wxALL, 5);
    listBtnSizer->Add(new wxButton(listPanel, ID_REMOVE_LIST_ITEM, "Remove Selected"), 0, wxALL, 5);
    listBtnSizer->Add(new wxButton(listPanel, ID_CLEAR_LIST, "Clear All"), 0, wxALL, 5);
    listSizer->Add(listBtnSizer, 0, wxALIGN_CENTER);

    // DataViewListCtrl - like KiCad Zone Manager
    m_listCtrl = new wxDataViewListCtrl(listPanel, ID_LIST, wxDefaultPosition, wxSize(-1, 200));

    // Add columns similar to KiCad Zone Manager
    m_listCtrl->AppendTextColumn("Zone Name", wxDATAVIEW_CELL_EDITABLE, 150);
    m_listCtrl->AppendTextColumn("Net", wxDATAVIEW_CELL_INERT, 100);
    m_listCtrl->AppendTextColumn("Layer", wxDATAVIEW_CELL_INERT, 80);
    m_listCtrl->AppendTextColumn("Priority", wxDATAVIEW_CELL_EDITABLE, 60);
    m_listCtrl->AppendTextColumn("Fill Mode", wxDATAVIEW_CELL_INERT, 80);

    listSizer->Add(m_listCtrl, 1, wxEXPAND | wxALL, 10);
    listPanel->SetSizer(listSizer);
    m_notebook->AddPage(listPanel, "List View");

    // === Tree Tab ===
    wxPanel* treePanel = new wxPanel(m_notebook);
    wxBoxSizer* treeSizer = new wxBoxSizer(wxVERTICAL);

    // Tree button bar
    wxBoxSizer* treeBtnSizer = new wxBoxSizer(wxHORIZONTAL);
    treeBtnSizer->Add(new wxButton(treePanel, ID_EXPAND_TREE, "Expand All"), 0, wxALL, 5);
    treeBtnSizer->Add(new wxButton(treePanel, ID_COLLAPSE_TREE, "Collapse All"), 0, wxALL, 5);
    treeBtnSizer->Add(new wxButton(treePanel, ID_ADD_TREE_ITEM, "Add Item"), 0, wxALL, 5);
    treeSizer->Add(treeBtnSizer, 0, wxALIGN_CENTER);

    // DataViewTreeCtrl - like KiCad Library Browser
    m_treeCtrl = new wxDataViewTreeCtrl(treePanel, ID_TREE, wxDefaultPosition, wxSize(-1, 200));

    treeSizer->Add(m_treeCtrl, 1, wxEXPAND | wxALL, 10);
    treePanel->SetSizer(treeSizer);
    m_notebook->AddPage(treePanel, "Tree View");

    mainSizer->Add(m_notebook, 1, wxEXPAND | wxALL, 5);

    // Event log
    wxStaticBoxSizer* logBox = new wxStaticBoxSizer(wxVERTICAL, this, "Event Log");
    m_log = new wxTextCtrl(this, wxID_ANY, "",
        wxDefaultPosition, wxSize(-1, 150), wxTE_MULTILINE | wxTE_READONLY);
    logBox->Add(m_log, 1, wxEXPAND | wxALL, 5);
    mainSizer->Add(logBox, 0, wxEXPAND | wxALL, 10);

    SetSizer(mainSizer);
    CreateStatusBar();
    SetStatusText("Ready");

    // Populate controls
    PopulateList();
    PopulateTree();

    LogEvent("DataViewCtrl test app started");
    LogEvent("List populated with KiCad Zone Manager-like data");
    LogEvent("Tree populated with KiCad Library-like hierarchy");

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[DATAVIEW_TEST] wxDataViewCtrl test app started successfully');
    });
#endif
}

void DataViewTestFrame::PopulateList()
{
    // Add Zone Manager-like data
    wxVector<wxVariant> data;

    data.clear();
    data.push_back(wxVariant("Zone_GND_Top"));
    data.push_back(wxVariant("GND"));
    data.push_back(wxVariant("F.Cu"));
    data.push_back(wxVariant("0"));
    data.push_back(wxVariant("Solid"));
    m_listCtrl->AppendItem(data);

    data.clear();
    data.push_back(wxVariant("Zone_GND_Bottom"));
    data.push_back(wxVariant("GND"));
    data.push_back(wxVariant("B.Cu"));
    data.push_back(wxVariant("0"));
    data.push_back(wxVariant("Solid"));
    m_listCtrl->AppendItem(data);

    data.clear();
    data.push_back(wxVariant("Zone_VCC"));
    data.push_back(wxVariant("VCC"));
    data.push_back(wxVariant("F.Cu"));
    data.push_back(wxVariant("1"));
    data.push_back(wxVariant("Hatched"));
    m_listCtrl->AppendItem(data);

    data.clear();
    data.push_back(wxVariant("Zone_3V3"));
    data.push_back(wxVariant("3V3"));
    data.push_back(wxVariant("B.Cu"));
    data.push_back(wxVariant("2"));
    data.push_back(wxVariant("Hatched"));
    m_listCtrl->AppendItem(data);

    data.clear();
    data.push_back(wxVariant("Zone_Shield"));
    data.push_back(wxVariant("GND"));
    data.push_back(wxVariant("Edge.Cuts"));
    data.push_back(wxVariant("3"));
    data.push_back(wxVariant("Solid"));
    m_listCtrl->AppendItem(data);

    // Add more items for virtual scrolling test
    for (int i = 1; i <= 20; i++) {
        data.clear();
        data.push_back(wxVariant(wxString::Format("Zone_Custom_%d", i)));
        data.push_back(wxVariant(wxString::Format("Net_%d", i)));
        data.push_back(wxVariant("In1.Cu"));
        data.push_back(wxVariant(wxString::Format("%d", i + 3)));
        data.push_back(wxVariant("Solid"));
        m_listCtrl->AppendItem(data);
    }
}

void DataViewTestFrame::PopulateTree()
{
    // Create Library Browser-like hierarchy
    wxDataViewItem root = m_treeCtrl->AppendContainer(wxDataViewItem(), "Libraries");

    // Symbol Libraries
    wxDataViewItem symbols = m_treeCtrl->AppendContainer(root, "Symbol Libraries");
    wxDataViewItem device = m_treeCtrl->AppendContainer(symbols, "Device");
    m_treeCtrl->AppendItem(device, "R - Resistor");
    m_treeCtrl->AppendItem(device, "C - Capacitor");
    m_treeCtrl->AppendItem(device, "L - Inductor");
    m_treeCtrl->AppendItem(device, "D - Diode");
    m_treeCtrl->AppendItem(device, "LED");

    wxDataViewItem connector = m_treeCtrl->AppendContainer(symbols, "Connector");
    m_treeCtrl->AppendItem(connector, "Conn_01x02");
    m_treeCtrl->AppendItem(connector, "Conn_01x04");
    m_treeCtrl->AppendItem(connector, "USB_B");
    m_treeCtrl->AppendItem(connector, "USB_C");

    wxDataViewItem mcu = m_treeCtrl->AppendContainer(symbols, "MCU_ST");
    m_treeCtrl->AppendItem(mcu, "STM32F103C8");
    m_treeCtrl->AppendItem(mcu, "STM32F401RE");
    m_treeCtrl->AppendItem(mcu, "STM32G431KB");

    // Footprint Libraries
    wxDataViewItem footprints = m_treeCtrl->AppendContainer(root, "Footprint Libraries");
    wxDataViewItem resistors = m_treeCtrl->AppendContainer(footprints, "Resistor_SMD");
    m_treeCtrl->AppendItem(resistors, "R_0402");
    m_treeCtrl->AppendItem(resistors, "R_0603");
    m_treeCtrl->AppendItem(resistors, "R_0805");
    m_treeCtrl->AppendItem(resistors, "R_1206");

    wxDataViewItem capacitors = m_treeCtrl->AppendContainer(footprints, "Capacitor_SMD");
    m_treeCtrl->AppendItem(capacitors, "C_0402");
    m_treeCtrl->AppendItem(capacitors, "C_0603");
    m_treeCtrl->AppendItem(capacitors, "C_0805");

    // Expand root
    m_treeCtrl->Expand(root);
}

void DataViewTestFrame::LogEvent(const wxString& msg)
{
#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[DATAVIEW_EVENT] ' + UTF8ToString($0));
    }, msg.c_str().AsChar());
#endif

    if (!m_log)
        return;
    m_log->AppendText(msg + "\n");
    SetStatusText(msg);
}

// List event handlers
void DataViewTestFrame::OnListSelectionChanged(wxDataViewEvent& evt)
{
    wxDataViewItem item = evt.GetItem();
    if (item.IsOk()) {
        int row = m_listCtrl->ItemToRow(item);
        wxVariant val;
        m_listCtrl->GetValue(val, row, 0);
        LogEvent(wxString::Format("List: Selection changed to row %d: '%s'", row, val.GetString()));
    }
}

void DataViewTestFrame::OnListItemActivated(wxDataViewEvent& evt)
{
    wxDataViewItem item = evt.GetItem();
    if (item.IsOk()) {
        int row = m_listCtrl->ItemToRow(item);
        wxVariant val;
        m_listCtrl->GetValue(val, row, 0);
        LogEvent(wxString::Format("List: Item activated (double-click) row %d: '%s'", row, val.GetString()));
    }
}

void DataViewTestFrame::OnListColumnHeaderClick(wxDataViewEvent& evt)
{
    int col = evt.GetColumn();
    wxString colName = m_listCtrl->GetColumn(col)->GetTitle();
    LogEvent(wxString::Format("List: Column header clicked: '%s' (col %d)", colName, col));
}

void DataViewTestFrame::OnListItemStartEditing(wxDataViewEvent& evt)
{
    int row = m_listCtrl->ItemToRow(evt.GetItem());
    int col = evt.GetColumn();
    LogEvent(wxString::Format("List: Start editing row %d, col %d", row, col));
}

void DataViewTestFrame::OnListItemEditingDone(wxDataViewEvent& evt)
{
    int row = m_listCtrl->ItemToRow(evt.GetItem());
    int col = evt.GetColumn();
    wxString newVal = evt.GetValue().GetString();
    LogEvent(wxString::Format("List: Editing done row %d, col %d, new value: '%s'", row, col, newVal));
}

// Tree event handlers
void DataViewTestFrame::OnTreeSelectionChanged(wxDataViewEvent& evt)
{
    wxDataViewItem item = evt.GetItem();
    if (item.IsOk()) {
        wxString text = m_treeCtrl->GetItemText(item);
        LogEvent(wxString::Format("Tree: Selection changed to '%s'", text));
    }
}

void DataViewTestFrame::OnTreeItemExpanding(wxDataViewEvent& evt)
{
    wxDataViewItem item = evt.GetItem();
    if (item.IsOk()) {
        wxString text = m_treeCtrl->GetItemText(item);
        LogEvent(wxString::Format("Tree: Expanding '%s'", text));
    }
}

void DataViewTestFrame::OnTreeItemCollapsing(wxDataViewEvent& evt)
{
    wxDataViewItem item = evt.GetItem();
    if (item.IsOk()) {
        wxString text = m_treeCtrl->GetItemText(item);
        LogEvent(wxString::Format("Tree: Collapsing '%s'", text));
    }
}

void DataViewTestFrame::OnTreeItemActivated(wxDataViewEvent& evt)
{
    wxDataViewItem item = evt.GetItem();
    if (item.IsOk()) {
        wxString text = m_treeCtrl->GetItemText(item);
        LogEvent(wxString::Format("Tree: Item activated (double-click) '%s'", text));
    }
}

// Button handlers
void DataViewTestFrame::OnAddListItem(wxCommandEvent& WXUNUSED(evt))
{
    static int itemNum = 1;
    wxVector<wxVariant> data;
    data.push_back(wxVariant(wxString::Format("New_Zone_%d", itemNum)));
    data.push_back(wxVariant("NewNet"));
    data.push_back(wxVariant("F.Cu"));
    data.push_back(wxVariant(wxString::Format("%d", itemNum)));
    data.push_back(wxVariant("Solid"));
    m_listCtrl->AppendItem(data);
    LogEvent(wxString::Format("List: Added new item 'New_Zone_%d'", itemNum));
    itemNum++;
}

void DataViewTestFrame::OnRemoveListItem(wxCommandEvent& WXUNUSED(evt))
{
    int row = m_listCtrl->GetSelectedRow();
    if (row != wxNOT_FOUND) {
        wxVariant val;
        m_listCtrl->GetValue(val, row, 0);
        m_listCtrl->DeleteItem(row);
        LogEvent(wxString::Format("List: Removed item '%s' at row %d", val.GetString(), row));
    } else {
        LogEvent("List: No item selected to remove");
    }
}

void DataViewTestFrame::OnClearList(wxCommandEvent& WXUNUSED(evt))
{
    m_listCtrl->DeleteAllItems();
    LogEvent("List: All items cleared");
}

void DataViewTestFrame::OnExpandTree(wxCommandEvent& WXUNUSED(evt))
{
    // Expand all items by iterating
    wxDataViewItemArray children;
    m_treeCtrl->GetStore()->GetChildren(wxDataViewItem(), children);
    for (size_t i = 0; i < children.GetCount(); i++) {
        m_treeCtrl->Expand(children[i]);
        wxDataViewItemArray subChildren;
        m_treeCtrl->GetStore()->GetChildren(children[i], subChildren);
        for (size_t j = 0; j < subChildren.GetCount(); j++) {
            m_treeCtrl->Expand(subChildren[j]);
        }
    }
    LogEvent("Tree: All items expanded");
}

void DataViewTestFrame::OnCollapseTree(wxCommandEvent& WXUNUSED(evt))
{
    wxDataViewItemArray children;
    m_treeCtrl->GetStore()->GetChildren(wxDataViewItem(), children);
    for (size_t i = 0; i < children.GetCount(); i++) {
        m_treeCtrl->Collapse(children[i]);
    }
    LogEvent("Tree: All items collapsed");
}

void DataViewTestFrame::OnAddTreeItem(wxCommandEvent& WXUNUSED(evt))
{
    wxDataViewItem sel = m_treeCtrl->GetSelection();
    if (sel.IsOk()) {
        static int itemNum = 1;
        m_treeCtrl->AppendItem(sel, wxString::Format("New Item %d", itemNum++));
        m_treeCtrl->Expand(sel);
        LogEvent(wxString::Format("Tree: Added new item under '%s'", m_treeCtrl->GetItemText(sel)));
    } else {
        LogEvent("Tree: No item selected - select a parent first");
    }
}
