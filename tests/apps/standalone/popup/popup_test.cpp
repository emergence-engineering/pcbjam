// wxPopupWindow Test - Transient popups like KiCad's toolbar palettes and status popups
// Tests: wxPopupWindow, wxPopupTransientWindow, positioning, auto-dismiss

#include "wx/wx.h"
#include "wx/popupwin.h"

// Simple popup window (like KiCad STATUS_POPUP)
class StatusPopup : public wxPopupWindow
{
public:
    StatusPopup(wxWindow* parent, const wxString& message)
        : wxPopupWindow(parent, wxBORDER_SIMPLE)
    {
        wxPanel* panel = new wxPanel(this);
        panel->SetBackgroundColour(wxColour(255, 255, 200));  // Light yellow

        wxBoxSizer* sizer = new wxBoxSizer(wxVERTICAL);

        wxStaticText* text = new wxStaticText(panel, wxID_ANY, message);
        text->SetFont(text->GetFont().Bold());
        sizer->Add(text, 0, wxALL, 8);

        panel->SetSizer(sizer);
        sizer->Fit(panel);
        SetClientSize(panel->GetSize());
    }
};

// Transient popup with buttons (like KiCad ACTION_TOOLBAR_PALETTE)
class ToolPalettePopup : public wxPopupTransientWindow
{
public:
    ToolPalettePopup(wxWindow* parent, wxTextCtrl* log)
        : wxPopupTransientWindow(parent, wxBORDER_SIMPLE), m_log(log)
    {
        wxPanel* panel = new wxPanel(this);
        panel->SetBackgroundColour(wxColour(240, 240, 240));

        wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

        wxStaticText* title = new wxStaticText(panel, wxID_ANY, "Tool Palette");
        title->SetFont(title->GetFont().Bold());
        mainSizer->Add(title, 0, wxALL, 5);

        // Tool buttons
        wxGridSizer* buttonGrid = new wxGridSizer(3, 3, 2, 2);

        for (int i = 1; i <= 9; i++)
        {
            wxButton* btn = new wxButton(panel, 1000 + i,
                                          wxString::Format("T%d", i),
                                          wxDefaultPosition, wxSize(40, 40));
            btn->Bind(wxEVT_BUTTON, &ToolPalettePopup::OnToolClick, this);
            buttonGrid->Add(btn, 0);
        }

        mainSizer->Add(buttonGrid, 0, wxALL, 5);

        panel->SetSizer(mainSizer);
        mainSizer->Fit(panel);
        SetClientSize(panel->GetSize());
    }

private:
    void OnToolClick(wxCommandEvent& event)
    {
        int toolNum = event.GetId() - 1000;
        m_log->AppendText(wxString::Format("Tool %d clicked\n", toolNum));
        Dismiss();  // Close popup after selection
    }

    wxTextCtrl* m_log;
};

// Color picker popup (like KiCad color pickers)
class ColorPickerPopup : public wxPopupTransientWindow
{
public:
    ColorPickerPopup(wxWindow* parent, wxTextCtrl* log, wxPanel* swatch)
        : wxPopupTransientWindow(parent, wxBORDER_SIMPLE), m_log(log), m_swatch(swatch)
    {
        wxPanel* panel = new wxPanel(this);
        panel->SetBackgroundColour(*wxWHITE);

        wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

        wxStaticText* title = new wxStaticText(panel, wxID_ANY, "Select Color");
        mainSizer->Add(title, 0, wxALL, 5);

        // Color grid
        wxGridSizer* colorGrid = new wxGridSizer(4, 4, 2, 2);

        wxColour colors[] = {
            *wxRED, wxColour(255, 128, 0), *wxYELLOW, wxColour(128, 255, 0),
            *wxGREEN, wxColour(0, 255, 128), *wxCYAN, wxColour(0, 128, 255),
            *wxBLUE, wxColour(128, 0, 255), wxColour(255, 0, 255), wxColour(255, 0, 128),
            *wxBLACK, wxColour(64, 64, 64), wxColour(128, 128, 128), *wxWHITE
        };

        for (int i = 0; i < 16; i++)
        {
            wxPanel* colorBtn = new wxPanel(panel, 2000 + i, wxDefaultPosition, wxSize(30, 30));
            colorBtn->SetBackgroundColour(colors[i]);
            colorBtn->Bind(wxEVT_LEFT_DOWN, &ColorPickerPopup::OnColorClick, this);
            colorGrid->Add(colorBtn, 0);
        }

        mainSizer->Add(colorGrid, 0, wxALL, 5);

        panel->SetSizer(mainSizer);
        mainSizer->Fit(panel);
        SetClientSize(panel->GetSize());

        // Store colors for lookup
        for (int i = 0; i < 16; i++)
            m_colors[i] = colors[i];
    }

private:
    void OnColorClick(wxMouseEvent& event)
    {
        wxPanel* panel = dynamic_cast<wxPanel*>(event.GetEventObject());
        if (panel)
        {
            int colorIdx = panel->GetId() - 2000;
            wxColour color = m_colors[colorIdx];
            m_swatch->SetBackgroundColour(color);
            m_swatch->Refresh();
            m_log->AppendText(wxString::Format("Color selected: RGB(%d,%d,%d)\n",
                                                color.Red(), color.Green(), color.Blue()));
            Dismiss();
        }
    }

