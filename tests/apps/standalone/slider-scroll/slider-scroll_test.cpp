// wxSlider must fire the wxEVT_SCROLL_* family, not only wxEVT_SLIDER (DOM port).
//
// Bug (src/wasm/slider.cpp, OnDomEvent):
//   On a DOM 'input' the slider builds ONLY a wxEVT_SLIDER command event:
//       wxCommandEvent event(wxEVT_SLIDER, GetId());
//       ...
//       // TODO(dom-phase-3): also fire the wxScrollEvent family
//       // (wxEVT_SCROLL_THUMBTRACK/THUMBRELEASE/CHANGED).
//   Native ports fire the wxEVT_SCROLL_* scroll-event family first, then
//   wxEVT_SLIDER (src/gtk/slider.cpp).
//
//   This breaks KiCad's colour picker: dialog_color_picker_base.cpp connects the
//   brightness AND transparency sliders EXCLUSIVELY to wxEVT_SCROLL_* (->
//   OnChangeBrightness / OnChangeAlpha). In WASM, dragging them did nothing.
//
// This app binds a slider to wxEVT_SCROLL_THUMBTRACK and wxEVT_SCROLL_CHANGED
// (NOT wxEVT_SLIDER), exactly like the colour picker. The spec drives the real
// <input type=range>:
//   RED  (bug present): the scroll handlers never run -> no [REPRO] scroll lines.
//   GREEN (fixed):      thumbtrack + changed fire with the dragged value.

#include "wx/wxprec.h"
#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/slider.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

static void Repro(const wxString& line)
{
#ifdef __EMSCRIPTEN__
    EM_ASM({ console.log('[REPRO] ' + UTF8ToString($0)); },
           (const char *)line.utf8_str());
#endif
}

class ReproFrame : public wxFrame
{
public:
    ReproFrame();

private:
    void OnThumbtrack(wxScrollEvent &e)
        { Repro(wxString::Format("slider_thumbtrack: %d", e.GetPosition())); }
    void OnChanged(wxScrollEvent &e)
        { Repro(wxString::Format("slider_changed: %d", e.GetPosition())); }
    // regression guard: the command event must keep working too
    void OnCommand(wxCommandEvent &e)
        { Repro(wxString::Format("slider_command: %d", e.GetInt())); }
};

ReproFrame::ReproFrame()
    : wxFrame(nullptr, wxID_ANY, "wxSlider scroll-event repro",
              wxDefaultPosition, wxSize(360, 140))
{
    wxBoxSizer *sizer = new wxBoxSizer(wxVERTICAL);

    wxSlider *slider = new wxSlider(this, wxID_ANY, 0, 0, 100);
    // The colour picker binds ONLY the scroll family — no wxEVT_SLIDER.
    slider->Bind(wxEVT_SCROLL_THUMBTRACK, &ReproFrame::OnThumbtrack, this);
    slider->Bind(wxEVT_SCROLL_CHANGED, &ReproFrame::OnChanged, this);
    slider->Bind(wxEVT_SLIDER, &ReproFrame::OnCommand, this);
    sizer->Add(slider, 0, wxALL | wxEXPAND, 16);

    SetSizer(sizer);

#ifdef __EMSCRIPTEN__
    CallAfter([] { EM_ASM({ console.log('[REPRO] slider ready'); }); });
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
