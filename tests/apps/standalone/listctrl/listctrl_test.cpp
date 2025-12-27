// wxListCtrl Virtual Mode Test - Tests virtual list control in WASM
// KiCad uses virtual mode for large component lists (10000+ items)

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/notebook.h"
#include "wx/listctrl.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

// Virtual list control class
class VirtualListCtrl : public wxListCtrl
{
public:
    VirtualListCtrl(wxWindow* parent, wxWindowID id, int numItems = 10000);

    virtual wxString OnGetItemText(long item, long column) const override;
    virtual int OnGetItemImage(long item) const override;
    virtual wxListItemAttr* OnGetItemAttr(long item) const override;

    void SetItemCount(int count);
    int GetTotalItems() const { return m_numItems; }

private:
    int m_numItems;
    mutable wxListItemAttr m_attr;
};

VirtualListCtrl::VirtualListCtrl(wxWindow* parent, wxWindowID id, int numItems)
    : wxListCtrl(parent, id, wxDefaultPosition, wxDefaultSize,
                 wxLC_REPORT | wxLC_VIRTUAL | wxLC_SINGLE_SEL)
    , m_numItems(numItems)
{
    // Set up columns like KiCad component list
    InsertColumn(0, "Reference", wxLIST_FORMAT_LEFT, 100);
    InsertColumn(1, "Value", wxLIST_FORMAT_LEFT, 120);
    InsertColumn(2, "Footprint", wxLIST_FORMAT_LEFT, 180);
    InsertColumn(3, "Qty", wxLIST_FORMAT_CENTER, 50);

    SetItemCount(m_numItems);
}

wxString VirtualListCtrl::OnGetItemText(long item, long column) const
{
    switch (column) {
        case 0: // Reference
            if (item % 4 == 0) return wxString::Format("R%ld", item + 1);
            if (item % 4 == 1) return wxString::Format("C%ld", item + 1);
            if (item % 4 == 2) return wxString::Format("U%ld", item + 1);
            return wxString::Format("J%ld", item + 1);
        case 1: // Value
            if (item % 4 == 0) return wxString::Format("%dk", (item % 10) + 1);
            if (item % 4 == 1) return wxString::Format("%dnF", (item % 10 + 1) * 10);
            if (item % 4 == 2) return "STM32F103";
            return "USB-C";
        case 2: // Footprint
            if (item % 4 == 0) return "Resistor_SMD:R_0402";
            if (item % 4 == 1) return "Capacitor_SMD:C_0402";
            if (item % 4 == 2) return "Package_QFP:LQFP-48";
            return "Connector_USB:USB_C";
        case 3: // Qty
            return wxString::Format("%ld", (item % 5) + 1);
        default:
            return "";
    }
}

int VirtualListCtrl::OnGetItemImage(long WXUNUSED(item)) const
{
    return -1; // No images
}

wxListItemAttr* VirtualListCtrl::OnGetItemAttr(long item) const
{
    // Alternate row colors like KiCad
    if (item % 2 == 0) {
        m_attr.SetBackgroundColour(wxColour(245, 245, 245));
    } else {
        m_attr.SetBackgroundColour(*wxWHITE);
    }
    return &m_attr;
}

void VirtualListCtrl::SetItemCount(int count)
{
    m_numItems = count;
    wxListCtrl::SetItemCount(count);
}

// Main application
class ListCtrlTestApp : public wxApp
{
public:
    virtual bool OnInit() override;
};

class ListCtrlTestFrame : public wxFrame
{
public:
    ListCtrlTestFrame();

private:
    VirtualListCtrl* m_virtualList;
    wxListCtrl* m_normalList;
    wxTextCtrl* m_log;
    wxNotebook* m_notebook;
    wxStaticText* m_itemCountLabel;

    void LogEvent(const wxString& msg);
    void PopulateNormalList();

    void OnItemSelected(wxListEvent& evt);
    void OnItemActivated(wxListEvent& evt);
    void OnColumnClick(wxListEvent& evt);
    void OnSetItemCount(wxCommandEvent& evt);
    void OnScrollToItem(wxCommandEvent& evt);

    wxDECLARE_EVENT_TABLE();
};

enum {
    ID_VIRTUAL_LIST = wxID_HIGHEST + 1,
    ID_NORMAL_LIST,
    ID_SET_COUNT_100,
    ID_SET_COUNT_1000,
    ID_SET_COUNT_10000,
    ID_SET_COUNT_100000,
    ID_SCROLL_TOP,
    ID_SCROLL_MIDDLE,
    ID_SCROLL_BOTTOM
};

