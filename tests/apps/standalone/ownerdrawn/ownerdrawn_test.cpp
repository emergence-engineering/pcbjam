// wxOwnerDrawnComboBox Test - Custom dropdown rendering like KiCad's layer/font selectors
// Tests: wxOwnerDrawnComboBox, OnDrawItem, OnMeasureItem, custom rendering

#include "wx/wx.h"
#include "wx/odcombo.h"
#include "wx/dcmemory.h"

// Custom owner-drawn combo box for layer selection (like KiCad LAYER_BOX_SELECTOR)
class LayerComboBox : public wxOwnerDrawnComboBox
{
public:
    LayerComboBox(wxWindow* parent, wxWindowID id = wxID_ANY)
        : wxOwnerDrawnComboBox(parent, id, wxEmptyString, wxDefaultPosition,
                                wxSize(200, -1), 0, nullptr, wxCB_READONLY)
    {
        // Add layers with colors
        Append("F.Cu");       m_colors.push_back(*wxRED);
        Append("B.Cu");       m_colors.push_back(*wxBLUE);
        Append("F.SilkS");    m_colors.push_back(*wxYELLOW);
        Append("B.SilkS");    m_colors.push_back(wxColour(255, 0, 255));
        Append("F.Mask");     m_colors.push_back(wxColour(0, 128, 0));
        Append("B.Mask");     m_colors.push_back(wxColour(0, 128, 128));
        Append("Edge.Cuts");  m_colors.push_back(*wxWHITE);
        Append("Dwgs.User");  m_colors.push_back(wxColour(128, 128, 128));

        SetSelection(0);
    }

    virtual void OnDrawItem(wxDC& dc, const wxRect& rect, int item, int flags) const override
    {
        if (item == wxNOT_FOUND)
            return;

        // Draw background
        if (flags & wxODCB_PAINTING_SELECTED)
        {
            dc.SetBrush(wxBrush(wxSystemSettings::GetColour(wxSYS_COLOUR_HIGHLIGHT)));
            dc.SetPen(*wxTRANSPARENT_PEN);
            dc.DrawRectangle(rect);
            dc.SetTextForeground(*wxWHITE);
        }
        else
        {
            dc.SetTextForeground(*wxBLACK);
        }

        // Draw color swatch
        wxRect swatchRect(rect.x + 4, rect.y + 4, 20, rect.height - 8);
        dc.SetBrush(wxBrush(m_colors[item]));
        dc.SetPen(*wxBLACK_PEN);
        dc.DrawRectangle(swatchRect);

        // Draw text
        wxString text = GetString(item);
        dc.DrawText(text, rect.x + 30, rect.y + (rect.height - dc.GetCharHeight()) / 2);
    }

    virtual wxCoord OnMeasureItem(size_t item) const override
    {
        return 24;  // Fixed item height
    }

    virtual wxCoord OnMeasureItemWidth(size_t item) const override
    {
        return -1;  // Use default width
    }

private:
    std::vector<wxColour> m_colors;
};

// Custom owner-drawn combo box for fonts (like KiCad FONT_CHOICE)
class FontComboBox : public wxOwnerDrawnComboBox
{
public:
    FontComboBox(wxWindow* parent, wxWindowID id = wxID_ANY)
        : wxOwnerDrawnComboBox(parent, id, wxEmptyString, wxDefaultPosition,
                                wxSize(200, -1), 0, nullptr, wxCB_READONLY)
    {
        // Add sample fonts
        Append("Default");
        Append("Arial");
        Append("Times New Roman");
        Append("Courier New");
        Append("Verdana");
        Append("Georgia");
        Append("Comic Sans MS");
        Append("Impact");

        SetSelection(0);
    }

    virtual void OnDrawItem(wxDC& dc, const wxRect& rect, int item, int flags) const override
    {
        if (item == wxNOT_FOUND)
            return;

        // Draw background
        if (flags & wxODCB_PAINTING_SELECTED)
        {
            dc.SetBrush(wxBrush(wxSystemSettings::GetColour(wxSYS_COLOUR_HIGHLIGHT)));
            dc.SetPen(*wxTRANSPARENT_PEN);
            dc.DrawRectangle(rect);
            dc.SetTextForeground(*wxWHITE);
        }
        else
        {
            dc.SetTextForeground(*wxBLACK);
        }

        // Draw text in the font itself (if not Default)
        wxString fontName = GetString(item);
        wxFont font = dc.GetFont();
        if (fontName != "Default")
        {
            font.SetFaceName(fontName);
        }
        dc.SetFont(font);
        dc.DrawText(fontName, rect.x + 6, rect.y + (rect.height - dc.GetCharHeight()) / 2);
    }

