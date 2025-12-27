// wxFileDialog Test - Tests file dialog functionality in WASM
// KiCad uses file dialogs for opening/saving schematics, PCBs, footprints

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/filedlg.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

class FileDialogTestApp : public wxApp
{
public:
    virtual bool OnInit() override;
};

class FileDialogTestFrame : public wxFrame
{
public:
    FileDialogTestFrame();

private:
    wxTextCtrl* m_log;

    void LogEvent(const wxString& msg);

    void OnOpenFile(wxCommandEvent& evt);
    void OnSaveFile(wxCommandEvent& evt);
    void OnOpenMultiple(wxCommandEvent& evt);

    wxDECLARE_EVENT_TABLE();
};

enum {
    ID_OPEN_FILE = wxID_HIGHEST + 1,
    ID_SAVE_FILE,
    ID_OPEN_MULTIPLE
};

wxBEGIN_EVENT_TABLE(FileDialogTestFrame, wxFrame)
    EVT_BUTTON(ID_OPEN_FILE, FileDialogTestFrame::OnOpenFile)
    EVT_BUTTON(ID_SAVE_FILE, FileDialogTestFrame::OnSaveFile)
    EVT_BUTTON(ID_OPEN_MULTIPLE, FileDialogTestFrame::OnOpenMultiple)
wxEND_EVENT_TABLE()

wxIMPLEMENT_APP(FileDialogTestApp);

bool FileDialogTestApp::OnInit()
{
    if (!wxApp::OnInit())
        return false;

    FileDialogTestFrame* frame = new FileDialogTestFrame();
    frame->Show(true);
    return true;
}

FileDialogTestFrame::FileDialogTestFrame()
    : wxFrame(nullptr, wxID_ANY, "wxFileDialog WASM Test",
              wxDefaultPosition, wxSize(600, 400))
{
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    wxStaticText* desc = new wxStaticText(this, wxID_ANY,
        "wxFileDialog Test\n\n"
        "Tests file dialog operations that KiCad uses for open/save.\n"
        "Note: Browser file access is typically restricted.");
    mainSizer->Add(desc, 0, wxALL, 10);

    wxBoxSizer* buttonSizer = new wxBoxSizer(wxHORIZONTAL);
    buttonSizer->Add(new wxButton(this, ID_OPEN_FILE, "Open File..."), 0, wxALL, 5);
    buttonSizer->Add(new wxButton(this, ID_SAVE_FILE, "Save File..."), 0, wxALL, 5);
    buttonSizer->Add(new wxButton(this, ID_OPEN_MULTIPLE, "Open Multiple..."), 0, wxALL, 5);
    mainSizer->Add(buttonSizer, 0, wxALIGN_CENTER | wxALL, 10);

    wxStaticBoxSizer* logBox = new wxStaticBoxSizer(wxVERTICAL, this, "Event Log");
    m_log = new wxTextCtrl(this, wxID_ANY, "",
        wxDefaultPosition, wxSize(-1, 200), wxTE_MULTILINE | wxTE_READONLY);
    logBox->Add(m_log, 1, wxEXPAND | wxALL, 5);
    mainSizer->Add(logBox, 1, wxEXPAND | wxALL, 10);

    SetSizer(mainSizer);
    CreateStatusBar();
    SetStatusText("Ready");

    LogEvent("FileDialog test app started");

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[FILEDIALOG_TEST] wxFileDialog test app started successfully');
    });
#endif
}

void FileDialogTestFrame::LogEvent(const wxString& msg)
{
    m_log->AppendText(msg + "\n");
    SetStatusText(msg);

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[FILEDIALOG_EVENT] ' + UTF8ToString($0));
    }, msg.c_str().AsChar());
#endif
}

void FileDialogTestFrame::OnOpenFile(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Opening file dialog...");

    wxFileDialog openDialog(this, "Open File", "", "",
        "All files (*.*)|*.*|KiCad files (*.kicad_*)|*.kicad_*",
        wxFD_OPEN | wxFD_FILE_MUST_EXIST);

    if (openDialog.ShowModal() == wxID_OK) {
        wxString path = openDialog.GetPath();
        LogEvent(wxString::Format("Selected file: %s", path));
    } else {
        LogEvent("Open dialog cancelled");
    }
}

void FileDialogTestFrame::OnSaveFile(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Opening save dialog...");

    wxFileDialog saveDialog(this, "Save File", "", "untitled.txt",
        "Text files (*.txt)|*.txt|All files (*.*)|*.*",
        wxFD_SAVE | wxFD_OVERWRITE_PROMPT);

    if (saveDialog.ShowModal() == wxID_OK) {
        wxString path = saveDialog.GetPath();
        LogEvent(wxString::Format("Save to: %s", path));
    } else {
        LogEvent("Save dialog cancelled");
    }
}

void FileDialogTestFrame::OnOpenMultiple(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Opening multiple file dialog...");

    wxFileDialog openDialog(this, "Open Multiple Files", "", "",
        "All files (*.*)|*.*",
        wxFD_OPEN | wxFD_MULTIPLE);

    if (openDialog.ShowModal() == wxID_OK) {
        wxArrayString paths;
        openDialog.GetPaths(paths);
        LogEvent(wxString::Format("Selected %zu files:", paths.GetCount()));
        for (size_t i = 0; i < paths.GetCount(); i++) {
            LogEvent(wxString::Format("  %s", paths[i]));
        }
    } else {
        LogEvent("Multiple file dialog cancelled");
    }
}