wxBEGIN_EVENT_TABLE(ListCtrlTestFrame, wxFrame)
    EVT_LIST_ITEM_SELECTED(ID_VIRTUAL_LIST, ListCtrlTestFrame::OnItemSelected)
    EVT_LIST_ITEM_ACTIVATED(ID_VIRTUAL_LIST, ListCtrlTestFrame::OnItemActivated)
    EVT_LIST_COL_CLICK(ID_VIRTUAL_LIST, ListCtrlTestFrame::OnColumnClick)
    EVT_LIST_ITEM_SELECTED(ID_NORMAL_LIST, ListCtrlTestFrame::OnItemSelected)
    EVT_BUTTON(ID_SET_COUNT_100, ListCtrlTestFrame::OnSetItemCount)
    EVT_BUTTON(ID_SET_COUNT_1000, ListCtrlTestFrame::OnSetItemCount)
    EVT_BUTTON(ID_SET_COUNT_10000, ListCtrlTestFrame::OnSetItemCount)
    EVT_BUTTON(ID_SET_COUNT_100000, ListCtrlTestFrame::OnSetItemCount)
    EVT_BUTTON(ID_SCROLL_TOP, ListCtrlTestFrame::OnScrollToItem)
    EVT_BUTTON(ID_SCROLL_MIDDLE, ListCtrlTestFrame::OnScrollToItem)
    EVT_BUTTON(ID_SCROLL_BOTTOM, ListCtrlTestFrame::OnScrollToItem)
wxEND_EVENT_TABLE()

wxIMPLEMENT_APP(ListCtrlTestApp);

bool ListCtrlTestApp::OnInit()
{
    if (!wxApp::OnInit())
        return false;

    ListCtrlTestFrame* frame = new ListCtrlTestFrame();
    frame->Show(true);
    return true;
}

ListCtrlTestFrame::ListCtrlTestFrame()
    : wxFrame(nullptr, wxID_ANY, "wxListCtrl Virtual Mode WASM Test",
              wxDefaultPosition, wxSize(800, 700))
{
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    wxStaticText* desc = new wxStaticText(this, wxID_ANY,
        "wxListCtrl Virtual Mode Test\n\n"
        "KiCad uses virtual mode wxListCtrl for large component lists.\n"
        "Virtual mode only creates items on-demand for visible rows.");
    mainSizer->Add(desc, 0, wxALL, 10);

    // Controls bar
    wxStaticBoxSizer* ctrlBox = new wxStaticBoxSizer(wxHORIZONTAL, this, "Virtual List Controls");

    ctrlBox->Add(new wxStaticText(this, wxID_ANY, "Item Count:"), 0, wxALIGN_CENTER_VERTICAL | wxALL, 5);
    ctrlBox->Add(new wxButton(this, ID_SET_COUNT_100, "100"), 0, wxALL, 2);
    ctrlBox->Add(new wxButton(this, ID_SET_COUNT_1000, "1,000"), 0, wxALL, 2);
    ctrlBox->Add(new wxButton(this, ID_SET_COUNT_10000, "10,000"), 0, wxALL, 2);
    ctrlBox->Add(new wxButton(this, ID_SET_COUNT_100000, "100,000"), 0, wxALL, 2);

    ctrlBox->AddSpacer(20);

    ctrlBox->Add(new wxStaticText(this, wxID_ANY, "Scroll:"), 0, wxALIGN_CENTER_VERTICAL | wxALL, 5);
    ctrlBox->Add(new wxButton(this, ID_SCROLL_TOP, "Top"), 0, wxALL, 2);
    ctrlBox->Add(new wxButton(this, ID_SCROLL_MIDDLE, "Middle"), 0, wxALL, 2);
    ctrlBox->Add(new wxButton(this, ID_SCROLL_BOTTOM, "Bottom"), 0, wxALL, 2);

    mainSizer->Add(ctrlBox, 0, wxEXPAND | wxALL, 10);

    // Item count display
    m_itemCountLabel = new wxStaticText(this, wxID_ANY, "Current items: 10,000");
    mainSizer->Add(m_itemCountLabel, 0, wxLEFT, 15);

    // Notebook with two tabs
    m_notebook = new wxNotebook(this, wxID_ANY);

    // Tab 1: Virtual List
    wxPanel* virtualPanel = new wxPanel(m_notebook);
    wxBoxSizer* virtualSizer = new wxBoxSizer(wxVERTICAL);

    m_virtualList = new VirtualListCtrl(virtualPanel, ID_VIRTUAL_LIST, 10000);
    virtualSizer->Add(m_virtualList, 1, wxEXPAND | wxALL, 5);

    virtualPanel->SetSizer(virtualSizer);
    m_notebook->AddPage(virtualPanel, "Virtual List (10,000 items)");

    // Tab 2: Normal List (for comparison)
    wxPanel* normalPanel = new wxPanel(m_notebook);
    wxBoxSizer* normalSizer = new wxBoxSizer(wxVERTICAL);

    m_normalList = new wxListCtrl(normalPanel, ID_NORMAL_LIST,
        wxDefaultPosition, wxDefaultSize, wxLC_REPORT | wxLC_SINGLE_SEL);
    m_normalList->InsertColumn(0, "Reference", wxLIST_FORMAT_LEFT, 100);
    m_normalList->InsertColumn(1, "Value", wxLIST_FORMAT_LEFT, 120);
    normalSizer->Add(m_normalList, 1, wxEXPAND | wxALL, 5);

    normalPanel->SetSizer(normalSizer);
    m_notebook->AddPage(normalPanel, "Normal List (100 items)");

    mainSizer->Add(m_notebook, 1, wxEXPAND | wxALL, 10);

    // Event log
    wxStaticBoxSizer* logBox = new wxStaticBoxSizer(wxVERTICAL, this, "Event Log");
    m_log = new wxTextCtrl(this, wxID_ANY, "",
        wxDefaultPosition, wxSize(-1, 100), wxTE_MULTILINE | wxTE_READONLY);
    logBox->Add(m_log, 1, wxEXPAND | wxALL, 5);
    mainSizer->Add(logBox, 0, wxEXPAND | wxALL, 10);

    SetSizer(mainSizer);
    CreateStatusBar();
    SetStatusText("Ready - Virtual ListCtrl test");

    PopulateNormalList();

    LogEvent("ListCtrl test app started");
    LogEvent("Virtual list: 10,000 items (only visible rows created)");

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[LISTCTRL_TEST] wxListCtrl virtual mode test app started successfully');
    });