    virtual wxCoord OnMeasureItem(size_t item) const override
    {
        return 26;  // Slightly taller for fonts
    }
};

// Custom owner-drawn combo box with icons (for footprints)
class IconComboBox : public wxOwnerDrawnComboBox
{
public:
    IconComboBox(wxWindow* parent, wxWindowID id = wxID_ANY)
        : wxOwnerDrawnComboBox(parent, id, wxEmptyString, wxDefaultPosition,
                                wxSize(250, -1), 0, nullptr, wxCB_READONLY)
    {
        // Add items with different icon types
        Append("Resistor");    m_types.push_back(0);  // Rectangle
        Append("Capacitor");   m_types.push_back(1);  // Two lines
        Append("Inductor");    m_types.push_back(2);  // Coil
        Append("Diode");       m_types.push_back(3);  // Triangle
        Append("Transistor");  m_types.push_back(4);  // Complex
        Append("IC Package");  m_types.push_back(5);  // Square with pins
        Append("Connector");   m_types.push_back(6);  // Dots

        SetSelection(0);
    }

    virtual void OnDrawItem(wxDC& dc, const wxRect& rect, int item, int flags) const override
    {
        if (item == wxNOT_FOUND)
            return;

        // Draw background
        if (flags & wxODCB_PAINTING_SELECTED)
        {
            dc.SetBrush(wxBrush(wxSystemSettings::GetColour(wxSYS_COLOUR_HIGHLIGHT)));
            dc.SetPen(*wxTRANSPARENT_PEN);
            dc.DrawRectangle(rect);
            dc.SetTextForeground(*wxWHITE);
        }
        else
        {
            dc.SetTextForeground(*wxBLACK);
        }

        // Draw icon based on type
        int iconX = rect.x + 4;
        int iconY = rect.y + 4;
        int iconSize = rect.height - 8;

        dc.SetPen(wxPen(*wxBLACK, 2));
        dc.SetBrush(*wxWHITE_BRUSH);

        int type = m_types[item];
        switch (type)
        {
            case 0: // Resistor - zigzag
                dc.DrawLine(iconX, iconY + iconSize/2, iconX + iconSize, iconY + iconSize/2);
                break;
            case 1: // Capacitor - two lines
                dc.DrawLine(iconX + iconSize/3, iconY + 2, iconX + iconSize/3, iconY + iconSize - 2);
                dc.DrawLine(iconX + 2*iconSize/3, iconY + 2, iconX + 2*iconSize/3, iconY + iconSize - 2);
                break;
            case 2: // Inductor - coil (3 bumps)
                dc.DrawArc(iconX + 4, iconY + iconSize/2, iconX + 10, iconY + iconSize/2, iconX + 7, iconY + iconSize/2 - 4);
                break;
            case 3: // Diode - triangle
                {
                    wxPoint pts[3] = {
                        wxPoint(iconX + 2, iconY + 2),
                        wxPoint(iconX + 2, iconY + iconSize - 2),
                        wxPoint(iconX + iconSize - 2, iconY + iconSize/2)
                    };
                    dc.DrawPolygon(3, pts);
                }
                break;
            case 4: // Transistor - circle with lines
                dc.DrawCircle(iconX + iconSize/2, iconY + iconSize/2, iconSize/3);
                break;
            case 5: // IC - square
                dc.DrawRectangle(iconX + 2, iconY + 2, iconSize - 4, iconSize - 4);
                break;
            case 6: // Connector - dots
                dc.SetBrush(*wxBLACK_BRUSH);
                dc.DrawCircle(iconX + iconSize/4, iconY + iconSize/2, 3);
                dc.DrawCircle(iconX + 3*iconSize/4, iconY + iconSize/2, 3);
                break;
        }

        // Draw text
        wxString text = GetString(item);
        dc.DrawText(text, rect.x + iconSize + 10, rect.y + (rect.height - dc.GetCharHeight()) / 2);
    }

    virtual wxCoord OnMeasureItem(size_t item) const override
    {
        return 28;
    }

private:
    std::vector<int> m_types;
};

