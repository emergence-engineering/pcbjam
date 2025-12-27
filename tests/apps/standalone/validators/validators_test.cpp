// wxValidator Test - Input validation like KiCad uses
// Tests: wxTextValidator, wxIntegerValidator, wxFloatingPointValidator, custom validators

#include "wx/wx.h"
#include "wx/valtext.h"
#include "wx/valnum.h"

// Custom validator similar to KiCad's NETNAME_VALIDATOR
class NetNameValidator : public wxTextValidator
{
public:
    NetNameValidator() : wxTextValidator(wxFILTER_NONE)
    {
        // Allow alphanumeric, underscore, and some special chars
        SetCharIncludes("_+-/");
    }

    virtual wxObject* Clone() const override
    {
        return new NetNameValidator(*this);
    }

    virtual bool Validate(wxWindow* parent) override
    {
        wxTextCtrl* tc = dynamic_cast<wxTextCtrl*>(GetWindow());
        if (!tc) return true;

        wxString val = tc->GetValue();

        // Net name cannot start with a number
        if (!val.IsEmpty() && wxIsdigit(val[0]))
        {
            wxMessageBox("Net name cannot start with a digit", "Validation Error",
                         wxOK | wxICON_ERROR, parent);
            return false;
        }

        return wxTextValidator::Validate(parent);
    }
};

// Custom validator for footprint names (like FOOTPRINT_NAME_VALIDATOR)
class FootprintNameValidator : public wxTextValidator
{
public:
    FootprintNameValidator() : wxTextValidator(wxFILTER_ALPHANUMERIC)
    {
        SetCharIncludes("_-.");
    }

    virtual wxObject* Clone() const override
    {
        return new FootprintNameValidator(*this);
    }
};

class ValidatorsFrame : public wxFrame
{
public:
    ValidatorsFrame() : wxFrame(nullptr, wxID_ANY, "wxValidator Test",
                                 wxDefaultPosition, wxSize(700, 600))
    {
        wxPanel* mainPanel = new wxPanel(this);
        wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

        // Description
        wxStaticText* desc = new wxStaticText(mainPanel, wxID_ANY,
            "KiCad uses validators for input validation in dialogs.\n"
            "Tests: wxTextValidator, wxIntegerValidator, wxFloatingPointValidator, custom validators.");
        mainSizer->Add(desc, 0, wxALL, 5);

        // Grid for input fields
        wxFlexGridSizer* gridSizer = new wxFlexGridSizer(2, 10, 10);
        gridSizer->AddGrowableCol(1, 1);

        // 1. Alpha-numeric validator
        gridSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Alphanumeric only:"),
                       0, wxALIGN_CENTER_VERTICAL);
        m_alphaCtrl = new wxTextCtrl(mainPanel, wxID_ANY, "",
                                      wxDefaultPosition, wxDefaultSize, 0,
                                      wxTextValidator(wxFILTER_ALPHANUMERIC));
        m_alphaCtrl->SetHint("Letters and numbers only");
        gridSizer->Add(m_alphaCtrl, 1, wxEXPAND);

