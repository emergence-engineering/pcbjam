// wxClipboard Test - Tests clipboard functionality in WASM
// KiCad uses clipboard for copy/paste of schematic symbols, PCB components, text

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/clipbrd.h"
#include "wx/dataobj.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

class ClipboardTestApp : public wxApp
{
public:
    virtual bool OnInit() override;
};

class ClipboardTestFrame : public wxFrame
{
public:
    ClipboardTestFrame();

private:
    wxTextCtrl* m_input;
    wxTextCtrl* m_output;
    wxTextCtrl* m_log;

    void LogEvent(const wxString& msg);

    void OnCopyText(wxCommandEvent& evt);
    void OnPasteText(wxCommandEvent& evt);
    void OnClearClipboard(wxCommandEvent& evt);
    void OnCheckClipboard(wxCommandEvent& evt);

    wxDECLARE_EVENT_TABLE();
};

enum {
    ID_COPY_TEXT = wxID_HIGHEST + 1,
    ID_PASTE_TEXT,
    ID_CLEAR_CLIPBOARD,
    ID_CHECK_CLIPBOARD
};

wxBEGIN_EVENT_TABLE(ClipboardTestFrame, wxFrame)
    EVT_BUTTON(ID_COPY_TEXT, ClipboardTestFrame::OnCopyText)
    EVT_BUTTON(ID_PASTE_TEXT, ClipboardTestFrame::OnPasteText)
    EVT_BUTTON(ID_CLEAR_CLIPBOARD, ClipboardTestFrame::OnClearClipboard)
    EVT_BUTTON(ID_CHECK_CLIPBOARD, ClipboardTestFrame::OnCheckClipboard)
wxEND_EVENT_TABLE()

wxIMPLEMENT_APP(ClipboardTestApp);

bool ClipboardTestApp::OnInit()
{
    if (!wxApp::OnInit())
        return false;

    ClipboardTestFrame* frame = new ClipboardTestFrame();
    frame->Show(true);
    return true;
}

ClipboardTestFrame::ClipboardTestFrame()
    : wxFrame(nullptr, wxID_ANY, "wxClipboard WASM Test",
              wxDefaultPosition, wxSize(600, 500))
{
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    // Description
    wxStaticText* desc = new wxStaticText(this, wxID_ANY,
        "wxClipboard Test\n\n"
        "Tests clipboard operations that KiCad uses for copy/paste.\n"
        "Note: Browser clipboard access may be restricted.");
    mainSizer->Add(desc, 0, wxALL, 10);

    // Input section
    wxStaticBoxSizer* inputBox = new wxStaticBoxSizer(wxVERTICAL, this, "Text to Copy");
    m_input = new wxTextCtrl(this, wxID_ANY, "Sample text for clipboard test",
        wxDefaultPosition, wxSize(-1, 60), wxTE_MULTILINE);
    inputBox->Add(m_input, 1, wxEXPAND | wxALL, 5);
    mainSizer->Add(inputBox, 0, wxEXPAND | wxLEFT | wxRIGHT, 10);

    // Buttons
    wxBoxSizer* buttonSizer = new wxBoxSizer(wxHORIZONTAL);
    buttonSizer->Add(new wxButton(this, ID_COPY_TEXT, "Copy to Clipboard"), 0, wxALL, 5);
    buttonSizer->Add(new wxButton(this, ID_PASTE_TEXT, "Paste from Clipboard"), 0, wxALL, 5);
    buttonSizer->Add(new wxButton(this, ID_CHECK_CLIPBOARD, "Check Clipboard"), 0, wxALL, 5);
    buttonSizer->Add(new wxButton(this, ID_CLEAR_CLIPBOARD, "Clear Clipboard"), 0, wxALL, 5);
    mainSizer->Add(buttonSizer, 0, wxALIGN_CENTER | wxALL, 10);

    // Output section
    wxStaticBoxSizer* outputBox = new wxStaticBoxSizer(wxVERTICAL, this, "Pasted Text");
    m_output = new wxTextCtrl(this, wxID_ANY, "",
        wxDefaultPosition, wxSize(-1, 60), wxTE_MULTILINE | wxTE_READONLY);
    outputBox->Add(m_output, 1, wxEXPAND | wxALL, 5);
    mainSizer->Add(outputBox, 0, wxEXPAND | wxLEFT | wxRIGHT, 10);

    // Log section
    wxStaticBoxSizer* logBox = new wxStaticBoxSizer(wxVERTICAL, this, "Event Log");
    m_log = new wxTextCtrl(this, wxID_ANY, "",
        wxDefaultPosition, wxSize(-1, 100), wxTE_MULTILINE | wxTE_READONLY);
    logBox->Add(m_log, 1, wxEXPAND | wxALL, 5);
    mainSizer->Add(logBox, 1, wxEXPAND | wxALL, 10);

    SetSizer(mainSizer);

    // Status bar
    CreateStatusBar();
    SetStatusText("Ready - Test clipboard operations");

    LogEvent("Clipboard test app started");

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[CLIPBOARD_TEST] wxClipboard test app started successfully');
    });
