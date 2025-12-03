// wxGrid Cell Editing Test - Property editing simulation
// Tests wxGrid with editable cells for KiCad property panels

#include "wx/wx.h"
#include "wx/grid.h"

class GridEditFrame : public wxFrame
{
public:
    GridEditFrame() : wxFrame(nullptr, wxID_ANY, "wxGrid Cell Editing Test",
                               wxDefaultPosition, wxSize(900, 600))
    {
        wxPanel* mainPanel = new wxPanel(this);
        wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

        // Description
        wxStaticText* desc = new wxStaticText(mainPanel, wxID_ANY,
            "KiCad uses wxGrid for editable property tables.\n"
            "Tests cell editing with different editor types: text, number, choice, checkbox.");
        mainSizer->Add(desc, 0, wxALL, 5);

        // Controls
        wxBoxSizer* controlSizer = new wxBoxSizer(wxHORIZONTAL);

        wxButton* btnAdd = new wxButton(mainPanel, wxID_ANY, "Add Row");
        wxButton* btnDelete = new wxButton(mainPanel, wxID_ANY, "Delete Row");
        wxButton* btnClear = new wxButton(mainPanel, wxID_ANY, "Clear Selection");

        btnAdd->Bind(wxEVT_BUTTON, &GridEditFrame::OnAddRow, this);
        btnDelete->Bind(wxEVT_BUTTON, &GridEditFrame::OnDeleteRow, this);
        btnClear->Bind(wxEVT_BUTTON, &GridEditFrame::OnClearSelection, this);

        controlSizer->Add(btnAdd, 0, wxRIGHT, 5);
        controlSizer->Add(btnDelete, 0, wxRIGHT, 5);
        controlSizer->Add(btnClear, 0);

        mainSizer->Add(controlSizer, 0, wxALL, 5);

        // Create grid
        m_grid = new wxGrid(mainPanel, wxID_ANY);
        m_grid->CreateGrid(10, 5);

        // Set column headers
        m_grid->SetColLabelValue(0, "Reference");
        m_grid->SetColLabelValue(1, "Value");
        m_grid->SetColLabelValue(2, "Footprint");
        m_grid->SetColLabelValue(3, "Quantity");
        m_grid->SetColLabelValue(4, "DNP");

        // Set column widths
        m_grid->SetColSize(0, 100);
        m_grid->SetColSize(1, 120);
        m_grid->SetColSize(2, 200);
        m_grid->SetColSize(3, 80);
        m_grid->SetColSize(4, 60);

        // Set up cell editors
        // Column 0-2: Text editors (default)
        // Column 3: Number editor
        m_grid->SetColFormatNumber(3);

        // Column 4: Boolean editor (checkbox)
        m_grid->SetColFormatBool(4);

        // Populate with KiCad-like component data
        PopulateGrid();

        // Set up choice editor for footprint column
        wxString footprints[] = {
            "Resistor_SMD:R_0402", "Resistor_SMD:R_0603", "Resistor_SMD:R_0805",
            "Capacitor_SMD:C_0402", "Capacitor_SMD:C_0603", "Capacitor_SMD:C_0805",
            "Package_QFP:LQFP-48", "Package_QFP:LQFP-64", "Package_QFP:LQFP-100"
        };
        wxGridCellChoiceEditor* choiceEditor = new wxGridCellChoiceEditor(9, footprints);
        m_grid->SetColAttr(2, new wxGridCellAttr());
        m_grid->GetOrCreateCellAttr(0, 2)->SetEditor(choiceEditor);

        mainSizer->Add(m_grid, 1, wxEXPAND | wxALL, 5);

        // Event log
        mainSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Event Log"), 0, wxLEFT | wxTOP, 5);
        m_log = new wxTextCtrl(mainPanel, wxID_ANY, "", wxDefaultPosition, wxSize(-1, 100),
                               wxTE_MULTILINE | wxTE_READONLY);
        mainSizer->Add(m_log, 0, wxEXPAND | wxALL, 5);

        mainPanel->SetSizer(mainSizer);

        // Bind grid events
        m_grid->Bind(wxEVT_GRID_CELL_CHANGED, &GridEditFrame::OnCellChanged, this);
        m_grid->Bind(wxEVT_GRID_SELECT_CELL, &GridEditFrame::OnCellSelected, this);
        m_grid->Bind(wxEVT_GRID_EDITOR_SHOWN, &GridEditFrame::OnEditorShown, this);
        m_grid->Bind(wxEVT_GRID_EDITOR_HIDDEN, &GridEditFrame::OnEditorHidden, this);

        // Status bar
        CreateStatusBar();
        SetStatusText("Grid editing test app started");

        Log("Grid editing test app started");
        Log("Double-click cells to edit. Use choice dropdown for Footprint column.");
    }

private:
    void PopulateGrid()
    {
        // Reference, Value, Footprint, Quantity, DNP
        SetRow(0, "R1", "10k", "Resistor_SMD:R_0402", "1", "0");
        SetRow(1, "R2", "4.7k", "Resistor_SMD:R_0402", "1", "0");
        SetRow(2, "R3", "100", "Resistor_SMD:R_0603", "2", "0");
        SetRow(3, "C1", "100nF", "Capacitor_SMD:C_0402", "1", "0");
        SetRow(4, "C2", "10uF", "Capacitor_SMD:C_0805", "1", "0");
        SetRow(5, "U1", "STM32F103", "Package_QFP:LQFP-48", "1", "0");
        SetRow(6, "U2", "74HC595", "Package_QFP:LQFP-64", "1", "1");
        SetRow(7, "J1", "USB-C", "Connector_USB:USB_C", "1", "0");
        SetRow(8, "D1", "LED_Red", "LED_SMD:LED_0603", "1", "0");
        SetRow(9, "Q1", "2N7002", "Package_TO:SOT-23", "1", "0");
    }

