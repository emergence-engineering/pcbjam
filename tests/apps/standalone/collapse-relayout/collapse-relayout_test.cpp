// collapse-relayout test — reproduces the pcbnew "Layer Display Options" bug.
//
// In pcbnew's Appearance sidebar, the Layers notebook page holds a proportion-1
// wxScrolledCanvas layer list above a collapsible "Layer Display Options" pane.
// On toggle, KiCad runs `Freeze(); page->Fit(); outerSizer->Layout(); Thaw();`.
// In the WASM DOM port that permanently collapses the layer list: page->Fit()
// shrinks the notebook page to content-min (a scrolled window reports a tiny
// best height when vertical scrolling is enabled, see wxScrolledT_Helper::
// FilterBestSize), and the following outer Layout() re-asserts the *notebook*
// at its UNCHANGED size — which the DOM port's DoSetSize() treats as a no-op
// that never fires wxEVT_SIZE, so wxNotebook::DoSize() never restores the page.
// The list stays at height 0 (its rows clip-pathed away) until reload.
//
// This app mirrors that exact structure with stock widgets so the failure can
// be reproduced and regression-tested without KiCad.

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/collpane.h"
#include "wx/notebook.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

namespace
{
const char* const kLayerNames[] = {
    "top_cu",       "bottom_cu",     "F.Adhesive",    "B.Adhesive",
    "F.Paste",      "B.Paste",       "F.Silkscreen",  "B.Silkscreen",
    "F.Mask",       "B.Mask",        "User.Drawings", "User.Comments",
    "User.Eco1",    "User.Eco2",     "Edge.Cuts",
};

const wxColour kSwatchColours[] = {
    wxColour(200,  52,  52), wxColour( 77, 127, 196), wxColour(107,  33, 125),
    wxColour( 20,  20, 120), wxColour(140, 130, 130), wxColour( 40, 160, 160),
    wxColour(224, 224, 122), wxColour(224, 160, 160), wxColour( 96,  40, 112),
    wxColour( 32, 112, 112), wxColour(200, 200, 210), wxColour( 90, 140, 200),
    wxColour(160, 224, 224), wxColour(200, 190,  60), wxColour(210, 210, 210),
};
}

class CollapseRelayoutApp : public wxApp
{
public:
    virtual bool OnInit() override;
};

class CollapseRelayoutFrame : public wxFrame
{
public:
    CollapseRelayoutFrame();

private:
    wxNotebook*        m_notebook  = nullptr;
    wxPanel*           m_page      = nullptr;   // the "Layers" notebook page
    wxScrolledWindow*  m_scrolled  = nullptr;   // the layer list ("layerlist")
    wxCollapsiblePane* m_pane      = nullptr;   // "Layer Display Options"

    void BuildLayerRows();
    void BuildDisplayOptions();
    void OnPaneChanged(wxCollapsiblePaneEvent& evt);

    wxDECLARE_EVENT_TABLE();
};

enum { ID_DISPLAY_PANE = wxID_HIGHEST + 1 };

wxBEGIN_EVENT_TABLE(CollapseRelayoutFrame, wxFrame)
    EVT_COLLAPSIBLEPANE_CHANGED(ID_DISPLAY_PANE, CollapseRelayoutFrame::OnPaneChanged)
wxEND_EVENT_TABLE()

wxIMPLEMENT_APP(CollapseRelayoutApp);

bool CollapseRelayoutApp::OnInit()
{
    if (!wxApp::OnInit())
        return false;

    (new CollapseRelayoutFrame())->Show(true);
    return true;
}

