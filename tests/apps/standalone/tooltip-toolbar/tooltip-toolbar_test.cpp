// wxAuiToolBar per-tool tooltip reproduction (DOM port).
//
// KiCad's ACTION_TOOLBAR derives from wxAuiToolBar, whose tool buttons are
// painted "islands" inside ONE wxWindow. Tooltips for painted windows are
// driven by the C++ hover layer (src/wasm/tooltip.cpp), armed from
// wxApp::HandleMouseEvent ONLY when the hovered wxWindow changes — and BEFORE
// the motion is dispatched to the toolbar. Two failures result:
//
//   1. Entering the toolbar arms the tooltip timer before wxAuiToolBar::OnMotion
//      has set the hovered tool's short-help as the toolbar's tooltip, so the
//      layer reads empty text and often never shows anything ("not always
//      shows").
//   2. Moving between two tools on the SAME toolbar never changes g_mouseWindow,
//      so the layer is never re-armed and the tooltip never updates ("doesn't
//      update when moving to another button").
//
// This app lays out a wxAuiToolBar with three tools (TOOLTIP_A/B/C) and logs
// each tool's #canvas-relative rect. The e2e (dom-port-bugs.spec.ts) moves the
// real pointer over the tools and asserts the #wx-tooltip element shows and
// updates: RED before the wasm-layer fix, GREEN after.

#include "wx/wxprec.h"
#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/aui/aui.h"
#include "wx/artprov.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

enum
{
    ID_TOOL_A = wxID_HIGHEST + 1,
    ID_TOOL_B,
    ID_TOOL_C
};

class ReproFrame : public wxFrame
{
public:
    ReproFrame();

private:
    wxAuiToolBar *m_toolbar;

    void EmitLayout();
    void LogToolRect(const char *name, int toolId);
};

ReproFrame::ReproFrame()
    : wxFrame(nullptr, wxID_ANY, "wxAuiToolBar tooltip repro",
              wxDefaultPosition, wxSize(640, 400))
{
    m_toolbar = new wxAuiToolBar(this, wxID_ANY, wxDefaultPosition,
                                 wxDefaultSize, wxAUI_TB_HORIZONTAL);

    // short-help string == the per-tool tooltip text wxAuiToolBar::OnMotion
    // pushes onto itself via SetToolTip().
    m_toolbar->AddTool(ID_TOOL_A, "A",
        wxArtProvider::GetBitmap(wxART_NEW, wxART_TOOLBAR), "TOOLTIP_A");
    m_toolbar->AddTool(ID_TOOL_B, "B",
        wxArtProvider::GetBitmap(wxART_FILE_OPEN, wxART_TOOLBAR), "TOOLTIP_B");
    m_toolbar->AddTool(ID_TOOL_C, "C",
        wxArtProvider::GetBitmap(wxART_FILE_SAVE, wxART_TOOLBAR), "TOOLTIP_C");
    m_toolbar->Realize();

    wxBoxSizer *sizer = new wxBoxSizer(wxVERTICAL);
    sizer->Add(m_toolbar, 0, wxEXPAND);
    sizer->Add(new wxPanel(this, wxID_ANY), 1, wxEXPAND);
    SetSizer(sizer);
    Layout();

    // Emit tool rects once layout has settled.
    CallAfter(&ReproFrame::EmitLayout);
}

void ReproFrame::LogToolRect(const char *name, int toolId)
{
    const wxRect r = m_toolbar->GetToolRect(toolId);
    const wxPoint tl = m_toolbar->ClientToScreen(r.GetTopLeft());

#ifdef __EMSCRIPTEN__
    // #canvas-relative (wx "screen") coords; the e2e adds the #canvas origin.
    EM_ASM({
        console.log('[REPRO] toolrect ' + UTF8ToString($0) + ' ' +
                    $1 + ' ' + $2 + ' ' + $3 + ' ' + $4);
    }, name, tl.x, tl.y, r.GetWidth(), r.GetHeight());
#else
    (void)name; (void)tl; (void)r;
#endif
}

void ReproFrame::EmitLayout()
{
    LogToolRect("TOOLTIP_A", ID_TOOL_A);
    LogToolRect("TOOLTIP_B", ID_TOOL_B);
    LogToolRect("TOOLTIP_C", ID_TOOL_C);

#ifdef __EMSCRIPTEN__
    EM_ASM({ console.log('[REPRO] tooltip-toolbar ready'); });
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