        // 2. Numeric only validator
        gridSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Digits only:"),
                       0, wxALIGN_CENTER_VERTICAL);
        m_digitCtrl = new wxTextCtrl(mainPanel, wxID_ANY, "",
                                      wxDefaultPosition, wxDefaultSize, 0,
                                      wxTextValidator(wxFILTER_DIGITS));
        m_digitCtrl->SetHint("0-9 only");
        gridSizer->Add(m_digitCtrl, 1, wxEXPAND);

        // 3. Integer validator with range
        gridSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Integer (0-1000):"),
                       0, wxALIGN_CENTER_VERTICAL);
        m_intValue = 100;
        wxIntegerValidator<int> intValidator(&m_intValue);
        intValidator.SetRange(0, 1000);
        m_intCtrl = new wxTextCtrl(mainPanel, wxID_ANY, "100",
                                    wxDefaultPosition, wxDefaultSize, 0,
                                    intValidator);
        gridSizer->Add(m_intCtrl, 1, wxEXPAND);

        // 4. Float validator with range
        gridSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Float (0.0-100.0):"),
                       0, wxALIGN_CENTER_VERTICAL);
        m_floatValue = 50.0;
        wxFloatingPointValidator<double> floatValidator(3, &m_floatValue);
        floatValidator.SetRange(0.0, 100.0);
        m_floatCtrl = new wxTextCtrl(mainPanel, wxID_ANY, "50.0",
                                      wxDefaultPosition, wxDefaultSize, 0,
                                      floatValidator);
        gridSizer->Add(m_floatCtrl, 1, wxEXPAND);

        // 5. Include chars validator
        gridSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Email chars (a-z, @, .):"),
                       0, wxALIGN_CENTER_VERTICAL);
        wxTextValidator emailValidator(wxFILTER_ALPHANUMERIC);
        emailValidator.SetCharIncludes("@._-");
        m_emailCtrl = new wxTextCtrl(mainPanel, wxID_ANY, "",
                                      wxDefaultPosition, wxDefaultSize, 0,
                                      emailValidator);
        m_emailCtrl->SetHint("user@example.com");
        gridSizer->Add(m_emailCtrl, 1, wxEXPAND);

        // 6. Exclude chars validator
        gridSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "No spaces allowed:"),
                       0, wxALIGN_CENTER_VERTICAL);
        wxTextValidator noSpaceValidator(wxFILTER_EXCLUDE_CHAR_LIST);
        noSpaceValidator.SetCharExcludes(" \t\n");
        m_noSpaceCtrl = new wxTextCtrl(mainPanel, wxID_ANY, "",
                                        wxDefaultPosition, wxDefaultSize, 0,
                                        noSpaceValidator);
        m_noSpaceCtrl->SetHint("No whitespace");
        gridSizer->Add(m_noSpaceCtrl, 1, wxEXPAND);

        // 7. Net name validator (custom)
        gridSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Net name (custom):"),
                       0, wxALIGN_CENTER_VERTICAL);
        m_netNameCtrl = new wxTextCtrl(mainPanel, wxID_ANY, "",
                                        wxDefaultPosition, wxDefaultSize, 0,
                                        NetNameValidator());
        m_netNameCtrl->SetHint("Cannot start with digit");
        gridSizer->Add(m_netNameCtrl, 1, wxEXPAND);

        // 8. Footprint name validator (custom)
        gridSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Footprint name:"),
                       0, wxALIGN_CENTER_VERTICAL);
        m_footprintCtrl = new wxTextCtrl(mainPanel, wxID_ANY, "",
                                          wxDefaultPosition, wxDefaultSize, 0,
                                          FootprintNameValidator());
        m_footprintCtrl->SetHint("Alphanumeric with _-.");
        gridSizer->Add(m_footprintCtrl, 1, wxEXPAND);

        mainSizer->Add(gridSizer, 0, wxEXPAND | wxALL, 10);

        // Buttons
        wxBoxSizer* btnSizer = new wxBoxSizer(wxHORIZONTAL);

        wxButton* btnValidate = new wxButton(mainPanel, wxID_ANY, "Validate All");
        wxButton* btnTransfer = new wxButton(mainPanel, wxID_ANY, "Transfer Data");
        wxButton* btnClear = new wxButton(mainPanel, wxID_ANY, "Clear All");

        btnValidate->Bind(wxEVT_BUTTON, &ValidatorsFrame::OnValidateAll, this);
        btnTransfer->Bind(wxEVT_BUTTON, &ValidatorsFrame::OnTransferData, this);
        btnClear->Bind(wxEVT_BUTTON, &ValidatorsFrame::OnClearAll, this);

        btnSizer->Add(btnValidate, 0, wxRIGHT, 5);
        btnSizer->Add(btnTransfer, 0, wxRIGHT, 5);
        btnSizer->Add(btnClear, 0);

        mainSizer->Add(btnSizer, 0, wxALL, 10);

        // Event log
        mainSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Event Log"), 0, wxLEFT | wxTOP, 5);
        m_log = new wxTextCtrl(mainPanel, wxID_ANY, "", wxDefaultPosition, wxSize(-1, 150),
                               wxTE_MULTILINE | wxTE_READONLY);
        mainSizer->Add(m_log, 1, wxEXPAND | wxALL, 5);

        mainPanel->SetSizer(mainSizer);

        CreateStatusBar();
        SetStatusText("Validator test app started");
        Log("Validator test app started");
        Log("Try typing invalid characters - they should be blocked");
    }

private:
    void OnValidateAll(wxCommandEvent& event)
    {
        Log("Validating all fields...");

        bool allValid = true;

        // Validate each control
        wxTextCtrl* controls[] = {m_alphaCtrl, m_digitCtrl, m_intCtrl, m_floatCtrl,
                                   m_emailCtrl, m_noSpaceCtrl, m_netNameCtrl, m_footprintCtrl};
        const char* names[] = {"Alphanumeric", "Digits", "Integer", "Float",
                               "Email", "NoSpace", "NetName", "Footprint"};

        for (int i = 0; i < 8; i++)
        {
            wxValidator* validator = controls[i]->GetValidator();
            if (validator)
            {
                bool valid = validator->Validate(this);
                Log(wxString::Format("  %s: %s", names[i], valid ? "VALID" : "INVALID"));
                if (!valid) allValid = false;
            }
        }

        Log(wxString::Format("Overall result: %s", allValid ? "ALL VALID" : "SOME INVALID"));

        if (allValid)
        {
            wxMessageBox("All fields are valid!", "Validation", wxOK | wxICON_INFORMATION);
        }
    }

    void OnTransferData(wxCommandEvent& event)
    {
        Log("Transferring data from controls...");

        // TransferDataFromWindow updates the bound variables
        if (TransferDataFromWindow())
        {
            Log(wxString::Format("  Integer value: %d", m_intValue));
            Log(wxString::Format("  Float value: %.3f", m_floatValue));
            Log("Transfer successful");
        }
        else
        {
            Log("Transfer failed - validation error");
        }
    }

    void OnClearAll(wxCommandEvent& event)
    {
        m_alphaCtrl->Clear();
        m_digitCtrl->Clear();
        m_intCtrl->SetValue("0");
        m_floatCtrl->SetValue("0.0");
        m_emailCtrl->Clear();
        m_noSpaceCtrl->Clear();
        m_netNameCtrl->Clear();
        m_footprintCtrl->Clear();
        Log("All fields cleared");
    }

    void Log(const wxString& msg)
    {
        m_log->AppendText(msg + "\n");
    }

    wxTextCtrl* m_alphaCtrl;
    wxTextCtrl* m_digitCtrl;
    wxTextCtrl* m_intCtrl;
    wxTextCtrl* m_floatCtrl;
    wxTextCtrl* m_emailCtrl;
    wxTextCtrl* m_noSpaceCtrl;
    wxTextCtrl* m_netNameCtrl;
    wxTextCtrl* m_footprintCtrl;
    wxTextCtrl* m_log;

    int m_intValue;
    double m_floatValue;
};

class ValidatorsApp : public wxApp
{
public:
    virtual bool OnInit() override
    {
        ValidatorsFrame* frame = new ValidatorsFrame();
        frame->Show();
        return true;
    }
};

wxIMPLEMENT_APP(ValidatorsApp);
