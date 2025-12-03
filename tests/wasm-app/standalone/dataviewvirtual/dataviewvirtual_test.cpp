// wxDataViewCtrl Virtual Mode Test - Zone Manager/Net Inspector simulation
// Tests wxDataViewCtrl with virtual data model for large datasets

#include "wx/wx.h"
#include "wx/dataview.h"
#include "wx/splitter.h"

// Virtual data model for large datasets (like Zone Manager or Net Inspector)
class VirtualNetModel : public wxDataViewVirtualListModel
{
public:
    VirtualNetModel(int itemCount = 10000) : m_itemCount(itemCount)
    {
        // Pre-generate some sample data patterns
        m_netClasses = {"Default", "Power", "Signal", "Clock", "Differential"};
    }

    virtual unsigned int GetColumnCount() const override { return 4; }

    virtual wxString GetColumnType(unsigned int col) const override
    {
        return "string";
    }

    virtual unsigned int GetCount() const override { return m_itemCount; }

    virtual void GetValueByRow(wxVariant& variant, unsigned int row, unsigned int col) const override
    {
        switch (col)
        {
            case 0: // Net Name
                variant = wxString::Format("NET_%05d", row);
                break;
            case 1: // Net Class
                variant = m_netClasses[row % m_netClasses.size()];
                break;
            case 2: // Connection Count
                variant = wxString::Format("%d", (row * 7 + 3) % 50);
                break;
            case 3: // Length (mm)
                variant = wxString::Format("%.2f", (row * 13 + 5) % 1000 / 10.0);
                break;
        }
    }

    virtual bool SetValueByRow(const wxVariant& variant, unsigned int row, unsigned int col) override
    {
        return false; // Read-only for this test
    }

    void SetItemCount(int count)
    {
        m_itemCount = count;
        Reset(count);
    }

private:
    int m_itemCount;
    std::vector<wxString> m_netClasses;
};

// Zone model for Zone Manager simulation
class VirtualZoneModel : public wxDataViewVirtualListModel
{
public:
    VirtualZoneModel(int itemCount = 1000) : m_itemCount(itemCount)
    {
        m_layers = {"F.Cu", "B.Cu", "In1.Cu", "In2.Cu"};
        m_priorities = {"0", "1", "2", "3"};
    }

    virtual unsigned int GetColumnCount() const override { return 5; }

    virtual wxString GetColumnType(unsigned int col) const override
    {
        return "string";
    }

    virtual unsigned int GetCount() const override { return m_itemCount; }

    virtual void GetValueByRow(wxVariant& variant, unsigned int row, unsigned int col) const override
    {
        switch (col)
        {
            case 0: // Zone Name
                variant = wxString::Format("Zone_%03d", row);
                break;
            case 1: // Net
                variant = wxString::Format("NET_%04d", row % 500);
                break;
            case 2: // Layer
                variant = m_layers[row % m_layers.size()];
                break;
            case 3: // Priority
                variant = m_priorities[row % m_priorities.size()];
                break;
            case 4: // Area (mm²)
                variant = wxString::Format("%.1f", (row * 17 + 100) % 5000 / 10.0);
                break;
        }
    }

    virtual bool SetValueByRow(const wxVariant& variant, unsigned int row, unsigned int col) override
    {
        return false;
    }

    void SetItemCount(int count)
    {
        m_itemCount = count;
        Reset(count);
    }

private:
    int m_itemCount;
    std::vector<wxString> m_layers;
    std::vector<wxString> m_priorities;
};