    wxTextCtrl* m_log;
    wxPanel* m_swatch;
    wxColour m_colors[16];
};

class PopupFrame : public wxFrame
{
public:
    PopupFrame() : wxFrame(nullptr, wxID_ANY, "wxPopupWindow Test",
                            wxDefaultPosition, wxSize(700, 600))
    {
        wxPanel* mainPanel = new wxPanel(this);
        wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

        // Description
        wxStaticText* desc = new wxStaticText(mainPanel, wxID_ANY,
            "KiCad uses popup windows for toolbar palettes and status messages.\n"
            "Tests: wxPopupWindow, wxPopupTransientWindow, positioning, dismiss.");
        mainSizer->Add(desc, 0, wxALL, 5);

        // Status popup section
        wxStaticBoxSizer* statusSizer = new wxStaticBoxSizer(wxHORIZONTAL, mainPanel, "Status Popup (stays until dismissed)");

        m_showStatusBtn = new wxButton(mainPanel, wxID_ANY, "Show Status Popup");
        m_showStatusBtn->Bind(wxEVT_BUTTON, &PopupFrame::OnShowStatusPopup, this);
        statusSizer->Add(m_showStatusBtn, 0, wxALL, 5);

        m_hideStatusBtn = new wxButton(mainPanel, wxID_ANY, "Hide Status Popup");
        m_hideStatusBtn->Bind(wxEVT_BUTTON, &PopupFrame::OnHideStatusPopup, this);
        m_hideStatusBtn->Enable(false);
        statusSizer->Add(m_hideStatusBtn, 0, wxALL, 5);

        mainSizer->Add(statusSizer, 0, wxEXPAND | wxALL, 5);

        // Tool palette section
        wxStaticBoxSizer* paletteSizer = new wxStaticBoxSizer(wxHORIZONTAL, mainPanel, "Tool Palette (transient - click outside to dismiss)");

        wxButton* showPaletteBtn = new wxButton(mainPanel, wxID_ANY, "Show Tool Palette");
        showPaletteBtn->Bind(wxEVT_BUTTON, &PopupFrame::OnShowToolPalette, this);
        paletteSizer->Add(showPaletteBtn, 0, wxALL, 5);

        mainSizer->Add(paletteSizer, 0, wxEXPAND | wxALL, 5);

        // Color picker section
        wxStaticBoxSizer* colorSizer = new wxStaticBoxSizer(wxHORIZONTAL, mainPanel, "Color Picker (transient popup)");

        m_colorSwatch = new wxPanel(mainPanel, wxID_ANY, wxDefaultPosition, wxSize(40, 40));
        m_colorSwatch->SetBackgroundColour(*wxRED);
        colorSizer->Add(m_colorSwatch, 0, wxALL, 5);

        wxButton* showColorBtn = new wxButton(mainPanel, wxID_ANY, "Pick Color...");
        showColorBtn->Bind(wxEVT_BUTTON, &PopupFrame::OnShowColorPicker, this);
        colorSizer->Add(showColorBtn, 0, wxALL | wxALIGN_CENTER_VERTICAL, 5);

        mainSizer->Add(colorSizer, 0, wxEXPAND | wxALL, 5);

        // Positioning section
        wxStaticBoxSizer* posSizer = new wxStaticBoxSizer(wxHORIZONTAL, mainPanel, "Popup Positioning");

        wxButton* posAboveBtn = new wxButton(mainPanel, wxID_ANY, "Popup Above Me");
        posAboveBtn->Bind(wxEVT_BUTTON, &PopupFrame::OnPopupAbove, this);
        posSizer->Add(posAboveBtn, 0, wxALL, 5);

        wxButton* posBelowBtn = new wxButton(mainPanel, wxID_ANY, "Popup Below Me");
        posBelowBtn->Bind(wxEVT_BUTTON, &PopupFrame::OnPopupBelow, this);
        posSizer->Add(posBelowBtn, 0, wxALL, 5);

        wxButton* posRightBtn = new wxButton(mainPanel, wxID_ANY, "Popup Right of Me");
        posRightBtn->Bind(wxEVT_BUTTON, &PopupFrame::OnPopupRight, this);
        posSizer->Add(posRightBtn, 0, wxALL, 5);

        mainSizer->Add(posSizer, 0, wxEXPAND | wxALL, 5);

        // Event log
        mainSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Event Log"), 0, wxLEFT | wxTOP, 5);
        m_log = new wxTextCtrl(mainPanel, wxID_ANY, "", wxDefaultPosition, wxSize(-1, 150),
                               wxTE_MULTILINE | wxTE_READONLY);
        mainSizer->Add(m_log, 1, wxEXPAND | wxALL, 5);

        mainPanel->SetSizer(mainSizer);

        CreateStatusBar();
        SetStatusText("Popup window test app started");
        Log("Popup window test app started");
    }

