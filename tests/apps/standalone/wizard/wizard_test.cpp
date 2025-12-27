// wxWizard Test - Footprint Wizard simulation
// Tests wxWizard for step-by-step dialogs

#include "wx/wx.h"
#include "wx/wizard.h"
#include "wx/spinctrl.h"

// Page 1: Package Type Selection
class PackageTypePage : public wxWizardPageSimple
{
public:
    PackageTypePage(wxWizard* parent) : wxWizardPageSimple(parent)
    {
        wxBoxSizer* sizer = new wxBoxSizer(wxVERTICAL);

        sizer->Add(new wxStaticText(this, wxID_ANY, "Step 1: Select Package Type"), 0, wxBOTTOM, 10);
        sizer->Add(new wxStaticText(this, wxID_ANY, "Choose the type of footprint to create:"), 0, wxBOTTOM, 10);

        wxString choices[] = {"QFP (Quad Flat Package)", "BGA (Ball Grid Array)",
                              "DIP (Dual In-line Package)", "SOT (Small Outline Transistor)",
                              "SOP (Small Outline Package)"};
        m_choice = new wxChoice(this, wxID_ANY, wxDefaultPosition, wxDefaultSize, 5, choices);
        m_choice->SetSelection(0);
        sizer->Add(m_choice, 0, wxEXPAND | wxBOTTOM, 10);

        sizer->Add(new wxStaticText(this, wxID_ANY, "Selected: QFP - Common for microcontrollers"), 0);

        SetSizer(sizer);
    }

    wxString GetSelection() const { return m_choice->GetStringSelection(); }

private:
    wxChoice* m_choice;
};

// Page 2: Pin Configuration
class PinConfigPage : public wxWizardPageSimple
{
public:
    PinConfigPage(wxWizard* parent) : wxWizardPageSimple(parent)
    {
        wxBoxSizer* sizer = new wxBoxSizer(wxVERTICAL);

        sizer->Add(new wxStaticText(this, wxID_ANY, "Step 2: Pin Configuration"), 0, wxBOTTOM, 10);

        wxFlexGridSizer* grid = new wxFlexGridSizer(2, 2, 5, 10);

        grid->Add(new wxStaticText(this, wxID_ANY, "Number of Pins:"), 0, wxALIGN_CENTER_VERTICAL);
        m_pinCount = new wxSpinCtrl(this, wxID_ANY, "48", wxDefaultPosition, wxDefaultSize, wxSP_ARROW_KEYS, 4, 256, 48);
        grid->Add(m_pinCount, 0);

        grid->Add(new wxStaticText(this, wxID_ANY, "Pins Per Side:"), 0, wxALIGN_CENTER_VERTICAL);
        m_pinsPerSide = new wxSpinCtrl(this, wxID_ANY, "12", wxDefaultPosition, wxDefaultSize, wxSP_ARROW_KEYS, 1, 64, 12);
        grid->Add(m_pinsPerSide, 0);

        grid->Add(new wxStaticText(this, wxID_ANY, "Pin Pitch (mm):"), 0, wxALIGN_CENTER_VERTICAL);
        wxString pitches[] = {"0.4", "0.5", "0.65", "0.8", "1.0", "1.27"};
        m_pitch = new wxChoice(this, wxID_ANY, wxDefaultPosition, wxDefaultSize, 6, pitches);
        m_pitch->SetSelection(1);
        grid->Add(m_pitch, 0);

        grid->Add(new wxStaticText(this, wxID_ANY, "Pin 1 Position:"), 0, wxALIGN_CENTER_VERTICAL);
        wxString positions[] = {"Top-Left", "Bottom-Left", "Top-Right", "Bottom-Right"};
        m_pin1Pos = new wxChoice(this, wxID_ANY, wxDefaultPosition, wxDefaultSize, 4, positions);
        m_pin1Pos->SetSelection(0);
        grid->Add(m_pin1Pos, 0);

        sizer->Add(grid, 0, wxEXPAND | wxBOTTOM, 10);

        SetSizer(sizer);
    }

    int GetPinCount() const { return m_pinCount->GetValue(); }
    wxString GetPitch() const { return m_pitch->GetStringSelection(); }

private:
    wxSpinCtrl* m_pinCount;
    wxSpinCtrl* m_pinsPerSide;
    wxChoice* m_pitch;
    wxChoice* m_pin1Pos;
};

