// Selection command events must carry per-item client data (DOM port).
//
// Bug (src/wasm/{choice,listbox,combobox}.cpp, OnDomEvent):
//
//   wxCommandEvent event(wxEVT_CHOICE, GetId());
//   event.SetInt(m_selection);
//   event.SetString(GetString(m_selection));
//   event.SetEventObject(this);
//   HandleWindowEvent(event);            // <-- no client data EVER attached
//
// The hand-rolled wxEVT_CHOICE / wxEVT_LISTBOX / wxEVT_COMBOBOX events never call
// InitCommandEventWithItems(), so event.GetClientData()/GetClientObject() always
// return NULL even when the picked item was appended WITH client data. Native
// ports route through wxControlWithItemsBase::SendSelectionChangedEvent(), which
// copies the selected item's client object/data into the event
// (src/common/ctrlsub.cpp).
//
// This is a real crash in KiCad: pcbnew's Track & Via Properties dialog does
//   static_cast<VIA_DIMENSION*>(aEvent.GetClientData())->m_Diameter
// with no null guard (dialog_track_via_properties.cpp onViaSelect) — a normal
// "pick a predefined via size" action then traps the WASM module.
//
// The repro appends items WITH typed client data (wxStringClientData), then the
// spec fires a real DOM 'change' on each control's element. The bound handler
// reads the event's client object and self-reports:
//
//   RED  (bug present): GetClientObject() == NULL  -> [REPRO] <ctrl>: FAIL
//   GREEN (fixed):      GetClientObject() == the picked item's data -> PASS

#include "wx/wxprec.h"
#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/combobox.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

static void Repro(const wxString& line)
{
#ifdef __EMSCRIPTEN__
    EM_ASM({ console.log('[REPRO] ' + UTF8ToString($0)); },
           (const char *)line.utf8_str());
#else
    wxPrintf("[REPRO] %s\n", line);
#endif
}

// Expected client-data payload for item index n: "DATA_A", "DATA_B", ...
static wxString ExpectedData(int n)
{
    return wxString::Format("DATA_%c", (char)('A' + n));
}

// Read the selection event's client OBJECT and report PASS/FAIL for `name`.
static void CheckEvent(const wxString& name, wxCommandEvent& evt)
{
    const int sel = evt.GetInt();
    wxClientData *obj = evt.GetClientObject();
    if (!obj)
    {
        Repro(name + ": FAIL (GetClientObject()==null, sel=" +
              wxString::Format("%d", sel) + ")");
        return;
    }

    wxStringClientData *sd = static_cast<wxStringClientData *>(obj);
    const wxString got = sd->GetData();
    const wxString want = ExpectedData(sel);
    if (got == want)
        Repro(name + ": PASS (" + got + ")");
    else
        Repro(name + ": FAIL (got '" + got + "' want '" + want + "')");
}

class ReproFrame : public wxFrame
{
public:
    ReproFrame();

private:
    void OnChoice(wxCommandEvent &e)   { CheckEvent("choice_clientdata", e); }
    void OnListBox(wxCommandEvent &e)  { CheckEvent("listbox_clientdata", e); }
    void OnComboBox(wxCommandEvent &e) { CheckEvent("combobox_clientdata", e); }
};

static void Fill(wxControlWithItems *ctrl)
{
    ctrl->Append("Alpha", new wxStringClientData("DATA_A"));
    ctrl->Append("Beta",  new wxStringClientData("DATA_B"));
    ctrl->Append("Gamma", new wxStringClientData("DATA_C"));
}

ReproFrame::ReproFrame()
    : wxFrame(nullptr, wxID_ANY, "selection client-data repro",
              wxDefaultPosition, wxSize(360, 320))
{
    wxBoxSizer *sizer = new wxBoxSizer(wxVERTICAL);

    wxChoice *choice = new wxChoice(this, wxID_ANY);
    Fill(choice);
    choice->Bind(wxEVT_CHOICE, &ReproFrame::OnChoice, this);
    sizer->Add(choice, 0, wxALL | wxEXPAND, 8);

    wxListBox *listbox = new wxListBox(this, wxID_ANY);
    Fill(listbox);
    listbox->Bind(wxEVT_LISTBOX, &ReproFrame::OnListBox, this);
    sizer->Add(listbox, 1, wxALL | wxEXPAND, 8);

    // editable combobox -> <input list=...> in the DOM port
    wxComboBox *combo = new wxComboBox(this, wxID_ANY, "");
    Fill(combo);
    combo->Bind(wxEVT_COMBOBOX, &ReproFrame::OnComboBox, this);
    sizer->Add(combo, 0, wxALL | wxEXPAND, 8);

    SetSizer(sizer);

#ifdef __EMSCRIPTEN__
    CallAfter([] { EM_ASM({ console.log('[REPRO] selevent ready'); }); });
#endif
}

class ReproApp : public wxApp
{
public:
    bool OnInit() override
    {
        if (!wxApp::OnInit())
            return false;
        (new ReproFrame())->Show(true);
        return true;
    }
};

wxIMPLEMENT_APP(ReproApp);
