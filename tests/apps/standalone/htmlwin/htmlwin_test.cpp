// wxHtmlWindow Test - Tests HTML Window in WASM
// KiCad uses wxHtmlWindow for About dialogs, error formatting, and descriptions
// instead of wxRichTextCtrl

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/html/htmlwin.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

class HtmlWinTestApp : public wxApp
{
public:
    virtual bool OnInit() override;
};

class HtmlWinTestFrame : public wxFrame
{
public:
    HtmlWinTestFrame();

private:
    wxHtmlWindow* m_htmlWin;
    wxTextCtrl* m_log;

    void LogEvent(const wxString& msg);
    void SetBasicContent();
    void SetTableContent();
    void SetLongContent();

    void OnLinkClicked(wxHtmlLinkEvent& evt);
    void OnBasicContent(wxCommandEvent& evt);
    void OnTableContent(wxCommandEvent& evt);
    void OnLongContent(wxCommandEvent& evt);
    void OnKiCadAbout(wxCommandEvent& evt);

    wxDECLARE_EVENT_TABLE();
};

enum {
    ID_HTML = wxID_HIGHEST + 1,
    ID_BASIC_CONTENT,
    ID_TABLE_CONTENT,
    ID_LONG_CONTENT,
    ID_KICAD_ABOUT
};

wxBEGIN_EVENT_TABLE(HtmlWinTestFrame, wxFrame)
    EVT_HTML_LINK_CLICKED(ID_HTML, HtmlWinTestFrame::OnLinkClicked)
    EVT_BUTTON(ID_BASIC_CONTENT, HtmlWinTestFrame::OnBasicContent)
    EVT_BUTTON(ID_TABLE_CONTENT, HtmlWinTestFrame::OnTableContent)
    EVT_BUTTON(ID_LONG_CONTENT, HtmlWinTestFrame::OnLongContent)
    EVT_BUTTON(ID_KICAD_ABOUT, HtmlWinTestFrame::OnKiCadAbout)
wxEND_EVENT_TABLE()

wxIMPLEMENT_APP(HtmlWinTestApp);

bool HtmlWinTestApp::OnInit()
{
    if (!wxApp::OnInit())
        return false;

    HtmlWinTestFrame* frame = new HtmlWinTestFrame();
    frame->Show(true);
    return true;
}

HtmlWinTestFrame::HtmlWinTestFrame()
    : wxFrame(nullptr, wxID_ANY, "wxHtmlWindow WASM Test",
              wxDefaultPosition, wxSize(700, 650))
{
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    wxStaticText* desc = new wxStaticText(this, wxID_ANY,
        "wxHtmlWindow Test\n\n"
        "KiCad uses HtmlWindow for About dialogs, error messages, and symbol descriptions.\n"
        "Click buttons to load different HTML content.");
    mainSizer->Add(desc, 0, wxALL, 10);

    // Button bar
    wxBoxSizer* btnSizer = new wxBoxSizer(wxHORIZONTAL);
    btnSizer->Add(new wxButton(this, ID_BASIC_CONTENT, "Basic HTML"), 0, wxALL, 5);
    btnSizer->Add(new wxButton(this, ID_TABLE_CONTENT, "Tables"), 0, wxALL, 5);
    btnSizer->Add(new wxButton(this, ID_LONG_CONTENT, "Long Content"), 0, wxALL, 5);
    btnSizer->Add(new wxButton(this, ID_KICAD_ABOUT, "KiCad-style About"), 0, wxALL, 5);
    mainSizer->Add(btnSizer, 0, wxALIGN_CENTER);

    // HTML Window
    m_htmlWin = new wxHtmlWindow(this, ID_HTML, wxDefaultPosition, wxSize(-1, 300),
        wxHW_SCROLLBAR_AUTO | wxSUNKEN_BORDER);
    mainSizer->Add(m_htmlWin, 1, wxEXPAND | wxALL, 10);

    // Event log
    wxStaticBoxSizer* logBox = new wxStaticBoxSizer(wxVERTICAL, this, "Event Log");
    m_log = new wxTextCtrl(this, wxID_ANY, "",
        wxDefaultPosition, wxSize(-1, 120), wxTE_MULTILINE | wxTE_READONLY);
    logBox->Add(m_log, 1, wxEXPAND | wxALL, 5);
    mainSizer->Add(logBox, 0, wxEXPAND | wxALL, 10);

    SetSizer(mainSizer);
    CreateStatusBar();
    SetStatusText("Ready");

    // Set initial content
    SetBasicContent();

    LogEvent("HtmlWindow test app started");
    LogEvent("Initial content loaded");

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[HTMLWIN_TEST] wxHtmlWindow test app started successfully');
    });
#endif
}

void HtmlWinTestFrame::LogEvent(const wxString& msg)
{
#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[HTMLWIN_EVENT] ' + UTF8ToString($0));
    }, msg.c_str().AsChar());
#endif

    if (!m_log)
        return;
    m_log->AppendText(msg + "\n");
    SetStatusText(msg);
}

