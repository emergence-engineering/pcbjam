// wxStyledTextCtrl Test - Tests Scintilla-based text editor in WASM
// KiCad uses wxStyledTextCtrl for:
// - DRC rules editor
// - Python console
// - Custom script editors
// This is MEDIUM priority for KiCad functionality

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/stc/stc.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

class StcTestApp : public wxApp
{
public:
    virtual bool OnInit() override;
};

class StcTestFrame : public wxFrame
{
public:
    StcTestFrame();

private:
    wxStyledTextCtrl* m_stc;
    wxTextCtrl* m_log;

    void LogEvent(const wxString& msg);
    void SetupPythonLexer();
    void SetupDrcLexer();
    void SetupPlainText();

    // Event handlers
    void OnPythonMode(wxCommandEvent& evt);
    void OnDrcMode(wxCommandEvent& evt);
    void OnPlainMode(wxCommandEvent& evt);
    void OnInsertSample(wxCommandEvent& evt);
    void OnClearText(wxCommandEvent& evt);
    void OnShowLineNumbers(wxCommandEvent& evt);
    void OnFoldCode(wxCommandEvent& evt);

    // STC events
    void OnStcChange(wxStyledTextEvent& evt);
    void OnStcCharAdded(wxStyledTextEvent& evt);
    void OnStcMarginClick(wxStyledTextEvent& evt);
    void OnStcUpdateUI(wxStyledTextEvent& evt);

    wxDECLARE_EVENT_TABLE();
};

enum {
    ID_STC = wxID_HIGHEST + 1,
    ID_PYTHON_MODE,
    ID_DRC_MODE,
    ID_PLAIN_MODE,
    ID_INSERT_SAMPLE,
    ID_CLEAR_TEXT,
    ID_SHOW_LINENUMS,
    ID_FOLD_CODE
};

wxBEGIN_EVENT_TABLE(StcTestFrame, wxFrame)
    EVT_BUTTON(ID_PYTHON_MODE, StcTestFrame::OnPythonMode)
    EVT_BUTTON(ID_DRC_MODE, StcTestFrame::OnDrcMode)
    EVT_BUTTON(ID_PLAIN_MODE, StcTestFrame::OnPlainMode)
    EVT_BUTTON(ID_INSERT_SAMPLE, StcTestFrame::OnInsertSample)
    EVT_BUTTON(ID_CLEAR_TEXT, StcTestFrame::OnClearText)
    EVT_BUTTON(ID_SHOW_LINENUMS, StcTestFrame::OnShowLineNumbers)
    EVT_BUTTON(ID_FOLD_CODE, StcTestFrame::OnFoldCode)
    EVT_STC_CHANGE(ID_STC, StcTestFrame::OnStcChange)
    EVT_STC_CHARADDED(ID_STC, StcTestFrame::OnStcCharAdded)
    EVT_STC_MARGINCLICK(ID_STC, StcTestFrame::OnStcMarginClick)
    EVT_STC_UPDATEUI(ID_STC, StcTestFrame::OnStcUpdateUI)
wxEND_EVENT_TABLE()

wxIMPLEMENT_APP(StcTestApp);

bool StcTestApp::OnInit()
{
    if (!wxApp::OnInit())
        return false;

    StcTestFrame* frame = new StcTestFrame();
    frame->Show(true);
    return true;
}