class OwnerDrawnFrame : public wxFrame
{
public:
    OwnerDrawnFrame() : wxFrame(nullptr, wxID_ANY, "wxOwnerDrawnComboBox Test",
                                 wxDefaultPosition, wxSize(700, 600))
    {
        wxPanel* mainPanel = new wxPanel(this);
        wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

        // Description
        wxStaticText* desc = new wxStaticText(mainPanel, wxID_ANY,
            "KiCad uses wxOwnerDrawnComboBox for layer selectors and font choosers.\n"
            "Tests: Custom item drawing, variable heights, icons + text.");
        mainSizer->Add(desc, 0, wxALL, 5);

        // Layer selector
        wxStaticBoxSizer* layerSizer = new wxStaticBoxSizer(wxVERTICAL, mainPanel, "Layer Selector (Color Swatches)");
        m_layerCombo = new LayerComboBox(mainPanel);
        m_layerCombo->Bind(wxEVT_COMBOBOX, &OwnerDrawnFrame::OnLayerChanged, this);
        layerSizer->Add(m_layerCombo, 0, wxALL, 5);
        m_layerLabel = new wxStaticText(mainPanel, wxID_ANY, "Selected: F.Cu");
        layerSizer->Add(m_layerLabel, 0, wxALL, 5);
        mainSizer->Add(layerSizer, 0, wxEXPAND | wxALL, 5);

        // Font selector
        wxStaticBoxSizer* fontSizer = new wxStaticBoxSizer(wxVERTICAL, mainPanel, "Font Selector (Font Preview)");
        m_fontCombo = new FontComboBox(mainPanel);
        m_fontCombo->Bind(wxEVT_COMBOBOX, &OwnerDrawnFrame::OnFontChanged, this);
        fontSizer->Add(m_fontCombo, 0, wxALL, 5);
        m_fontLabel = new wxStaticText(mainPanel, wxID_ANY, "Selected: Default");
        fontSizer->Add(m_fontLabel, 0, wxALL, 5);
        mainSizer->Add(fontSizer, 0, wxEXPAND | wxALL, 5);

        // Icon selector
        wxStaticBoxSizer* iconSizer = new wxStaticBoxSizer(wxVERTICAL, mainPanel, "Component Selector (Icons)");
        m_iconCombo = new IconComboBox(mainPanel);
        m_iconCombo->Bind(wxEVT_COMBOBOX, &OwnerDrawnFrame::OnIconChanged, this);
        iconSizer->Add(m_iconCombo, 0, wxALL, 5);
        m_iconLabel = new wxStaticText(mainPanel, wxID_ANY, "Selected: Resistor");
        iconSizer->Add(m_iconLabel, 0, wxALL, 5);
        mainSizer->Add(iconSizer, 0, wxEXPAND | wxALL, 5);

        // Event log
        mainSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Event Log"), 0, wxLEFT | wxTOP, 5);
        m_log = new wxTextCtrl(mainPanel, wxID_ANY, "", wxDefaultPosition, wxSize(-1, 150),
                               wxTE_MULTILINE | wxTE_READONLY);
        mainSizer->Add(m_log, 1, wxEXPAND | wxALL, 5);

        mainPanel->SetSizer(mainSizer);

        CreateStatusBar();
        SetStatusText("Owner-drawn combo box test app started");
        Log("Owner-drawn combo box test app started");
        Log("Each dropdown shows custom-rendered items");
    }

private:
    void OnLayerChanged(wxCommandEvent& event)
    {
        int sel = m_layerCombo->GetSelection();
        wxString layer = sel != wxNOT_FOUND ? m_layerCombo->GetString(sel) : "";
        m_layerLabel->SetLabel("Selected: " + layer);
        Log("Layer changed to: " + layer);
    }

    void OnFontChanged(wxCommandEvent& event)
    {
        int sel = m_fontCombo->GetSelection();
        wxString font = sel != wxNOT_FOUND ? m_fontCombo->GetString(sel) : "";
        m_fontLabel->SetLabel("Selected: " + font);
        Log("Font changed to: " + font);
    }

    void OnIconChanged(wxCommandEvent& event)
    {
        int sel = m_iconCombo->GetSelection();
        wxString component = sel != wxNOT_FOUND ? m_iconCombo->GetString(sel) : "";
        m_iconLabel->SetLabel("Selected: " + component);
        Log("Component changed to: " + component);
    }

    void Log(const wxString& msg)
    {
        m_log->AppendText(msg + "\n");
    }

    LayerComboBox* m_layerCombo;
    FontComboBox* m_fontCombo;
    IconComboBox* m_iconCombo;
    wxStaticText* m_layerLabel;
    wxStaticText* m_fontLabel;
    wxStaticText* m_iconLabel;
    wxTextCtrl* m_log;
};

class OwnerDrawnApp : public wxApp
{
public:
    virtual bool OnInit() override
    {
        OwnerDrawnFrame* frame = new OwnerDrawnFrame();
        frame->Show();
        return true;
    }
};

wxIMPLEMENT_APP(OwnerDrawnApp);