#endif
}

void ListCtrlTestFrame::PopulateNormalList()
{
    for (int i = 0; i < 100; i++) {
        long idx = m_normalList->InsertItem(i, wxString::Format("Item %d", i + 1));
        m_normalList->SetItem(idx, 1, wxString::Format("Value %d", i + 1));
    }
}

void ListCtrlTestFrame::LogEvent(const wxString& msg)
{
#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[LISTCTRL_EVENT] ' + UTF8ToString($0));
    }, msg.c_str().AsChar());
#endif

    if (!m_log)
        return;
    m_log->AppendText(msg + "\n");
    SetStatusText(msg);
}

void ListCtrlTestFrame::OnItemSelected(wxListEvent& evt)
{
    wxString listName = (evt.GetId() == ID_VIRTUAL_LIST) ? "Virtual" : "Normal";
    LogEvent(wxString::Format("%s list: Selected item %ld", listName, evt.GetIndex()));
}

void ListCtrlTestFrame::OnItemActivated(wxListEvent& evt)
{
    LogEvent(wxString::Format("Virtual list: Activated item %ld (double-click)", evt.GetIndex()));
}

void ListCtrlTestFrame::OnColumnClick(wxListEvent& evt)
{
    LogEvent(wxString::Format("Column %d clicked (would sort)", evt.GetColumn()));
}

void ListCtrlTestFrame::OnSetItemCount(wxCommandEvent& evt)
{
    int count = 0;
    switch (evt.GetId()) {
        case ID_SET_COUNT_100: count = 100; break;
        case ID_SET_COUNT_1000: count = 1000; break;
        case ID_SET_COUNT_10000: count = 10000; break;
        case ID_SET_COUNT_100000: count = 100000; break;
    }

    m_virtualList->SetItemCount(count);

    wxString countStr;
    if (count >= 1000) {
        countStr = wxString::Format("%d,%03d", count / 1000, count % 1000);
    } else {
        countStr = wxString::Format("%d", count);
    }
    m_itemCountLabel->SetLabel(wxString::Format("Current items: %s", countStr));

    // Update tab name
    m_notebook->SetPageText(0, wxString::Format("Virtual List (%s items)", countStr));

    LogEvent(wxString::Format("Set virtual list to %s items", countStr));
}

void ListCtrlTestFrame::OnScrollToItem(wxCommandEvent& evt)
{
    int totalItems = m_virtualList->GetTotalItems();
    long targetItem = 0;

    switch (evt.GetId()) {
        case ID_SCROLL_TOP:
            targetItem = 0;
            break;
        case ID_SCROLL_MIDDLE:
            targetItem = totalItems / 2;
            break;
        case ID_SCROLL_BOTTOM:
            targetItem = totalItems - 1;
            break;
    }

    m_virtualList->EnsureVisible(targetItem);
    m_virtualList->SetItemState(targetItem, wxLIST_STATE_SELECTED, wxLIST_STATE_SELECTED);

    LogEvent(wxString::Format("Scrolled to item %ld", targetItem));
}