// Page 3: Package Dimensions
class DimensionsPage : public wxWizardPageSimple
{
public:
    DimensionsPage(wxWizard* parent) : wxWizardPageSimple(parent)
    {
        wxBoxSizer* sizer = new wxBoxSizer(wxVERTICAL);

        sizer->Add(new wxStaticText(this, wxID_ANY, "Step 3: Package Dimensions"), 0, wxBOTTOM, 10);

        wxFlexGridSizer* grid = new wxFlexGridSizer(2, 2, 5, 10);

        grid->Add(new wxStaticText(this, wxID_ANY, "Package Width (mm):"), 0, wxALIGN_CENTER_VERTICAL);
        m_width = new wxTextCtrl(this, wxID_ANY, "7.0");
        grid->Add(m_width, 0);

        grid->Add(new wxStaticText(this, wxID_ANY, "Package Height (mm):"), 0, wxALIGN_CENTER_VERTICAL);
        m_height = new wxTextCtrl(this, wxID_ANY, "7.0");
        grid->Add(m_height, 0);

        grid->Add(new wxStaticText(this, wxID_ANY, "Pad Width (mm):"), 0, wxALIGN_CENTER_VERTICAL);
        m_padWidth = new wxTextCtrl(this, wxID_ANY, "0.3");
        grid->Add(m_padWidth, 0);

        grid->Add(new wxStaticText(this, wxID_ANY, "Pad Height (mm):"), 0, wxALIGN_CENTER_VERTICAL);
        m_padHeight = new wxTextCtrl(this, wxID_ANY, "1.0");
        grid->Add(m_padHeight, 0);

        sizer->Add(grid, 0, wxEXPAND | wxBOTTOM, 10);

        // Checkbox options
        m_addThermal = new wxCheckBox(this, wxID_ANY, "Add thermal pad");
        m_addSilkscreen = new wxCheckBox(this, wxID_ANY, "Add silkscreen outline");
        m_addCourtyard = new wxCheckBox(this, wxID_ANY, "Add courtyard");

        m_addSilkscreen->SetValue(true);
        m_addCourtyard->SetValue(true);

        sizer->Add(m_addThermal, 0, wxBOTTOM, 5);
        sizer->Add(m_addSilkscreen, 0, wxBOTTOM, 5);
        sizer->Add(m_addCourtyard, 0);

        SetSizer(sizer);
    }

private:
    wxTextCtrl* m_width;
    wxTextCtrl* m_height;
    wxTextCtrl* m_padWidth;
    wxTextCtrl* m_padHeight;
    wxCheckBox* m_addThermal;
    wxCheckBox* m_addSilkscreen;
    wxCheckBox* m_addCourtyard;
};

// Page 4: Summary
class SummaryPage : public wxWizardPageSimple
{
public:
    SummaryPage(wxWizard* parent, PackageTypePage* p1, PinConfigPage* p2)
        : wxWizardPageSimple(parent), m_page1(p1), m_page2(p2)
    {
        wxBoxSizer* sizer = new wxBoxSizer(wxVERTICAL);

        sizer->Add(new wxStaticText(this, wxID_ANY, "Step 4: Summary"), 0, wxBOTTOM, 10);
        sizer->Add(new wxStaticText(this, wxID_ANY, "Review your footprint settings:"), 0, wxBOTTOM, 10);

        m_summary = new wxTextCtrl(this, wxID_ANY, "", wxDefaultPosition, wxDefaultSize,
                                    wxTE_MULTILINE | wxTE_READONLY);
        sizer->Add(m_summary, 1, wxEXPAND | wxBOTTOM, 10);

        sizer->Add(new wxStaticText(this, wxID_ANY, "Click Finish to create the footprint."), 0);

        SetSizer(sizer);
    }