    ~PopupFrame()
    {
        if (m_statusPopup)
        {
            m_statusPopup->Destroy();
            m_statusPopup = nullptr;
        }
    }

private:
    void OnShowStatusPopup(wxCommandEvent& event)
    {
        if (!m_statusPopup)
        {
            m_statusPopup = new StatusPopup(this, "Status: Processing...\nPlease wait");
            wxPoint pos = m_showStatusBtn->GetScreenPosition();
            pos.y += m_showStatusBtn->GetSize().y + 5;
            m_statusPopup->SetPosition(pos);
            m_statusPopup->Show();
            m_hideStatusBtn->Enable(true);
            Log("Status popup shown");
        }
    }

    void OnHideStatusPopup(wxCommandEvent& event)
    {
        if (m_statusPopup)
        {
            m_statusPopup->Hide();
            m_statusPopup->Destroy();
            m_statusPopup = nullptr;
            m_hideStatusBtn->Enable(false);
            Log("Status popup hidden");
        }
    }

    void OnShowToolPalette(wxCommandEvent& event)
    {
        wxButton* btn = dynamic_cast<wxButton*>(event.GetEventObject());
        ToolPalettePopup* popup = new ToolPalettePopup(this, m_log);

        wxPoint pos = btn->GetScreenPosition();
        pos.y += btn->GetSize().y + 5;
        popup->SetPosition(pos);
        popup->Popup();
        Log("Tool palette shown (click outside to dismiss)");
    }

    void OnShowColorPicker(wxCommandEvent& event)
    {
        wxButton* btn = dynamic_cast<wxButton*>(event.GetEventObject());
        ColorPickerPopup* popup = new ColorPickerPopup(this, m_log, m_colorSwatch);

        wxPoint pos = btn->GetScreenPosition();
        pos.y += btn->GetSize().y + 5;
        popup->SetPosition(pos);
        popup->Popup();
        Log("Color picker shown");
    }

    void OnPopupAbove(wxCommandEvent& event)
    {
        ShowPositionedPopup(event, 0, -1);
    }

    void OnPopupBelow(wxCommandEvent& event)
    {
        ShowPositionedPopup(event, 0, 1);
    }

    void OnPopupRight(wxCommandEvent& event)
    {
        ShowPositionedPopup(event, 1, 0);
    }

    void ShowPositionedPopup(wxCommandEvent& event, int xDir, int yDir)
    {
        wxButton* btn = dynamic_cast<wxButton*>(event.GetEventObject());

        class SimpleTransientPopup : public wxPopupTransientWindow
        {
        public:
            SimpleTransientPopup(wxWindow* parent, const wxString& msg)
                : wxPopupTransientWindow(parent, wxBORDER_SIMPLE)
            {
                wxPanel* panel = new wxPanel(this);
                panel->SetBackgroundColour(wxColour(200, 220, 255));
                wxStaticText* text = new wxStaticText(panel, wxID_ANY, msg);
                wxBoxSizer* sizer = new wxBoxSizer(wxVERTICAL);
                sizer->Add(text, 0, wxALL, 10);
                panel->SetSizer(sizer);
                sizer->Fit(panel);
                SetClientSize(panel->GetSize());
            }
        };

        wxString direction;
        if (yDir < 0) direction = "Above";
        else if (yDir > 0) direction = "Below";
        else if (xDir > 0) direction = "Right";

        SimpleTransientPopup* popup = new SimpleTransientPopup(this, "Popup " + direction + "!");

        wxPoint pos = btn->GetScreenPosition();
        wxSize btnSize = btn->GetSize();
        wxSize popupSize = popup->GetSize();

        if (yDir < 0)
            pos.y -= popupSize.y + 5;
        else if (yDir > 0)
            pos.y += btnSize.y + 5;

        if (xDir > 0)
            pos.x += btnSize.x + 5;

        popup->SetPosition(pos);
        popup->Popup();
        Log("Positioned popup shown " + direction.Lower());
    }

    void Log(const wxString& msg)
    {
        m_log->AppendText(msg + "\n");
    }

    wxButton* m_showStatusBtn;
    wxButton* m_hideStatusBtn;
    wxPanel* m_colorSwatch;
    wxTextCtrl* m_log;
    StatusPopup* m_statusPopup = nullptr;
};

class PopupApp : public wxApp
{
public:
    virtual bool OnInit() override
    {
        PopupFrame* frame = new PopupFrame();
        frame->Show();
        return true;
    }
};

wxIMPLEMENT_APP(PopupApp);
