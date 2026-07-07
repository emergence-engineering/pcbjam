// wxStaticText must consume the mnemonic '&' like the native ports (DOM port).
//
// Bug (src/wasm/stattext.cpp, WXSetVisibleLabel):
//   The visible label is pushed to the DOM verbatim (wxDomSetText), so a wx
//   mnemonic marker '&' shows up literally. Native ports strip/interpret it:
//   wxGTK runs GTKConvertMnemonics() + gtk_label_set_text_with_mnemonic(), so
//   "&File" displays as "File" and "&&" collapses to a single "&".
//
//   KiCad has ~17 dialog labels that carry a '&' (pin properties, find/replace,
//   defaults dialogs, ...) which render with a stray '&' in WASM.
//
// The app creates one wxStaticText whose label exercises both rules; the spec
// reads the rendered <span>:
//   RED  (bug present): the <span> shows "&Layer && Net".
//   GREEN (fixed):      the <span> shows "Layer & Net".

#include "wx/wxprec.h"
#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

class ReproFrame : public wxFrame
{
public:
    ReproFrame()
        : wxFrame(nullptr, wxID_ANY, "wxStaticText mnemonic repro",
                  wxDefaultPosition, wxSize(320, 120))
    {
        wxBoxSizer *sizer = new wxBoxSizer(wxVERTICAL);
        // "&Layer" -> mnemonic 'L' removed -> "Layer"; "&&" -> "&".
        sizer->Add(new wxStaticText(this, wxID_ANY, "&Layer && Net"),
                   0, wxALL, 16);
        SetSizer(sizer);

#ifdef __EMSCRIPTEN__
        CallAfter([] { EM_ASM({ console.log('[REPRO] stattext-mnemonic ready'); }); });
#endif
    }
};

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