StcTestFrame::StcTestFrame()
    : wxFrame(nullptr, wxID_ANY, "wxStyledTextCtrl WASM Test",
              wxDefaultPosition, wxSize(800, 700))
{
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    wxStaticText* desc = new wxStaticText(this, wxID_ANY,
        "wxStyledTextCtrl Test\n\n"
        "KiCad uses wxSTC for DRC rules editor, Python console, and script editors.\n"
        "Test syntax highlighting, line numbers, folding, and basic editing.");
    mainSizer->Add(desc, 0, wxALL, 10);

    // Button bar
    wxBoxSizer* btnSizer = new wxBoxSizer(wxHORIZONTAL);
    btnSizer->Add(new wxButton(this, ID_PYTHON_MODE, "Python"), 0, wxALL, 5);
    btnSizer->Add(new wxButton(this, ID_DRC_MODE, "DRC Rules"), 0, wxALL, 5);
    btnSizer->Add(new wxButton(this, ID_PLAIN_MODE, "Plain"), 0, wxALL, 5);
    btnSizer->Add(new wxButton(this, ID_INSERT_SAMPLE, "Insert Sample"), 0, wxALL, 5);
    btnSizer->Add(new wxButton(this, ID_CLEAR_TEXT, "Clear"), 0, wxALL, 5);
    btnSizer->Add(new wxButton(this, ID_SHOW_LINENUMS, "Line Numbers"), 0, wxALL, 5);
    btnSizer->Add(new wxButton(this, ID_FOLD_CODE, "Fold All"), 0, wxALL, 5);
    mainSizer->Add(btnSizer, 0, wxALIGN_CENTER);

    // wxStyledTextCtrl
    m_stc = new wxStyledTextCtrl(this, ID_STC, wxDefaultPosition, wxSize(-1, 350));

    // Basic styling
    wxFont font(10, wxFONTFAMILY_MODERN, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL);
    m_stc->StyleSetFont(wxSTC_STYLE_DEFAULT, font);
    m_stc->StyleClearAll();

    // Line numbers margin
    m_stc->SetMarginType(0, wxSTC_MARGIN_NUMBER);
    m_stc->SetMarginWidth(0, 40);

    // Folding margin
    m_stc->SetMarginType(1, wxSTC_MARGIN_SYMBOL);
    m_stc->SetMarginMask(1, wxSTC_MASK_FOLDERS);
    m_stc->SetMarginWidth(1, 16);
    m_stc->SetMarginSensitive(1, true);

    // Folding markers
    m_stc->MarkerDefine(wxSTC_MARKNUM_FOLDER, wxSTC_MARK_BOXPLUS);
    m_stc->MarkerDefine(wxSTC_MARKNUM_FOLDEROPEN, wxSTC_MARK_BOXMINUS);
    m_stc->MarkerDefine(wxSTC_MARKNUM_FOLDEREND, wxSTC_MARK_BOXPLUSCONNECTED);
    m_stc->MarkerDefine(wxSTC_MARKNUM_FOLDEROPENMID, wxSTC_MARK_BOXMINUSCONNECTED);
    m_stc->MarkerDefine(wxSTC_MARKNUM_FOLDERMIDTAIL, wxSTC_MARK_TCORNER);
    m_stc->MarkerDefine(wxSTC_MARKNUM_FOLDERSUB, wxSTC_MARK_VLINE);
    m_stc->MarkerDefine(wxSTC_MARKNUM_FOLDERTAIL, wxSTC_MARK_LCORNER);

    // Enable folding
    m_stc->SetProperty("fold", "1");
    m_stc->SetFoldFlags(wxSTC_FOLDFLAG_LINEBEFORE_CONTRACTED | wxSTC_FOLDFLAG_LINEAFTER_CONTRACTED);

    mainSizer->Add(m_stc, 1, wxEXPAND | wxALL, 10);

    // Event log
    wxStaticBoxSizer* logBox = new wxStaticBoxSizer(wxVERTICAL, this, "Event Log");
    m_log = new wxTextCtrl(this, wxID_ANY, "",
        wxDefaultPosition, wxSize(-1, 100), wxTE_MULTILINE | wxTE_READONLY);
    logBox->Add(m_log, 1, wxEXPAND | wxALL, 5);
    mainSizer->Add(logBox, 0, wxEXPAND | wxALL, 10);

    SetSizer(mainSizer);
    CreateStatusBar();
    SetStatusText("Ready");

    // Set initial Python mode with sample content
    SetupPythonLexer();
    m_stc->SetText(
        "# KiCad Python Console Example\n"
        "import pcbnew\n"
        "\n"
        "def list_footprints():\n"
        "    '''List all footprints on the board'''\n"
        "    board = pcbnew.GetBoard()\n"
        "    for fp in board.GetFootprints():\n"
        "        print(f\"Footprint: {fp.GetReference()}\")\n"
        "        print(f\"  Value: {fp.GetValue()}\")\n"
        "        print(f\"  Position: {fp.GetPosition()}\")\n"
        "\n"
        "# Call the function\n"
        "list_footprints()\n"
    );

    LogEvent("wxStyledTextCtrl test app started");
    LogEvent("Python mode enabled with sample code");

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[STC_TEST] wxStyledTextCtrl test app started successfully');
    });
#endif
}

void StcTestFrame::LogEvent(const wxString& msg)
{
#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[STC_EVENT] ' + UTF8ToString($0));
    }, msg.c_str().AsChar());
#endif

    if (!m_log)
        return;
    m_log->AppendText(msg + "\n");
    SetStatusText(msg);
}

