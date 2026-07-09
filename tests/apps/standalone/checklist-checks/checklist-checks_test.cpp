// wxCheckListBox check marks must survive item-list rebuilds (DOM port).
//
// Bug (src/wasm/listbox.cpp + checklst.cpp):
//   Any Append/Insert/Delete/SetString on the (check)listbox calls
//   wxListBox::WasmSyncItems(), which rebuilds every DOM row UNCHECKED
//   (wxDomSetItems) and then re-applies only m_itemsSelected via
//   WasmSyncSelection(). wxCheckListBox keeps its check state in a SEPARATE
//   array m_itemsChecked that is never re-pushed — and the DOM checklist has a
//   single boolean per row (wxDomSetItemSelected drives the row checkbox). So
//   every Check() done before a later Append() is wiped from the DOM.
//
//   The canonical KiCad pattern is Append-then-Check in a loop:
//       int i = clb->Append(name);
//       if (enabled) clb->Check(i);
//   (dialog_plot.cpp, dialog_print_*.cpp, ...). Each Append rebuilds the rows
//   unchecked, so all but the final Append's check vanish — the Plot/Print
//   layer checklists show the wrong checkboxes even though the C++ cache is fine.
//
// This app appends 5 rows and checks the even indices (0, 2, 4) with that exact
// Append-then-Check pattern. The spec reads the live DOM checkboxes:
//   RED  (bug present): only the last-checked row (4) is checked in the DOM.
//   GREEN (fixed):      rows 0, 2, 4 are checked; rows 1, 3 are not.

#include "wx/wxprec.h"
#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/checklst.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

class ReproFrame : public wxFrame
{
public:
    ReproFrame();
};

ReproFrame::ReproFrame()
    : wxFrame(nullptr, wxID_ANY, "wxCheckListBox checks repro",
              wxDefaultPosition, wxSize(320, 280))
{
    wxBoxSizer *sizer = new wxBoxSizer(wxVERTICAL);

    wxCheckListBox *clb = new wxCheckListBox(this, wxID_ANY);
    sizer->Add(clb, 1, wxALL | wxEXPAND, 10);

    // Append-then-Check loop, exactly like KiCad's layer checklists.
    for (int i = 0; i < 5; i++)
    {
        const int n = clb->Append(wxString::Format("Layer %d", i));
        if (i % 2 == 0)        // check the even rows: 0, 2, 4
            clb->Check(n, true);
    }

    SetSizer(sizer);

#ifdef __EMSCRIPTEN__
    CallAfter([] { EM_ASM({ console.log('[REPRO] checklist ready'); }); });
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
