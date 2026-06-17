// wxStaticText ellipsize-on-resize regression (DOM port).
//
// Bug (src/wasm/stattext.cpp): the label was ellipsized only inside SetLabel(),
// using the control's client size AT THAT MOMENT. A wxStaticText placed in a
// growable sizer cell (e.g. KiCad's gerbview Layers Manager, which uses
// WX_ELLIPSIZED_STATIC_TEXT) is constructed narrow and only widened later by
// layout. The DOM-port wxStaticText had no wxEVT_SIZE handler, so the visible
// label stayed truncated to the early (tiny) width — rendering "1..." instead of
// "1 tinytapeout-demo-User_2.gbr (Other, User)". Native ports re-ellipsize on
// resize via wxStaticTextBase::UpdateLabel(); the fix binds wxEVT_SIZE to do the
// same.
//
// This repro drives the exact sequence without a sizer (so the width changes are
// unambiguous): the label is set while the control is narrow (ellipsized away),
// then a button widens the control. wxST_NO_AUTORESIZE keeps our explicit width
// so the only thing that can lengthen the visible text is the resize handler.
//
//   RED  (bug present): after widening, the visible text is still the narrow
//                       ellipsization — the full name never appears.
//   GREEN (fixed):      widening re-ellipsizes; the full label becomes visible.

#include "wx/wxprec.h"
#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

// Long enough that it must be ellipsized at 60px but fits fully at >600px.
static const char* const LONG_LABEL =
    "1 tinytapeout-demo-User_2.gbr (Other, User)";

enum { ID_GROW = wxID_HIGHEST + 1 };

class EllipsizeFrame : public wxFrame
{
public:
    EllipsizeFrame()
        : wxFrame(nullptr, wxID_ANY, "stattext ellipsize repro",
                  wxDefaultPosition, wxSize(700, 200))
    {
        wxButton* grow = new wxButton(this, ID_GROW, "Grow",
                                      wxPoint(10, 10), wxSize(120, 30));
        grow->Bind(wxEVT_BUTTON, &EllipsizeFrame::OnGrow, this);

        m_text = new wxStaticText(this, wxID_ANY, wxEmptyString,
                                  wxPoint(10, 60), wxSize(60, 24),
                                  wxST_ELLIPSIZE_MIDDLE | wxST_NO_AUTORESIZE);
        // Establish a valid (but small) client width, THEN set the label, so the
        // first ellipsization happens at the narrow width.
        m_text->SetSize(60, 24);
        m_text->SetLabel(LONG_LABEL);

#ifdef __EMSCRIPTEN__
        CallAfter([] { EM_ASM({ console.log('[REPRO] stattext ready'); }); });
#endif
    }

private:
    void OnGrow(wxCommandEvent&)
    {
        // Widen past the label's natural width: the fix re-ellipsizes here (the
        // full label now fits); the bug leaves the old truncation in place.
        m_text->SetSize(640, 24);
    }

    wxStaticText* m_text = nullptr;
};

class EllipsizeApp : public wxApp
{
public:
    bool OnInit() override
    {
        if (!wxApp::OnInit())
            return false;

        (new EllipsizeFrame())->Show(true);
        return true;
    }
};

wxIMPLEMENT_APP(EllipsizeApp);