void StcTestFrame::SetupPythonLexer()
{
    m_stc->SetLexer(wxSTC_LEX_PYTHON);

    // Python keywords
    m_stc->SetKeyWords(0, "and as assert async await break class continue def del elif else "
                          "except finally for from global if import in is lambda nonlocal not "
                          "or pass raise return try while with yield True False None");

    // Styling for Python
    m_stc->StyleSetForeground(wxSTC_P_DEFAULT, *wxBLACK);
    m_stc->StyleSetForeground(wxSTC_P_COMMENTLINE, wxColour(0, 128, 0)); // Green
    m_stc->StyleSetForeground(wxSTC_P_NUMBER, wxColour(128, 0, 128)); // Purple
    m_stc->StyleSetForeground(wxSTC_P_STRING, wxColour(0, 0, 128)); // Blue
    m_stc->StyleSetForeground(wxSTC_P_CHARACTER, wxColour(0, 0, 128)); // Blue
    m_stc->StyleSetForeground(wxSTC_P_WORD, wxColour(0, 0, 255)); // Bright blue
    m_stc->StyleSetBold(wxSTC_P_WORD, true);
    m_stc->StyleSetForeground(wxSTC_P_TRIPLE, wxColour(127, 0, 0)); // Dark red
    m_stc->StyleSetForeground(wxSTC_P_TRIPLEDOUBLE, wxColour(127, 0, 0)); // Dark red
    m_stc->StyleSetForeground(wxSTC_P_CLASSNAME, wxColour(0, 128, 128)); // Teal
    m_stc->StyleSetBold(wxSTC_P_CLASSNAME, true);
    m_stc->StyleSetForeground(wxSTC_P_DEFNAME, wxColour(0, 128, 128)); // Teal
    m_stc->StyleSetBold(wxSTC_P_DEFNAME, true);
    m_stc->StyleSetForeground(wxSTC_P_OPERATOR, *wxBLACK);
    m_stc->StyleSetForeground(wxSTC_P_IDENTIFIER, *wxBLACK);
    m_stc->StyleSetForeground(wxSTC_P_DECORATOR, wxColour(255, 128, 0)); // Orange

    // Enable Python-specific folding
    m_stc->SetProperty("fold.compact", "0");

    m_stc->Colourise(0, -1);
    LogEvent("Python lexer configured");
}

void StcTestFrame::SetupDrcLexer()
{
    // DRC rules are similar to S-expressions - use Lisp lexer
    m_stc->SetLexer(wxSTC_LEX_LISP);

    // Keywords for DRC rules
    m_stc->SetKeyWords(0, "version rule condition constraint layer net type "
                          "min max opt clearance track_width via_diameter "
                          "hole_size annular_width silk_clearance courtyward_clearance");

    // Styling for DRC (Lisp-like)
    m_stc->StyleSetForeground(wxSTC_LISP_DEFAULT, *wxBLACK);
    m_stc->StyleSetForeground(wxSTC_LISP_COMMENT, wxColour(0, 128, 0)); // Green
    m_stc->StyleSetForeground(wxSTC_LISP_NUMBER, wxColour(128, 0, 128)); // Purple
    m_stc->StyleSetForeground(wxSTC_LISP_KEYWORD, wxColour(0, 0, 255)); // Bright blue
    m_stc->StyleSetBold(wxSTC_LISP_KEYWORD, true);
    m_stc->StyleSetForeground(wxSTC_LISP_STRING, wxColour(0, 0, 128)); // Blue
    m_stc->StyleSetForeground(wxSTC_LISP_OPERATOR, wxColour(128, 0, 0)); // Red

    m_stc->Colourise(0, -1);
    LogEvent("DRC rules lexer configured");
}

void StcTestFrame::SetupPlainText()
{
    m_stc->SetLexer(wxSTC_LEX_NULL);
    m_stc->StyleSetForeground(wxSTC_STYLE_DEFAULT, *wxBLACK);
    m_stc->StyleSetBackground(wxSTC_STYLE_DEFAULT, *wxWHITE);
    m_stc->StyleClearAll();
    LogEvent("Plain text mode enabled");
}

void StcTestFrame::OnPythonMode(wxCommandEvent& WXUNUSED(evt))
{
    SetupPythonLexer();
    if (m_stc->GetTextLength() == 0) {
        m_stc->SetText(
            "# Python code here\n"
            "import pcbnew\n"
            "\n"
            "board = pcbnew.GetBoard()\n"
            "print(board)\n"
        );
    } else {
        m_stc->Colourise(0, -1);
    }
}