#endif
}

void ClipboardTestFrame::LogEvent(const wxString& msg)
{
    m_log->AppendText(msg + "\n");
    SetStatusText(msg);

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[CLIPBOARD_EVENT] ' + UTF8ToString($0));
    }, msg.c_str().AsChar());
#endif
}

void ClipboardTestFrame::OnCopyText(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Attempting to copy text to clipboard...");

    wxString text = m_input->GetValue();
    if (text.IsEmpty()) {
        LogEvent("ERROR: No text to copy");
        return;
    }

    if (wxTheClipboard->Open()) {
        wxTheClipboard->SetData(new wxTextDataObject(text));
        wxTheClipboard->Close();
        LogEvent(wxString::Format("SUCCESS: Copied %d characters to clipboard", (int)text.Length()));
    } else {
        LogEvent("ERROR: Could not open clipboard");
    }
}

void ClipboardTestFrame::OnPasteText(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Attempting to paste from clipboard...");

    if (wxTheClipboard->Open()) {
        if (wxTheClipboard->IsSupported(wxDF_TEXT) ||
            wxTheClipboard->IsSupported(wxDF_UNICODETEXT)) {
            wxTextDataObject data;
            wxTheClipboard->GetData(data);
            wxString text = data.GetText();
            m_output->SetValue(text);
            LogEvent(wxString::Format("SUCCESS: Pasted %d characters from clipboard", (int)text.Length()));
        } else {
            LogEvent("WARNING: No text data in clipboard");
            m_output->SetValue("");
        }
        wxTheClipboard->Close();
    } else {
        LogEvent("ERROR: Could not open clipboard");
    }
}

void ClipboardTestFrame::OnClearClipboard(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Attempting to clear clipboard...");

    if (wxTheClipboard->Open()) {
        wxTheClipboard->Clear();
        wxTheClipboard->Close();
        LogEvent("SUCCESS: Clipboard cleared");
    } else {
        LogEvent("ERROR: Could not open clipboard");
    }
}

void ClipboardTestFrame::OnCheckClipboard(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Checking clipboard contents...");

    if (wxTheClipboard->Open()) {
        bool hasText = wxTheClipboard->IsSupported(wxDF_TEXT) ||
                       wxTheClipboard->IsSupported(wxDF_UNICODETEXT);
        bool hasBitmap = wxTheClipboard->IsSupported(wxDF_BITMAP);
        bool hasFiles = wxTheClipboard->IsSupported(wxDF_FILENAME);

        wxString status = "Clipboard contains: ";
        if (hasText) status += "TEXT ";
        if (hasBitmap) status += "BITMAP ";
        if (hasFiles) status += "FILES ";
        if (!hasText && !hasBitmap && !hasFiles) status += "(empty or unsupported format)";

        LogEvent(status);
        wxTheClipboard->Close();
    } else {
        LogEvent("ERROR: Could not open clipboard");
    }
}