class DataViewVirtualFrame : public wxFrame
{
public:
    DataViewVirtualFrame() : wxFrame(nullptr, wxID_ANY, "wxDataViewCtrl Virtual Mode Test",
                                      wxDefaultPosition, wxSize(1200, 700))
    {
        wxPanel* mainPanel = new wxPanel(this);
        wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

        // Description
        wxStaticText* desc = new wxStaticText(mainPanel, wxID_ANY,
            "KiCad uses wxDataViewCtrl with virtual models for Zone Manager and Net Inspector.\n"
            "Virtual mode handles 10,000+ items efficiently by only creating visible rows.");
        mainSizer->Add(desc, 0, wxALL, 5);

        // Controls
        wxBoxSizer* controlSizer = new wxBoxSizer(wxHORIZONTAL);

        controlSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Item Count:"), 0, wxALIGN_CENTER_VERTICAL | wxRIGHT, 5);

        wxButton* btn100 = new wxButton(mainPanel, wxID_ANY, "100");
        wxButton* btn1000 = new wxButton(mainPanel, wxID_ANY, "1,000");
        wxButton* btn10000 = new wxButton(mainPanel, wxID_ANY, "10,000");
        wxButton* btn50000 = new wxButton(mainPanel, wxID_ANY, "50,000");

        btn100->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { SetNetCount(100); });
        btn1000->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { SetNetCount(1000); });
        btn10000->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { SetNetCount(10000); });
        btn50000->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { SetNetCount(50000); });

        controlSizer->Add(btn100, 0, wxRIGHT, 2);
        controlSizer->Add(btn1000, 0, wxRIGHT, 2);
        controlSizer->Add(btn10000, 0, wxRIGHT, 2);
        controlSizer->Add(btn50000, 0, wxRIGHT, 10);

        controlSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Scroll:"), 0, wxALIGN_CENTER_VERTICAL | wxRIGHT, 5);

        wxButton* btnTop = new wxButton(mainPanel, wxID_ANY, "Top");
        wxButton* btnMiddle = new wxButton(mainPanel, wxID_ANY, "Middle");
        wxButton* btnBottom = new wxButton(mainPanel, wxID_ANY, "Bottom");

        btnTop->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { ScrollTo(0); });
        btnMiddle->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { ScrollTo(m_netModel->GetCount() / 2); });
        btnBottom->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { ScrollTo(m_netModel->GetCount() - 1); });

        controlSizer->Add(btnTop, 0, wxRIGHT, 2);
        controlSizer->Add(btnMiddle, 0, wxRIGHT, 2);
        controlSizer->Add(btnBottom, 0);

        mainSizer->Add(controlSizer, 0, wxALL, 5);

        // Count label
        m_countLabel = new wxStaticText(mainPanel, wxID_ANY, "Current items: 10,000");
        mainSizer->Add(m_countLabel, 0, wxLEFT | wxBOTTOM, 5);

        // Splitter for two DataViewCtrls
        wxSplitterWindow* splitter = new wxSplitterWindow(mainPanel, wxID_ANY);

        // Net Inspector panel (left)
        wxPanel* netPanel = new wxPanel(splitter);
        wxBoxSizer* netSizer = new wxBoxSizer(wxVERTICAL);
        netSizer->Add(new wxStaticText(netPanel, wxID_ANY, "Net Inspector (Virtual List - 10,000 items)"), 0, wxBOTTOM, 5);

        m_netView = new wxDataViewCtrl(netPanel, wxID_ANY, wxDefaultPosition, wxDefaultSize,
                                        wxDV_ROW_LINES | wxDV_VERT_RULES);

        m_netModel = new VirtualNetModel(10000);
        m_netView->AssociateModel(m_netModel);
        m_netModel->DecRef(); // Model is now owned by the view

        m_netView->AppendTextColumn("Net Name", 0, wxDATAVIEW_CELL_INERT, 120);
        m_netView->AppendTextColumn("Net Class", 1, wxDATAVIEW_CELL_INERT, 100);
        m_netView->AppendTextColumn("Connections", 2, wxDATAVIEW_CELL_INERT, 100);
        m_netView->AppendTextColumn("Length (mm)", 3, wxDATAVIEW_CELL_INERT, 100);

        netSizer->Add(m_netView, 1, wxEXPAND);
        netPanel->SetSizer(netSizer);

        // Zone Manager panel (right)
        wxPanel* zonePanel = new wxPanel(splitter);
        wxBoxSizer* zoneSizer = new wxBoxSizer(wxVERTICAL);
        zoneSizer->Add(new wxStaticText(zonePanel, wxID_ANY, "Zone Manager (Virtual List - 1,000 items)"), 0, wxBOTTOM, 5);

        m_zoneView = new wxDataViewCtrl(zonePanel, wxID_ANY, wxDefaultPosition, wxDefaultSize,
                                         wxDV_ROW_LINES | wxDV_VERT_RULES);

        m_zoneModel = new VirtualZoneModel(1000);
        m_zoneView->AssociateModel(m_zoneModel);
        m_zoneModel->DecRef();

        m_zoneView->AppendTextColumn("Zone", 0, wxDATAVIEW_CELL_INERT, 80);
        m_zoneView->AppendTextColumn("Net", 1, wxDATAVIEW_CELL_INERT, 100);
        m_zoneView->AppendTextColumn("Layer", 2, wxDATAVIEW_CELL_INERT, 80);
        m_zoneView->AppendTextColumn("Priority", 3, wxDATAVIEW_CELL_INERT, 70);
        m_zoneView->AppendTextColumn("Area (mm²)", 4, wxDATAVIEW_CELL_INERT, 90);

        zoneSizer->Add(m_zoneView, 1, wxEXPAND);
        zonePanel->SetSizer(zoneSizer);

        splitter->SplitVertically(netPanel, zonePanel, 500);
        mainSizer->Add(splitter, 1, wxEXPAND | wxALL, 5);

        // Event log
        mainSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Event Log"), 0, wxLEFT | wxTOP, 5);
        m_log = new wxTextCtrl(mainPanel, wxID_ANY, "", wxDefaultPosition, wxSize(-1, 100),
                               wxTE_MULTILINE | wxTE_READONLY);
        mainSizer->Add(m_log, 0, wxEXPAND | wxALL, 5);

        mainPanel->SetSizer(mainSizer);

        // Bind selection events
        m_netView->Bind(wxEVT_DATAVIEW_SELECTION_CHANGED, &DataViewVirtualFrame::OnNetSelected, this);
        m_zoneView->Bind(wxEVT_DATAVIEW_SELECTION_CHANGED, &DataViewVirtualFrame::OnZoneSelected, this);

        // Status bar
        CreateStatusBar();
        SetStatusText("DataViewCtrl virtual mode test app started");

        Log("DataViewVirtual test app started");
        Log("Net Inspector: 10,000 virtual items");
        Log("Zone Manager: 1,000 virtual items");
    }