void HtmlWinTestFrame::SetBasicContent()
{
    wxString html = R"(
<html>
<body>
<h1>Basic HTML Test</h1>
<p>This tests <b>bold</b>, <i>italic</i>, and <u>underlined</u> text.</p>

<h2>Lists</h2>
<ul>
    <li>Unordered item 1</li>
    <li>Unordered item 2</li>
    <li>Unordered item 3</li>
</ul>

<ol>
    <li>Ordered item 1</li>
    <li>Ordered item 2</li>
    <li>Ordered item 3</li>
</ol>

<h2>Links</h2>
<p>Click this <a href="test://link1">test link</a> to fire an event.</p>
<p>Another <a href="test://link2">second link</a> for testing.</p>

<h2>Colors</h2>
<p><font color="red">Red text</font>,
   <font color="green">green text</font>,
   <font color="blue">blue text</font>.</p>

<h2>Horizontal Rule</h2>
<hr>
<p>Content below the line.</p>
</body>
</html>
)";
    m_htmlWin->SetPage(html);
    LogEvent("Loaded basic HTML content");
}

void HtmlWinTestFrame::SetTableContent()
{
    wxString html = R"(
<html>
<body>
<h1>Table Test</h1>
<p>This tests HTML tables similar to KiCad's component info display.</p>

<h2>Component Properties</h2>
<table border="1" cellpadding="5">
    <tr bgcolor="#CCCCCC">
        <th>Property</th>
        <th>Value</th>
    </tr>
    <tr>
        <td>Reference</td>
        <td>U1</td>
    </tr>
    <tr>
        <td>Value</td>
        <td>STM32F103C8</td>
    </tr>
    <tr>
        <td>Footprint</td>
        <td>LQFP-48</td>
    </tr>
    <tr>
        <td>Datasheet</td>
        <td><a href="test://datasheet">View PDF</a></td>
    </tr>
</table>

<h2>Pin Table</h2>
<table border="1" cellpadding="3">
    <tr bgcolor="#E0E0E0">
        <th>Pin</th>
        <th>Name</th>
        <th>Type</th>
        <th>Net</th>
    </tr>
    <tr>
        <td>1</td>
        <td>VCC</td>
        <td>Power</td>
        <td>+3V3</td>
    </tr>
    <tr>
        <td>2</td>
        <td>GND</td>
        <td>Power</td>
        <td>GND</td>
    </tr>
    <tr>
        <td>3</td>
        <td>PA0</td>
        <td>I/O</td>
        <td>Net1</td>
    </tr>
    <tr>
        <td>4</td>
        <td>PA1</td>
        <td>I/O</td>
        <td>Net2</td>
    </tr>
</table>
</body>
</html>
)";
    m_htmlWin->SetPage(html);
    LogEvent("Loaded table HTML content");
}

void HtmlWinTestFrame::SetLongContent()
{
    wxString html = R"(<html><body>
<h1>Long Scrollable Content</h1>
<p>This tests scrolling behavior with long content.</p>
)";

    // Generate long content
    for (int i = 1; i <= 30; i++) {
        html += wxString::Format(
            "<h3>Section %d</h3>\n"
            "<p>This is paragraph %d of the long content test. "
            "It contains enough text to verify scrolling works correctly "
            "in the wxHtmlWindow WASM implementation.</p>\n",
            i, i
        );
    }

    html += "</body></html>";
    m_htmlWin->SetPage(html);
    LogEvent("Loaded long scrollable content (30 sections)");
}

void HtmlWinTestFrame::OnLinkClicked(wxHtmlLinkEvent& evt)
{
    wxString href = evt.GetLinkInfo().GetHref();
    LogEvent(wxString::Format("Link clicked: '%s'", href));

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[HTMLWIN_LINK] Link clicked: ' + UTF8ToString($0));
    }, href.c_str().AsChar());
#endif
}

void HtmlWinTestFrame::OnBasicContent(wxCommandEvent& WXUNUSED(evt))
{
    SetBasicContent();
}

void HtmlWinTestFrame::OnTableContent(wxCommandEvent& WXUNUSED(evt))
{
    SetTableContent();
}

void HtmlWinTestFrame::OnLongContent(wxCommandEvent& WXUNUSED(evt))
{
    SetLongContent();
}

void HtmlWinTestFrame::OnKiCadAbout(wxCommandEvent& WXUNUSED(evt))
{
    wxString html = R"(
<html>
<body>
<center>
<h1>KiCad EDA</h1>
<p><b>Version 8.0.0</b></p>
<p>An open source EDA suite for schematic capture<br>
and PCB design.</p>
<hr width="50%">

<table border="0">
    <tr>
        <td align="right"><b>Build:</b></td>
        <td>WASM (Emscripten)</td>
    </tr>
    <tr>
        <td align="right"><b>Platform:</b></td>
        <td>Web Browser</td>
    </tr>
    <tr>
        <td align="right"><b>wxWidgets:</b></td>
        <td>3.3.0</td>
    </tr>
</table>

<hr width="50%">

<h3>Libraries</h3>
<p>
<a href="test://wxwidgets">wxWidgets</a> |
<a href="test://boost">Boost</a> |
<a href="test://opencascade">OpenCASCADE</a>
</p>

<h3>License</h3>
<p>KiCad is free software licensed under the<br>
<a href="test://gpl">GNU General Public License v3</a></p>

<p><font size="-1">Copyright (c) 2024 KiCad Developers</font></p>
</center>
</body>
</html>
)";
    m_htmlWin->SetPage(html);
    LogEvent("Loaded KiCad-style About content");
}
