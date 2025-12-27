// wxGrid Custom Cell Renderers Test - KiCad-style grid cells
// Tests custom cell rendering: color cells, icon+text, checkboxes, striped rows

#include "wx/wx.h"
#include "wx/grid.h"
#include "wx/dcmemory.h"
#include "wx/notebook.h"

// Custom Color Cell Renderer - like KiCad's layer color swatches
class ColorCellRenderer : public wxGridCellRenderer
{
public:
    virtual void Draw(wxGrid& grid, wxGridCellAttr& attr, wxDC& dc,
                      const wxRect& rect, int row, int col, bool isSelected) override
    {
        wxGridCellRenderer::Draw(grid, attr, dc, rect, row, col, isSelected);

        wxString value = grid.GetCellValue(row, col);
        wxColour color;
        if (color.Set(value))
        {
            // Draw color swatch
            wxRect colorRect = rect;
            colorRect.Deflate(4);
            dc.SetBrush(wxBrush(color));
            dc.SetPen(*wxBLACK_PEN);
            dc.DrawRectangle(colorRect);
        }
    }

    virtual wxSize GetBestSize(wxGrid& grid, wxGridCellAttr& attr, wxDC& dc,
                               int row, int col) override
    {
        return wxSize(60, 20);
    }

    virtual wxGridCellRenderer* Clone() const override
    {
        return new ColorCellRenderer();
    }
};

// Custom Icon+Text Renderer - like KiCad's footprint list with icons
class IconTextRenderer : public wxGridCellStringRenderer
{
public:
    IconTextRenderer(const wxColour& iconColor = *wxBLUE) : m_iconColor(iconColor) {}

    virtual void Draw(wxGrid& grid, wxGridCellAttr& attr, wxDC& dc,
                      const wxRect& rect, int row, int col, bool isSelected) override
    {
        // Draw background
        wxGridCellStringRenderer::Draw(grid, attr, dc, rect, row, col, isSelected);

        // Draw icon (small colored square)
        wxRect iconRect(rect.x + 2, rect.y + 3, 14, 14);
        dc.SetBrush(wxBrush(m_iconColor));
        dc.SetPen(*wxBLACK_PEN);
        dc.DrawRectangle(iconRect);

        // Draw text offset by icon width
        wxRect textRect = rect;
        textRect.x += 20;
        textRect.width -= 20;

        dc.SetTextForeground(isSelected ? *wxWHITE : *wxBLACK);
        dc.DrawLabel(grid.GetCellValue(row, col), textRect, wxALIGN_LEFT | wxALIGN_CENTER_VERTICAL);
    }

    virtual wxGridCellRenderer* Clone() const override
    {
        return new IconTextRenderer(m_iconColor);
    }

private:
    wxColour m_iconColor;
};

// Striped Row Renderer - alternating row colors like KiCad's symbol editor
class StripedRenderer : public wxGridCellStringRenderer
{
public:
    virtual void Draw(wxGrid& grid, wxGridCellAttr& attr, wxDC& dc,
                      const wxRect& rect, int row, int col, bool isSelected) override
    {
        // Alternating background colors
        if (!isSelected)
        {
            wxColour bgColor = (row % 2 == 0) ? wxColour(255, 255, 255) : wxColour(240, 240, 245);
            dc.SetBrush(wxBrush(bgColor));
            dc.SetPen(*wxTRANSPARENT_PEN);
            dc.DrawRectangle(rect);
        }

        // Draw text
        wxGridCellStringRenderer::Draw(grid, attr, dc, rect, row, col, isSelected);
    }

    virtual wxGridCellRenderer* Clone() const override
    {
        return new StripedRenderer();
    }
};