    void SetRow(int row, const wxString& ref, const wxString& val,
                const wxString& fp, const wxString& qty, const wxString& dnp)
    {
        m_grid->SetCellValue(row, 0, ref);
        m_grid->SetCellValue(row, 1, val);
        m_grid->SetCellValue(row, 2, fp);
        m_grid->SetCellValue(row, 3, qty);
        m_grid->SetCellValue(row, 4, dnp);
    }

    void Log(const wxString& msg)
    {
        m_log->AppendText(msg + "\n");
    }

    void OnAddRow(wxCommandEvent& event)
    {
        int newRow = m_grid->GetNumberRows();
        m_grid->AppendRows(1);
        m_grid->SetCellValue(newRow, 0, wxString::Format("NEW%d", newRow + 1));
        m_grid->SetCellValue(newRow, 3, "1");
        m_grid->SetCellValue(newRow, 4, "0");
        Log(wxString::Format("Added row %d", newRow));
    }

    void OnDeleteRow(wxCommandEvent& event)
    {
        int row = m_grid->GetGridCursorRow();
        if (row >= 0 && m_grid->GetNumberRows() > 1)
        {
            wxString ref = m_grid->GetCellValue(row, 0);
            m_grid->DeleteRows(row, 1);
            Log(wxString::Format("Deleted row: %s", ref));
        }
    }

    void OnClearSelection(wxCommandEvent& event)
    {
        m_grid->ClearSelection();
        Log("Selection cleared");
    }

    void OnCellChanged(wxGridEvent& event)
    {
        int row = event.GetRow();
        int col = event.GetCol();
        wxString value = m_grid->GetCellValue(row, col);
        wxString colName = m_grid->GetColLabelValue(col);
        Log(wxString::Format("Cell changed: [%d,%d] %s = '%s'", row, col, colName, value));
    }

    void OnCellSelected(wxGridEvent& event)
    {
        int row = event.GetRow();
        int col = event.GetCol();
        Log(wxString::Format("Cell selected: [%d,%d]", row, col));
        event.Skip();
    }

    void OnEditorShown(wxGridEvent& event)
    {
        int row = event.GetRow();
        int col = event.GetCol();
        Log(wxString::Format("Editor opened: [%d,%d]", row, col));
        event.Skip();
    }

    void OnEditorHidden(wxGridEvent& event)
    {
        Log("Editor closed");
        event.Skip();
    }

    wxGrid* m_grid;
    wxTextCtrl* m_log;
};

class GridEditApp : public wxApp
{
public:
    virtual bool OnInit() override
    {
        GridEditFrame* frame = new GridEditFrame();
        frame->Show();
        return true;
    }
};

wxIMPLEMENT_APP(GridEditApp);