    virtual bool TransferDataToWindow() override
    {
        wxString summary;
        summary += "Footprint Summary\n";
        summary += "=================\n\n";
        summary += wxString::Format("Package Type: %s\n", m_page1->GetSelection());
        summary += wxString::Format("Pin Count: %d\n", m_page2->GetPinCount());
        summary += wxString::Format("Pin Pitch: %s mm\n", m_page2->GetPitch());
        summary += "\nDimensions:\n";
        summary += "  Package: 7.0 x 7.0 mm\n";
        summary += "  Pad Size: 0.3 x 1.0 mm\n";
        summary += "\nOptions:\n";
        summary += "  Silkscreen: Yes\n";
        summary += "  Courtyard: Yes\n";

        m_summary->SetValue(summary);
        return true;
    }

private:
    PackageTypePage* m_page1;
    PinConfigPage* m_page2;
    wxTextCtrl* m_summary;
};

class WizardFrame : public wxFrame
{
public:
    WizardFrame() : wxFrame(nullptr, wxID_ANY, "wxWizard Test",
                            wxDefaultPosition, wxSize(800, 500))
    {
        wxPanel* mainPanel = new wxPanel(this);
        wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

        // Description
        wxStaticText* desc = new wxStaticText(mainPanel, wxID_ANY,
            "KiCad uses wxWizard for the Footprint Wizard.\n"
            "This tests step-by-step dialog functionality with Next/Back navigation.");
        mainSizer->Add(desc, 0, wxALL, 10);

        // Launch button
        wxButton* btnLaunch = new wxButton(mainPanel, wxID_ANY, "Launch Footprint Wizard");
        btnLaunch->Bind(wxEVT_BUTTON, &WizardFrame::OnLaunchWizard, this);
        mainSizer->Add(btnLaunch, 0, wxALL, 10);

        // Event log
        mainSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Event Log"), 0, wxLEFT | wxTOP, 10);
        m_log = new wxTextCtrl(mainPanel, wxID_ANY, "", wxDefaultPosition, wxDefaultSize,
                               wxTE_MULTILINE | wxTE_READONLY);
        mainSizer->Add(m_log, 1, wxEXPAND | wxALL, 10);

        mainPanel->SetSizer(mainSizer);

        // Status bar
        CreateStatusBar();
        SetStatusText("Wizard test app started");

        Log("Wizard test app started");
        Log("Click 'Launch Footprint Wizard' to start");
    }

private:
    void Log(const wxString& msg)
    {
        m_log->AppendText(msg + "\n");
    }

    void OnLaunchWizard(wxCommandEvent& event)
    {
        Log("Launching Footprint Wizard...");

        wxWizard* wizard = new wxWizard(this, wxID_ANY, "Footprint Wizard",
                                         wxNullBitmap, wxDefaultPosition,
                                         wxDEFAULT_DIALOG_STYLE | wxRESIZE_BORDER);

        // Create pages
        PackageTypePage* page1 = new PackageTypePage(wizard);
        PinConfigPage* page2 = new PinConfigPage(wizard);
        DimensionsPage* page3 = new DimensionsPage(wizard);
        SummaryPage* page4 = new SummaryPage(wizard, page1, page2);

        // Chain pages
        wxWizardPageSimple::Chain(page1, page2);
        wxWizardPageSimple::Chain(page2, page3);
        wxWizardPageSimple::Chain(page3, page4);

        wizard->GetPageAreaSizer()->Add(page1);

        // Bind wizard events
        wizard->Bind(wxEVT_WIZARD_PAGE_CHANGED, [this](wxWizardEvent& evt) {
            Log(wxString::Format("Page changed to: %d", evt.GetPage() ? 1 : 0));
        });

        wizard->Bind(wxEVT_WIZARD_CANCEL, [this](wxWizardEvent&) {
            Log("Wizard cancelled");
        });

        wizard->Bind(wxEVT_WIZARD_FINISHED, [this](wxWizardEvent&) {
            Log("Wizard finished - footprint would be created");
        });

        if (wizard->RunWizard(page1))
        {
            Log("Footprint created successfully!");
            Log(wxString::Format("  Type: %s", page1->GetSelection()));
            Log(wxString::Format("  Pins: %d", page2->GetPinCount()));
            Log(wxString::Format("  Pitch: %s mm", page2->GetPitch()));
        }
        else
        {
            Log("Wizard was cancelled");
        }

        wizard->Destroy();
    }

    wxTextCtrl* m_log;
};

class WizardApp : public wxApp
{
public:
    virtual bool OnInit() override
    {
        WizardFrame* frame = new WizardFrame();
        frame->Show();
        return true;
    }
};

wxIMPLEMENT_APP(WizardApp);