class GridRenderersFrame : public wxFrame
{
public:
    GridRenderersFrame() : wxFrame(nullptr, wxID_ANY, "wxGrid Custom Cell Renderers Test",
                                    wxDefaultPosition, wxSize(1000, 600))
    {
        wxPanel* mainPanel = new wxPanel(this);
        wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

        // Description
        wxStaticText* desc = new wxStaticText(mainPanel, wxID_ANY,
            "KiCad uses custom grid cell renderers for color swatches, icons, and striped rows.\n"
            "Tests: Color cells, Icon+Text cells, Striped rows, Checkbox cells.");
        mainSizer->Add(desc, 0, wxALL, 5);

        // Create notebook with different grid examples
        m_notebook = new wxNotebook(mainPanel, wxID_ANY);

        // Tab 1: Color Cells (like KiCad layer manager)
        CreateColorGrid();

        // Tab 2: Icon + Text (like footprint browser)
        CreateIconTextGrid();

        // Tab 3: Striped rows with checkboxes
        CreateStripedGrid();

        mainSizer->Add(m_notebook, 1, wxEXPAND | wxALL, 5);

        // Event log
        mainSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Event Log"), 0, wxLEFT | wxTOP, 5);
        m_log = new wxTextCtrl(mainPanel, wxID_ANY, "", wxDefaultPosition, wxSize(-1, 80),
                               wxTE_MULTILINE | wxTE_READONLY);
        mainSizer->Add(m_log, 0, wxEXPAND | wxALL, 5);

        mainPanel->SetSizer(mainSizer);

        CreateStatusBar();
        SetStatusText("Grid renderers test app started");
        Log("Grid renderers test app started");
    }

private:
    void CreateColorGrid()
    {
        wxPanel* panel = new wxPanel(m_notebook);
        wxBoxSizer* sizer = new wxBoxSizer(wxVERTICAL);

        wxGrid* grid = new wxGrid(panel, wxID_ANY);
        grid->CreateGrid(8, 3);

        grid->SetColLabelValue(0, "Layer");
        grid->SetColLabelValue(1, "Color");
        grid->SetColLabelValue(2, "Visible");

        grid->SetColSize(0, 150);
        grid->SetColSize(1, 100);
        grid->SetColSize(2, 80);

        // Set up color renderer for column 1 (read-only display)
        wxGridCellAttr* colorAttr = new wxGridCellAttr();
        colorAttr->SetRenderer(new ColorCellRenderer());
        colorAttr->SetReadOnly(true);  // Display only - would need dialog to edit
        grid->SetColAttr(1, colorAttr);

        // Boolean column
        grid->SetColFormatBool(2);

        // Layer data
        const char* layers[] = {"F.Cu", "B.Cu", "F.SilkS", "B.SilkS", "F.Mask", "B.Mask", "Edge.Cuts", "Dwgs.User"};
        const char* colors[] = {"#FF0000", "#0000FF", "#FFFF00", "#FF00FF", "#00FF00", "#00FFFF", "#FFFFFF", "#808080"};

        for (int i = 0; i < 8; i++)
        {
            grid->SetCellValue(i, 0, layers[i]);
            grid->SetCellValue(i, 1, colors[i]);
            grid->SetCellValue(i, 2, "1");
        }

        grid->Bind(wxEVT_GRID_CELL_CHANGED, &GridRenderersFrame::OnCellChanged, this);

        sizer->Add(grid, 1, wxEXPAND | wxALL, 5);
        panel->SetSizer(sizer);
        m_notebook->AddPage(panel, "Color Cells");
        m_colorGrid = grid;
    }

    void CreateIconTextGrid()
    {
        wxPanel* panel = new wxPanel(m_notebook);
        wxBoxSizer* sizer = new wxBoxSizer(wxVERTICAL);

        wxGrid* grid = new wxGrid(panel, wxID_ANY);
        grid->CreateGrid(10, 3);

        grid->SetColLabelValue(0, "Component");
        grid->SetColLabelValue(1, "Footprint");
        grid->SetColLabelValue(2, "Library");

        grid->SetColSize(0, 180);
        grid->SetColSize(1, 250);
        grid->SetColSize(2, 150);

        // Set up icon+text renderer
        wxGridCellAttr* iconAttr = new wxGridCellAttr();
        iconAttr->SetRenderer(new IconTextRenderer(*wxRED));
        grid->SetColAttr(0, iconAttr);

        wxGridCellAttr* iconAttr2 = new wxGridCellAttr();
        iconAttr2->SetRenderer(new IconTextRenderer(wxColour(0, 128, 0)));
        grid->SetColAttr(1, iconAttr2);

        // Data
        const char* components[] = {"R_0402", "C_0603", "LED_0805", "STM32F4", "USB_C",
                                    "MOSFET_SOT23", "LDO_SOT223", "Crystal_3225", "Header_2x5", "Connector_JST"};
        const char* footprints[] = {"Resistor_SMD:R_0402", "Capacitor_SMD:C_0603", "LED_SMD:LED_0805",
                                    "Package_QFP:LQFP-100", "Connector_USB:USB_C",
                                    "Package_TO:SOT-23", "Package_TO:SOT-223", "Crystal:Crystal_3225",
                                    "Connector_Pin:2x5", "Connector_JST:JST_PH_4"};
        const char* libraries[] = {"Resistor_SMD", "Capacitor_SMD", "LED_SMD", "Package_QFP",
                                   "Connector_USB", "Package_TO", "Package_TO", "Crystal",
                                   "Connector_Pin", "Connector_JST"};

        for (int i = 0; i < 10; i++)
        {
            grid->SetCellValue(i, 0, components[i]);
            grid->SetCellValue(i, 1, footprints[i]);
            grid->SetCellValue(i, 2, libraries[i]);
        }

        sizer->Add(grid, 1, wxEXPAND | wxALL, 5);
        panel->SetSizer(sizer);
        m_notebook->AddPage(panel, "Icon+Text");
        m_iconGrid = grid;
    }

