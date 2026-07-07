// Reproduction for parity-audit H-3/#30: wxTextEntry caret/selection is a pure
// C++-side cache in the WASM DOM port.
//
//  - READ (H-3): GetInsertionPoint()/GetSelection() never consult the DOM
//    <input>'s selectionStart/selectionEnd. Worse, every DOM "input" event
//    routes through wxTextEntry::DoSetValue, which resets the cached caret to
//    0 and clears the cached selection — so after any typing (or a user
//    drag-select) the accessors report insertion=0, sel=(0,0) regardless of
//    the real caret.
//  - WRITE (#30): SetInsertionPoint()/SetSelection()/SelectAll() update only
//    the cache; nothing calls setSelectionRange() on the DOM element, so
//    programmatic selection (e.g. KiCad's select-all-on-dialog-open) is
//    invisible and typing inserts instead of replacing.
//
// The app exposes one wxTextCtrl seeded "hello world" plus three buttons:
//  Report        -> logs "[REPRO] textsel state: insertion=<n> sel=<a>,<b>"
//                   from the C++ accessors (read-path probe).
//  Select Middle -> SetSelection(2, 7)   (write-path probe)
//  Select All    -> SelectAll()          (write-path probe)
// The spec (tests/e2e/parity-audit.spec.ts) manipulates/reads the real DOM
// selection and cross-checks both directions.

#include "wx/wxprec.h"
#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

enum { ID_REPORT = wxID_HIGHEST + 1, ID_SEL_MIDDLE, ID_SEL_ALL };

class ReproFrame : public wxFrame
{
public:
    ReproFrame();

private:
    void OnReport(wxCommandEvent &)
    {
        long from = 0, to = 0;
        m_text->GetSelection(&from, &to);
        const long insertion = m_text->GetInsertionPoint();
#ifdef __EMSCRIPTEN__
        EM_ASM({
            console.log('[REPRO] textsel state: insertion=' + $0 + ' sel=' + $1 + ',' + $2);
        }, (int)insertion, (int)from, (int)to);
#endif
    }
    void OnSelMiddle(wxCommandEvent &) { m_text->SetSelection(2, 7); }
    void OnSelAll(wxCommandEvent &)    { m_text->SelectAll(); }

    wxTextCtrl *m_text = nullptr;
};

ReproFrame::ReproFrame()
    : wxFrame(nullptr, wxID_ANY, "wxTextEntry caret/selection repro")
{
    wxBoxSizer *sizer = new wxBoxSizer(wxVERTICAL);

    m_text = new wxTextCtrl(this, wxID_ANY, "hello world");
    sizer->Add(m_text, 0, wxALL | wxEXPAND, 10);

    wxButton *reportBtn = new wxButton(this, ID_REPORT, "Report");
    reportBtn->Bind(wxEVT_BUTTON, &ReproFrame::OnReport, this);
    sizer->Add(reportBtn, 0, wxALL, 10);

    wxButton *middleBtn = new wxButton(this, ID_SEL_MIDDLE, "Select Middle");
    middleBtn->Bind(wxEVT_BUTTON, &ReproFrame::OnSelMiddle, this);
    sizer->Add(middleBtn, 0, wxALL, 10);

    wxButton *allBtn = new wxButton(this, ID_SEL_ALL, "Select All");
    allBtn->Bind(wxEVT_BUTTON, &ReproFrame::OnSelAll, this);
    sizer->Add(allBtn, 0, wxALL, 10);

    SetSizer(sizer);

#ifdef __EMSCRIPTEN__
    CallAfter([] { EM_ASM({ console.log('[REPRO] textsel ready'); }); });
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