private:
    void Log(const wxString& msg)
    {
        m_log->AppendText(msg + "\n");
    }

    void SetNetCount(int count)
    {
        m_netModel->SetItemCount(count);
        m_countLabel->SetLabel(wxString::Format("Current items: %d", count));
        Log(wxString::Format("Net Inspector set to %d items", count));
    }

    void ScrollTo(int row)
    {
        wxDataViewItem item = m_netModel->GetItem(row);
        m_netView->EnsureVisible(item);
        Log(wxString::Format("Scrolled to row %d", row));
    }

    void OnNetSelected(wxDataViewEvent& event)
    {
        wxDataViewItem item = event.GetItem();
        if (item.IsOk())
        {
            int row = m_netModel->GetRow(item);
            wxVariant val;
            m_netModel->GetValueByRow(val, row, 0);
            Log(wxString::Format("Net selected: %s (row %d)", val.GetString(), row));
        }
    }

    void OnZoneSelected(wxDataViewEvent& event)
    {
        wxDataViewItem item = event.GetItem();
        if (item.IsOk())
        {
            int row = m_zoneModel->GetRow(item);
            wxVariant val;
            m_zoneModel->GetValueByRow(val, row, 0);
            Log(wxString::Format("Zone selected: %s (row %d)", val.GetString(), row));
        }
    }

    wxDataViewCtrl* m_netView;
    wxDataViewCtrl* m_zoneView;
    VirtualNetModel* m_netModel;
    VirtualZoneModel* m_zoneModel;
    wxStaticText* m_countLabel;
    wxTextCtrl* m_log;
};

class DataViewVirtualApp : public wxApp
{
public:
    virtual bool OnInit() override
    {
        DataViewVirtualFrame* frame = new DataViewVirtualFrame();
        frame->Show();
        return true;
    }
};

wxIMPLEMENT_APP(DataViewVirtualApp);