    void CreateStripedGrid()
    {
        wxPanel* panel = new wxPanel(m_notebook);
        wxBoxSizer* sizer = new wxBoxSizer(wxVERTICAL);

        wxGrid* grid = new wxGrid(panel, wxID_ANY);
        grid->CreateGrid(12, 4);

        grid->SetColLabelValue(0, "Reference");
        grid->SetColLabelValue(1, "Value");
        grid->SetColLabelValue(2, "DNP");
        grid->SetColLabelValue(3, "Excluded");

        grid->SetColSize(0, 100);
        grid->SetColSize(1, 150);
        grid->SetColSize(2, 80);
        grid->SetColSize(3, 80);

        // Apply striped renderer to text columns
        wxGridCellAttr* stripedAttr = new wxGridCellAttr();
        stripedAttr->SetRenderer(new StripedRenderer());
        grid->SetColAttr(0, stripedAttr);

        wxGridCellAttr* stripedAttr2 = new wxGridCellAttr();
        stripedAttr2->SetRenderer(new StripedRenderer());
        grid->SetColAttr(1, stripedAttr2);

        // Boolean columns
        grid->SetColFormatBool(2);
        grid->SetColFormatBool(3);

        // BOM-like data
        const char* refs[] = {"R1", "R2", "R3", "R4", "C1", "C2", "C3", "U1", "U2", "J1", "D1", "Q1"};
        const char* values[] = {"10k", "4.7k", "100", "1M", "100nF", "10uF", "22pF", "STM32F103",
                                "74HC595", "USB-C", "LED_Red", "2N7002"};
        const char* dnp[] = {"0", "0", "1", "0", "0", "0", "0", "0", "1", "0", "0", "0"};
        const char* excluded[] = {"0", "0", "0", "1", "0", "0", "0", "0", "0", "0", "0", "0"};

        for (int i = 0; i < 12; i++)
        {
            grid->SetCellValue(i, 0, refs[i]);
            grid->SetCellValue(i, 1, values[i]);
            grid->SetCellValue(i, 2, dnp[i]);
            grid->SetCellValue(i, 3, excluded[i]);
        }

        grid->Bind(wxEVT_GRID_CELL_CHANGED, &GridRenderersFrame::OnCellChanged, this);

        sizer->Add(grid, 1, wxEXPAND | wxALL, 5);
        panel->SetSizer(sizer);
        m_notebook->AddPage(panel, "Striped+Checkboxes");
        m_stripedGrid = grid;
    }

    void Log(const wxString& msg)
    {
        m_log->AppendText(msg + "\n");
    }

    void OnCellChanged(wxGridEvent& event)
    {
        wxGrid* grid = dynamic_cast<wxGrid*>(event.GetEventObject());
        if (grid)
        {
            int row = event.GetRow();
            int col = event.GetCol();
            wxString value = grid->GetCellValue(row, col);
            Log(wxString::Format("Cell [%d,%d] changed to: %s", row, col, value));
        }
    }

    wxNotebook* m_notebook;
    wxGrid* m_colorGrid;
    wxGrid* m_iconGrid;
    wxGrid* m_stripedGrid;
    wxTextCtrl* m_log;
};

class GridRenderersApp : public wxApp
{
public:
    virtual bool OnInit() override
    {
        GridRenderersFrame* frame = new GridRenderersFrame();
        frame->Show();
        return true;
    }
};

wxIMPLEMENT_APP(GridRenderersApp);