CollapseRelayoutFrame::CollapseRelayoutFrame()
    : wxFrame(nullptr, wxID_ANY, "collapse-relayout WASM Test",
              wxDefaultPosition, wxSize(420, 820))
{
    // Frame  ->  notebook (prop 1)  ->  page  ->  [ scrolled (prop 1), pane (prop 0) ]
    wxBoxSizer* frameSizer = new wxBoxSizer(wxVERTICAL);

    m_notebook = new wxNotebook(this, wxID_ANY);

    m_page = new wxPanel(m_notebook, wxID_ANY);
    wxBoxSizer* pageSizer = new wxBoxSizer(wxVERTICAL);

    // The layer list: proportion 1, vertical scrolling. Named so the e2e test
    // can read its geometry from the element registry.
    m_scrolled = new wxScrolledWindow(m_page, wxID_ANY, wxDefaultPosition,
                                      wxDefaultSize, wxVSCROLL);
    m_scrolled->SetName("layerlist");
    m_scrolled->SetScrollRate(0, 5);   // vertical scroll -> best height caps to ~0
    BuildLayerRows();
    pageSizer->Add(m_scrolled, 1, wxEXPAND);

    // "Layer Display Options": proportion 0, starts collapsed (like KiCad).
    m_pane = new wxCollapsiblePane(m_page, ID_DISPLAY_PANE, "Layer Display Options");
    BuildDisplayOptions();
    pageSizer->Add(m_pane, 0, wxEXPAND | wxALL, 5);

    m_page->SetSizer(pageSizer);
    m_notebook->AddPage(m_page, "Layers", true);

    frameSizer->Add(m_notebook, 1, wxEXPAND);
    SetSizer(frameSizer);

    // A plain wxScrolledWindow doesn't appear in the JS element registry (its
    // Create() runs during base construction, so it's skipped as a base type),
    // so the test can't read its geometry from the registry. Report the height
    // directly from C++ instead: once after the initial layout settles...
    CallAfter([this]() {
#ifdef __EMSCRIPTEN__
        EM_ASM({ console.log('[COLLAPSE_RELAYOUT] initial layerlist height = ' + $0); },
               m_scrolled->GetSize().GetHeight());
#endif
    });

#ifdef __EMSCRIPTEN__
    EM_ASM({ console.log('[COLLAPSE_RELAYOUT] app started'); });
#endif
}

void CollapseRelayoutFrame::BuildLayerRows()
{
    wxBoxSizer* listSizer = new wxBoxSizer(wxVERTICAL);

    for (size_t i = 0; i < WXSIZEOF(kLayerNames); ++i)
    {
        wxPanel* row = new wxPanel(m_scrolled, wxID_ANY);
        wxBoxSizer* rowSizer = new wxBoxSizer(wxHORIZONTAL);

        wxPanel* swatch = new wxPanel(row, wxID_ANY, wxDefaultPosition, wxSize(24, 16));
        swatch->SetBackgroundColour(kSwatchColours[i]);
        rowSizer->Add(swatch, 0, wxALIGN_CENTER_VERTICAL | wxALL, 4);

        rowSizer->Add(new wxStaticText(row, wxID_ANY, kLayerNames[i]),
                      1, wxALIGN_CENTER_VERTICAL | wxALL, 4);

        row->SetSizer(rowSizer);
        listSizer->Add(row, 0, wxEXPAND);
    }

    m_scrolled->SetSizer(listSizer);
    m_scrolled->FitInside();   // grow the virtual area to hold all rows
}

void CollapseRelayoutFrame::BuildDisplayOptions()
{
    wxWindow* paneWin = m_pane->GetPane();
    wxBoxSizer* s = new wxBoxSizer(wxVERTICAL);

    s->Add(new wxStaticText(paneWin, wxID_ANY, "Inactive layers (H):"), 0, wxALL, 4);

    wxBoxSizer* modes = new wxBoxSizer(wxHORIZONTAL);
    modes->Add(new wxRadioButton(paneWin, wxID_ANY, "Normal",
                                 wxDefaultPosition, wxDefaultSize, wxRB_GROUP),
               0, wxALL, 4);
    modes->Add(new wxRadioButton(paneWin, wxID_ANY, "Dim"),  0, wxALL, 4);
    modes->Add(new wxRadioButton(paneWin, wxID_ANY, "Hide"), 0, wxALL, 4);
    s->Add(modes, 0, wxEXPAND);

    s->Add(new wxCheckBox(paneWin, wxID_ANY, "Flip board view"), 0, wxALL, 4);

    paneWin->SetSizer(s);
    s->Fit(paneWin);
}

// Replicates KiCad's WX_COLLAPSIBLE_PANE_CHANGED handler in
// pcbnew/widgets/appearance_controls.cpp (the Freeze / page->Fit / outer
// Layout / Thaw idiom) that triggers the bug.
void CollapseRelayoutFrame::OnPaneChanged(wxCollapsiblePaneEvent& WXUNUSED(evt))
{
    Freeze();
    m_page->Fit();          // shrink the notebook page to content-min
    GetSizer()->Layout();   // re-assert the notebook at its UNCHANGED size
    Thaw();

#ifdef __EMSCRIPTEN__
    // With the bug the list collapses to ~0; after the fix it stays tall.
    EM_ASM({ console.log('[COLLAPSE_RELAYOUT] layerlist height after toggle = ' + $0); },
           m_scrolled->GetSize().GetHeight());
#endif
}