void StcTestFrame::OnDrcMode(wxCommandEvent& WXUNUSED(evt))
{
    SetupDrcLexer();
    if (m_stc->GetTextLength() == 0) {
        m_stc->SetText(
            "; KiCad DRC Rules Example\n"
            "(version 1)\n"
            "\n"
            "(rule \"Minimum track width\"\n"
            "   (condition \"A.Type == 'track'\")\n"
            "   (constraint track_width (min 0.2mm)))\n"
            "\n"
            "(rule \"Via size\"\n"
            "   (condition \"A.Type == 'via'\")\n"
            "   (constraint via_diameter (min 0.6mm))\n"
            "   (constraint hole_size (min 0.3mm)))\n"
        );
    } else {
        m_stc->Colourise(0, -1);
    }
}

void StcTestFrame::OnPlainMode(wxCommandEvent& WXUNUSED(evt))
{
    SetupPlainText();
}

void StcTestFrame::OnInsertSample(wxCommandEvent& WXUNUSED(evt))
{
    static int sampleNum = 1;
    wxString sample = wxString::Format("\n# Sample insertion %d\nx = %d\nprint(x)\n", sampleNum, sampleNum);
    m_stc->AppendText(sample);
    LogEvent(wxString::Format("Inserted sample code #%d", sampleNum));
    sampleNum++;
}

void StcTestFrame::OnClearText(wxCommandEvent& WXUNUSED(evt))
{
    m_stc->ClearAll();
    LogEvent("Text cleared");
}

void StcTestFrame::OnShowLineNumbers(wxCommandEvent& WXUNUSED(evt))
{
    // Toggle line numbers
    if (m_stc->GetMarginWidth(0) > 0) {
        m_stc->SetMarginWidth(0, 0);
        LogEvent("Line numbers hidden");
    } else {
        m_stc->SetMarginWidth(0, 40);
        LogEvent("Line numbers shown");
    }
}

void StcTestFrame::OnFoldCode(wxCommandEvent& WXUNUSED(evt))
{
    // Fold all
    for (int line = 0; line < m_stc->GetLineCount(); line++) {
        int level = m_stc->GetFoldLevel(line);
        if (level & wxSTC_FOLDLEVELHEADERFLAG) {
            if (m_stc->GetFoldExpanded(line)) {
                m_stc->ToggleFold(line);
            }
        }
    }
    LogEvent("All code folded");
}

void StcTestFrame::OnStcChange(wxStyledTextEvent& evt)
{
    // Don't log every character - too noisy
    // Only log significant changes
    static int changeCount = 0;
    changeCount++;
    if (changeCount % 10 == 0) {
        LogEvent(wxString::Format("Text changed (%d modifications)", changeCount));
    }
    evt.Skip();
}

void StcTestFrame::OnStcCharAdded(wxStyledTextEvent& evt)
{
    int ch = evt.GetKey();
    if (ch == '\n') {
        // Auto-indent after newline
        int currentLine = m_stc->GetCurrentLine();
        if (currentLine > 0) {
            int prevLineIndent = m_stc->GetLineIndentation(currentLine - 1);
            m_stc->SetLineIndentation(currentLine, prevLineIndent);
            m_stc->GotoPos(m_stc->GetLineIndentPosition(currentLine));
        }
        LogEvent("Auto-indent applied");
    }
    evt.Skip();
}

void StcTestFrame::OnStcMarginClick(wxStyledTextEvent& evt)
{
    int line = m_stc->LineFromPosition(evt.GetPosition());
    int margin = evt.GetMargin();

    if (margin == 1) { // Folding margin
        int level = m_stc->GetFoldLevel(line);
        if (level & wxSTC_FOLDLEVELHEADERFLAG) {
            m_stc->ToggleFold(line);
            LogEvent(wxString::Format("Toggled fold at line %d", line + 1));
        }
    }
    evt.Skip();
}

void StcTestFrame::OnStcUpdateUI(wxStyledTextEvent& evt)
{
    // Update status bar with cursor position
    int pos = m_stc->GetCurrentPos();
    int line = m_stc->GetCurrentLine();
    int col = m_stc->GetColumn(pos);
    SetStatusText(wxString::Format("Line %d, Col %d", line + 1, col + 1));
    evt.Skip();
}
