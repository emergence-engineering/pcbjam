// wxRadioButton Group Test - exercises MULTIPLE radio-button groups in one window
//
// KiCad's Preferences "Mouse and Touchpad" panel lays out three independent
// scroll-gesture radio groups (Zoom / Pan up-down / Pan left-right), each as a
// row of [--, Ctrl, Shift, Alt] radios with the first button flagged wxRB_GROUP.
//
// In the WASM DOM port the per-group HTML "name" must be unique per group so the
// browser keeps the groups independent. This harness reproduces that layout: it
// pre-selects a DIFFERENT column in each of the three groups, so a correctly
// grouped build shows exactly one selection PER ROW (three total). If the groups
// collapse into one (the %p-empty-name bug), only one radio across all three
// rows can stay checked.

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/statline.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

class RadioGroupsFrame : public wxFrame
{
public:
    RadioGroupsFrame()
        : wxFrame(nullptr, wxID_ANY, "wxRadioButton Group Test",
                  wxDefaultPosition, wxSize(640, 420))
    {
        wxPanel* panel = new wxPanel(this);
        wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

        wxStaticText* desc = new wxStaticText(panel, wxID_ANY,
            "Three INDEPENDENT radio groups (mirrors KiCad's scroll-gesture panel).\n"
            "Each row pre-selects a different column, so a correct build shows one\n"
            "selection per row (three total). If the groups merge, only one survives.");
        mainSizer->Add(desc, 0, wxALL, 8);

        // 5-column grid: row label + [--, Ctrl, Shift, Alt]
        wxFlexGridSizer* grid = new wxFlexGridSizer(5, 6, 12);

        grid->Add(new wxStaticText(panel, wxID_ANY, ""));
        grid->Add(new wxStaticText(panel, wxID_ANY, "--"), 0, wxALIGN_CENTER);
        grid->Add(new wxStaticText(panel, wxID_ANY, "Ctrl"), 0, wxALIGN_CENTER);
        grid->Add(new wxStaticText(panel, wxID_ANY, "Shift"), 0, wxALIGN_CENTER);
        grid->Add(new wxStaticText(panel, wxID_ANY, "Alt"), 0, wxALIGN_CENTER);

        // Row order and wxRB_GROUP flags MUST match the real panel: each row's
        // first radio starts a new group; the rest join it.
        addGroupRow(panel, grid, "Group A (Zoom)", m_groupA);
        addGroupRow(panel, grid, "Group B (Pan up/down)", m_groupB);
        addGroupRow(panel, grid, "Group C (Pan left/right)", m_groupC);

        mainSizer->Add(grid, 0, wxALL, 12);

        wxButton* check = new wxButton(panel, wxID_ANY, "Check selections");
        check->Bind(wxEVT_BUTTON, &RadioGroupsFrame::OnCheck, this);
        mainSizer->Add(check, 0, wxLEFT | wxBOTTOM, 12);

        mainSizer->Add(new wxStaticText(panel, wxID_ANY, "Log"), 0, wxLEFT, 12);
        m_log = new wxTextCtrl(panel, wxID_ANY, "", wxDefaultPosition, wxSize(-1, 110),
                               wxTE_MULTILINE | wxTE_READONLY);
        mainSizer->Add(m_log, 1, wxEXPAND | wxALL, 12);

        panel->SetSizer(mainSizer);

        CreateStatusBar();
        SetStatusText("radio groups test app started");
        Log("radio groups test app started");

        // Pre-select a DIFFERENT column per group (distinct, like the real
        // defaults: Zoom=--, Pan up/down=Shift, Pan left/right=Ctrl). Deferred
        // until after the frame is shown, mirroring how real panels apply
        // settings in TransferDataToWindow(); SetValue() from the ctor runs
        // before the DOM radio nodes are realized and would not paint.
        CallAfter([this]
        {
            m_groupA[COL_NONE]->SetValue(true);
            m_groupB[COL_SHIFT]->SetValue(true);
            m_groupC[COL_CTRL]->SetValue(true);
            Log("Initial selection: A=--, B=Shift, C=Ctrl (one per group)");
        });
    }

private:
    enum Col { COL_NONE = 0, COL_CTRL, COL_SHIFT, COL_ALT, COL_COUNT };

    void addGroupRow(wxWindow* parent, wxFlexGridSizer* grid, const wxString& label,
                     wxRadioButton* (&out)[COL_COUNT])
    {
        grid->Add(new wxStaticText(parent, wxID_ANY, label), 0, wxALIGN_CENTER_VERTICAL);

        for (int c = 0; c < COL_COUNT; ++c)
        {
            // First radio of the row starts a fresh group.
            long style = (c == 0) ? wxRB_GROUP : 0;
            out[c] = new wxRadioButton(parent, wxID_ANY, "", wxDefaultPosition,
                                       wxDefaultSize, style);
            grid->Add(out[c], 0, wxALIGN_CENTER);
        }
    }

    void OnCheck(wxCommandEvent&)
    {
        Log(wxString::Format("Group A: %s", selectedCol(m_groupA)));
        Log(wxString::Format("Group B: %s", selectedCol(m_groupB)));
        Log(wxString::Format("Group C: %s", selectedCol(m_groupC)));
    }

    wxString selectedCol(wxRadioButton* (&group)[COL_COUNT])
    {
        static const char* names[COL_COUNT] = { "--", "Ctrl", "Shift", "Alt" };
        for (int c = 0; c < COL_COUNT; ++c)
        {
            if (group[c]->GetValue())
                return names[c];
        }
        return "(none!)";
    }

    void Log(const wxString& msg) { m_log->AppendText(msg + "\n"); }

    wxRadioButton* m_groupA[COL_COUNT];
    wxRadioButton* m_groupB[COL_COUNT];
    wxRadioButton* m_groupC[COL_COUNT];
    wxTextCtrl*    m_log;
};

class RadioGroupsApp : public wxApp
{
public:
    virtual bool OnInit() override
    {
        RadioGroupsFrame* frame = new RadioGroupsFrame();
        frame->Show();
        return true;
    }
};

wxIMPLEMENT_APP(RadioGroupsApp);
