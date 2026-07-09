// wxTextCtrl::Clear()/Remove() must update the visible <input> (DOM port).
//
// Bug (src/wasm/textentry.cpp + textctrl.cpp):
//   wxTextCtrl overrides WriteText() and DoSetValue() to push the new value into
//   the DOM element, but it does NOT override Remove(). wxTextEntryBase::Clear()
//   is { Remove(0, GetLastPosition()); }, so both Clear() and Remove() fall
//   through to wxTextEntry::Remove(), which only mutates the C++ m_value cache:
//
//       m_value.erase(from, to - from);
//       // TODO(dom-phase-2): mirror the new value into the DOM element.
//
//   So after textCtrl->Clear() the cache (GetValue()) is empty but the <input>
//   still shows the old text — and the next keystroke reads the stale DOM value
//   back, silently resurrecting the "deleted" text. Native ports delete the text
//   in the live widget (gtk_editable_delete_text).
//
// The spec sets a known value, clicks Clear (then Remove), and checks the real
// <input> element value:
//   RED  (bug present): the <input> keeps the old text after Clear()/Remove().
//   GREEN (fixed):      the <input> reflects the cache.

#include "wx/wxprec.h"
#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

enum { ID_CLEAR = wxID_HIGHEST + 1, ID_REMOVE };

class ReproFrame : public wxFrame
{
public:
    ReproFrame();

private:
    void OnClear(wxCommandEvent &)  { m_text->Clear(); }
    // Remove the middle: "hello world" -> "ho world" (drops chars [1,5)).
    void OnRemove(wxCommandEvent &) { m_text->Remove(1, 5); }

    wxTextCtrl *m_text = nullptr;
};

ReproFrame::ReproFrame()
    : wxFrame(nullptr, wxID_ANY, "wxTextCtrl Clear/Remove repro")
{
    wxBoxSizer *sizer = new wxBoxSizer(wxVERTICAL);

    m_text = new wxTextCtrl(this, wxID_ANY, "hello world");
    sizer->Add(m_text, 0, wxALL | wxEXPAND, 10);

    wxButton *clearBtn = new wxButton(this, ID_CLEAR, "Clear");
    clearBtn->Bind(wxEVT_BUTTON, &ReproFrame::OnClear, this);
    sizer->Add(clearBtn, 0, wxALL, 10);

    wxButton *removeBtn = new wxButton(this, ID_REMOVE, "Remove");
    removeBtn->Bind(wxEVT_BUTTON, &ReproFrame::OnRemove, this);
    sizer->Add(removeBtn, 0, wxALL, 10);

    SetSizer(sizer);

#ifdef __EMSCRIPTEN__
    CallAfter([] { EM_ASM({ console.log('[REPRO] textctrl-clear ready'); }); });
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
