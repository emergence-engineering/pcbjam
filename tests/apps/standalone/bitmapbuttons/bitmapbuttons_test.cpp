// wxBitmapButton Test - Custom bitmap buttons like KiCad's toolbar
// Tests wxBitmapButton, disabled states, different icon shapes

#include "wx/wx.h"
#include "wx/dcmemory.h"
#include "wx/artprov.h"

// Helper to create simple bitmap icons
wxBitmap CreateIcon(const wxColour& color, int size = 24, const wxString& shape = "rect")
{
    wxBitmap bmp(size, size);
    wxMemoryDC dc(bmp);

    dc.SetBackground(wxBrush(wxColour(240, 240, 240)));
    dc.Clear();

    dc.SetPen(*wxBLACK_PEN);
    dc.SetBrush(wxBrush(color));

    if (shape == "circle")
    {
        dc.DrawCircle(size / 2, size / 2, size / 2 - 2);
    }
    else if (shape == "triangle")
    {
        wxPoint points[3] = {
            wxPoint(size / 2, 2),
            wxPoint(2, size - 2),
            wxPoint(size - 2, size - 2)
        };
        dc.DrawPolygon(3, points);
    }
    else if (shape == "diamond")
    {
        wxPoint points[4] = {
            wxPoint(size / 2, 2),
            wxPoint(2, size / 2),
            wxPoint(size / 2, size - 2),
            wxPoint(size - 2, size / 2)
        };
        dc.DrawPolygon(4, points);
    }
    else // rect
    {
        dc.DrawRectangle(2, 2, size - 4, size - 4);
    }

    return bmp;
}

// Create a "tool" icon with multiple elements
wxBitmap CreateToolIcon(const wxColour& mainColor, const wxString& symbol)
{
    int size = 24;
    wxBitmap bmp(size, size);
    wxMemoryDC dc(bmp);

    dc.SetBackground(wxBrush(wxColour(240, 240, 240)));
    dc.Clear();

    // Draw main shape
    dc.SetPen(wxPen(mainColor, 2));
    dc.SetBrush(*wxTRANSPARENT_BRUSH);
    dc.DrawRectangle(3, 3, 18, 18);

    // Draw symbol
    dc.SetFont(wxFont(10, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_BOLD));
    dc.SetTextForeground(mainColor);

    wxSize textSize = dc.GetTextExtent(symbol);
    dc.DrawText(symbol, (size - textSize.x) / 2, (size - textSize.y) / 2);

    return bmp;
}

class BitmapButtonsFrame : public wxFrame
{
public:
    BitmapButtonsFrame() : wxFrame(nullptr, wxID_ANY, "wxBitmapButton Test",
                                    wxDefaultPosition, wxSize(800, 600))
    {
        wxPanel* mainPanel = new wxPanel(this);
        wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

        // Description
        wxStaticText* desc = new wxStaticText(mainPanel, wxID_ANY,
            "KiCad uses wxBitmapButton extensively for toolbars and dialogs.\n"
            "Tests: Bitmap buttons, disabled states, icon buttons.");
        mainSizer->Add(desc, 0, wxALL, 5);

        // Toolbar-style buttons
        wxStaticBoxSizer* toolbarSizer = new wxStaticBoxSizer(wxHORIZONTAL, mainPanel, "Toolbar Style");

        m_btnSelect = new wxBitmapButton(mainPanel, wxID_ANY, CreateToolIcon(*wxBLACK, "S"));
        m_btnSelect->SetToolTip("Select Tool");

        m_btnLine = new wxBitmapButton(mainPanel, wxID_ANY, CreateToolIcon(*wxBLUE, "L"));
        m_btnLine->SetToolTip("Line Tool");

        m_btnRect = new wxBitmapButton(mainPanel, wxID_ANY, CreateToolIcon(wxColour(0, 128, 0), "R"));
        m_btnRect->SetToolTip("Rectangle Tool");

        m_btnCircle = new wxBitmapButton(mainPanel, wxID_ANY, CreateToolIcon(*wxRED, "C"));
        m_btnCircle->SetToolTip("Circle Tool");

        m_btnText = new wxBitmapButton(mainPanel, wxID_ANY, CreateToolIcon(wxColour(128, 0, 128), "T"));
        m_btnText->SetToolTip("Text Tool");

        m_btnSelect->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { Log("Select tool clicked"); });
        m_btnLine->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { Log("Line tool clicked"); });
        m_btnRect->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { Log("Rectangle tool clicked"); });
        m_btnCircle->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { Log("Circle tool clicked"); });
        m_btnText->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { Log("Text tool clicked"); });

        toolbarSizer->Add(m_btnSelect, 0, wxALL, 2);
        toolbarSizer->Add(m_btnLine, 0, wxALL, 2);
        toolbarSizer->Add(m_btnRect, 0, wxALL, 2);
        toolbarSizer->Add(m_btnCircle, 0, wxALL, 2);
        toolbarSizer->Add(m_btnText, 0, wxALL, 2);

        mainSizer->Add(toolbarSizer, 0, wxEXPAND | wxALL, 5);

        // Layer visibility buttons (simulated with checkboxes)
        wxStaticBoxSizer* layerSizer = new wxStaticBoxSizer(wxHORIZONTAL, mainPanel, "Layer Visibility (Toggle Buttons)");

        m_chkFCu = new wxCheckBox(mainPanel, wxID_ANY, "F.Cu");
        m_chkFCu->SetValue(true);
        m_chkBCu = new wxCheckBox(mainPanel, wxID_ANY, "B.Cu");
        m_chkBCu->SetValue(true);
        m_chkSilk = new wxCheckBox(mainPanel, wxID_ANY, "Silk");
        m_chkSilk->SetValue(true);
        m_chkMask = new wxCheckBox(mainPanel, wxID_ANY, "Mask");
        m_chkMask->SetValue(false);

        m_chkFCu->Bind(wxEVT_CHECKBOX, [this](wxCommandEvent& e) {
            Log(wxString::Format("F.Cu toggle: %s", e.IsChecked() ? "ON" : "OFF"));
        });
        m_chkBCu->Bind(wxEVT_CHECKBOX, [this](wxCommandEvent& e) {
            Log(wxString::Format("B.Cu toggle: %s", e.IsChecked() ? "ON" : "OFF"));
        });
        m_chkSilk->Bind(wxEVT_CHECKBOX, [this](wxCommandEvent& e) {
            Log(wxString::Format("Silk toggle: %s", e.IsChecked() ? "ON" : "OFF"));
        });
        m_chkMask->Bind(wxEVT_CHECKBOX, [this](wxCommandEvent& e) {
            Log(wxString::Format("Mask toggle: %s", e.IsChecked() ? "ON" : "OFF"));
        });

        layerSizer->Add(m_chkFCu, 0, wxALL, 5);
        layerSizer->Add(m_chkBCu, 0, wxALL, 5);
        layerSizer->Add(m_chkSilk, 0, wxALL, 5);
        layerSizer->Add(m_chkMask, 0, wxALL, 5);

        mainSizer->Add(layerSizer, 0, wxEXPAND | wxALL, 5);

        // Disabled state buttons
        wxStaticBoxSizer* disabledSizer = new wxStaticBoxSizer(wxHORIZONTAL, mainPanel, "Disabled State");

        m_btnEnabled = new wxBitmapButton(mainPanel, wxID_ANY, CreateIcon(wxColour(0, 128, 0), 24, "circle"));
        m_btnEnabled->SetToolTip("Enabled button");

        m_btnDisabled = new wxBitmapButton(mainPanel, wxID_ANY, CreateIcon(wxColour(128, 128, 128), 24, "circle"));
        m_btnDisabled->Enable(false);
        m_btnDisabled->SetToolTip("Disabled button");

        wxButton* btnToggleEnabled = new wxButton(mainPanel, wxID_ANY, "Toggle Enable State");
        btnToggleEnabled->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) {
            m_btnDisabled->Enable(!m_btnDisabled->IsEnabled());
            Log(wxString::Format("Button enabled: %s", m_btnDisabled->IsEnabled() ? "Yes" : "No"));
        });

        disabledSizer->Add(m_btnEnabled, 0, wxALL, 5);
        disabledSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Enabled"), 0, wxALL | wxALIGN_CENTER_VERTICAL, 5);
        disabledSizer->AddSpacer(20);
        disabledSizer->Add(m_btnDisabled, 0, wxALL, 5);
        disabledSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Disabled"), 0, wxALL | wxALIGN_CENTER_VERTICAL, 5);
        disabledSizer->AddSpacer(20);
        disabledSizer->Add(btnToggleEnabled, 0, wxALL, 5);

        mainSizer->Add(disabledSizer, 0, wxEXPAND | wxALL, 5);

        // Different shapes
        wxStaticBoxSizer* shapesSizer = new wxStaticBoxSizer(wxHORIZONTAL, mainPanel, "Different Icon Shapes");

        wxBitmapButton* btnRect = new wxBitmapButton(mainPanel, wxID_ANY, CreateIcon(*wxRED, 32, "rect"));
        wxBitmapButton* btnCircle = new wxBitmapButton(mainPanel, wxID_ANY, CreateIcon(*wxBLUE, 32, "circle"));
        wxBitmapButton* btnTriangle = new wxBitmapButton(mainPanel, wxID_ANY, CreateIcon(wxColour(0, 128, 0), 32, "triangle"));
        wxBitmapButton* btnDiamond = new wxBitmapButton(mainPanel, wxID_ANY, CreateIcon(wxColour(128, 0, 128), 32, "diamond"));

        btnRect->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { Log("Rectangle shape clicked"); });
        btnCircle->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { Log("Circle shape clicked"); });
        btnTriangle->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { Log("Triangle shape clicked"); });
        btnDiamond->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { Log("Diamond shape clicked"); });

        shapesSizer->Add(btnRect, 0, wxALL, 5);
        shapesSizer->Add(btnCircle, 0, wxALL, 5);
        shapesSizer->Add(btnTriangle, 0, wxALL, 5);
        shapesSizer->Add(btnDiamond, 0, wxALL, 5);

        mainSizer->Add(shapesSizer, 0, wxEXPAND | wxALL, 5);

        // Art Provider buttons
        wxStaticBoxSizer* artSizer = new wxStaticBoxSizer(wxHORIZONTAL, mainPanel, "Art Provider Icons");

        wxBitmapButton* btnNew = new wxBitmapButton(mainPanel, wxID_ANY,
            wxArtProvider::GetBitmap(wxART_NEW, wxART_TOOLBAR));
        wxBitmapButton* btnOpen = new wxBitmapButton(mainPanel, wxID_ANY,
            wxArtProvider::GetBitmap(wxART_FILE_OPEN, wxART_TOOLBAR));
        wxBitmapButton* btnSave = new wxBitmapButton(mainPanel, wxID_ANY,
            wxArtProvider::GetBitmap(wxART_FILE_SAVE, wxART_TOOLBAR));
        wxBitmapButton* btnUndo = new wxBitmapButton(mainPanel, wxID_ANY,
            wxArtProvider::GetBitmap(wxART_UNDO, wxART_TOOLBAR));
        wxBitmapButton* btnRedo = new wxBitmapButton(mainPanel, wxID_ANY,
            wxArtProvider::GetBitmap(wxART_REDO, wxART_TOOLBAR));

        btnNew->SetToolTip("New");
        btnOpen->SetToolTip("Open");
        btnSave->SetToolTip("Save");
        btnUndo->SetToolTip("Undo");
        btnRedo->SetToolTip("Redo");

        btnNew->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { Log("New clicked"); });
        btnOpen->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { Log("Open clicked"); });
        btnSave->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { Log("Save clicked"); });
        btnUndo->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { Log("Undo clicked"); });
        btnRedo->Bind(wxEVT_BUTTON, [this](wxCommandEvent&) { Log("Redo clicked"); });

        artSizer->Add(btnNew, 0, wxALL, 2);
        artSizer->Add(btnOpen, 0, wxALL, 2);
        artSizer->Add(btnSave, 0, wxALL, 2);
        artSizer->AddSpacer(10);
        artSizer->Add(btnUndo, 0, wxALL, 2);
        artSizer->Add(btnRedo, 0, wxALL, 2);

        mainSizer->Add(artSizer, 0, wxEXPAND | wxALL, 5);

        // Event log
        mainSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Event Log"), 0, wxLEFT | wxTOP, 5);
        m_log = new wxTextCtrl(mainPanel, wxID_ANY, "", wxDefaultPosition, wxSize(-1, 100),
                               wxTE_MULTILINE | wxTE_READONLY);
        mainSizer->Add(m_log, 1, wxEXPAND | wxALL, 5);

        mainPanel->SetSizer(mainSizer);

        CreateStatusBar();
        SetStatusText("Bitmap buttons test app started");
        Log("Bitmap buttons test app started");
    }

private:
    void Log(const wxString& msg)
    {
        m_log->AppendText(msg + "\n");
    }

    wxBitmapButton* m_btnSelect;
    wxBitmapButton* m_btnLine;
    wxBitmapButton* m_btnRect;
    wxBitmapButton* m_btnCircle;
    wxBitmapButton* m_btnText;
    wxCheckBox* m_chkFCu;
    wxCheckBox* m_chkBCu;
    wxCheckBox* m_chkSilk;
    wxCheckBox* m_chkMask;
    wxBitmapButton* m_btnEnabled;
    wxBitmapButton* m_btnDisabled;
    wxTextCtrl* m_log;
};

class BitmapButtonsApp : public wxApp
{
public:
    virtual bool OnInit() override
    {
        BitmapButtonsFrame* frame = new BitmapButtonsFrame();
        frame->Show();
        return true;
    }
};

wxIMPLEMENT_APP(BitmapButtonsApp);
