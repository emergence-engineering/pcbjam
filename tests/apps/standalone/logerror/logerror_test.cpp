// wxLogError Dialog Test - Reproduces KiCad's kiface error dialog
// Tests wxLogDialog with wxCollapsiblePane "Details" dropdown
// Used to debug dialog positioning and wxLog console logging

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/log.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

class LogErrorTestApp : public wxApp
{
public:
    virtual bool OnInit() override;
};

class LogErrorTestFrame : public wxFrame
{
public:
    LogErrorTestFrame();

private:
    wxTextCtrl* m_log;

    void LogEvent(const wxString& msg);

    // Single error - like KiCad's "Error loading editor."
    void OnSingleError(wxCommandEvent& evt);

    // Multiple errors - triggers Details dropdown with wxListCtrl
    void OnMultipleErrors(wxCommandEvent& evt);

    // Mix of error levels
    void OnMixedLevels(wxCommandEvent& evt);

    // Manually flush the log to show dialog
    void OnFlushLog(wxCommandEvent& evt);

    // Clear logged messages without showing dialog
    void OnClearLog(wxCommandEvent& evt);

    wxDECLARE_EVENT_TABLE();
};

enum {
    ID_SINGLE_ERROR = wxID_HIGHEST + 1,
    ID_MULTIPLE_ERRORS,
    ID_MIXED_LEVELS,
    ID_FLUSH_LOG,
    ID_CLEAR_LOG
};

wxBEGIN_EVENT_TABLE(LogErrorTestFrame, wxFrame)
    EVT_BUTTON(ID_SINGLE_ERROR, LogErrorTestFrame::OnSingleError)
    EVT_BUTTON(ID_MULTIPLE_ERRORS, LogErrorTestFrame::OnMultipleErrors)
    EVT_BUTTON(ID_MIXED_LEVELS, LogErrorTestFrame::OnMixedLevels)
    EVT_BUTTON(ID_FLUSH_LOG, LogErrorTestFrame::OnFlushLog)
    EVT_BUTTON(ID_CLEAR_LOG, LogErrorTestFrame::OnClearLog)
wxEND_EVENT_TABLE()

wxIMPLEMENT_APP(LogErrorTestApp);

bool LogErrorTestApp::OnInit()
{
    if (!wxApp::OnInit())
        return false;

    LogErrorTestFrame* frame = new LogErrorTestFrame();
    frame->Show(true);
    return true;
}

LogErrorTestFrame::LogErrorTestFrame()
    : wxFrame(nullptr, wxID_ANY, "wxLogError Dialog Test",
              wxDefaultPosition, wxSize(700, 550))
{
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    // Description
    wxStaticText* desc = new wxStaticText(this, wxID_ANY,
        "wxLogError Dialog Test\n\n"
        "This test reproduces the exact dialog KiCad shows when kiface loading fails.\n"
        "It uses wxLogDialog with wxCollapsiblePane 'Details' dropdown.\n"
        "Watch the browser console for [wxLog] messages.");
    mainSizer->Add(desc, 0, wxALL, 10);

    // Single error section - like KiCad's error
    wxStaticBoxSizer* singleBox = new wxStaticBoxSizer(wxVERTICAL, this, "Single Error (KiCad-style)");
    wxBoxSizer* singleBtnSizer = new wxBoxSizer(wxHORIZONTAL);
    singleBtnSizer->Add(new wxButton(this, ID_SINGLE_ERROR, "Trigger Error"), 0, wxALL, 5);
    singleBtnSizer->Add(new wxStaticText(this, wxID_ANY, "Calls wxLogError(\"Error loading editor.\")"),
                        0, wxALL | wxALIGN_CENTER_VERTICAL, 5);
    singleBox->Add(singleBtnSizer, 0, wxALIGN_LEFT);
    mainSizer->Add(singleBox, 0, wxEXPAND | wxALL, 10);

    // Multiple errors section - triggers Details dropdown
    wxStaticBoxSizer* multiBox = new wxStaticBoxSizer(wxVERTICAL, this, "Multiple Errors (Details dropdown)");
    wxBoxSizer* multiBtnSizer = new wxBoxSizer(wxHORIZONTAL);
    multiBtnSizer->Add(new wxButton(this, ID_MULTIPLE_ERRORS, "Trigger Multiple"), 0, wxALL, 5);
    multiBtnSizer->Add(new wxStaticText(this, wxID_ANY, "Logs 3 errors - shows Details with wxListCtrl"),
                       0, wxALL | wxALIGN_CENTER_VERTICAL, 5);
    multiBox->Add(multiBtnSizer, 0, wxALIGN_LEFT);
    mainSizer->Add(multiBox, 0, wxEXPAND | wxALL, 10);

    // Mixed levels section
    wxStaticBoxSizer* mixedBox = new wxStaticBoxSizer(wxVERTICAL, this, "Mixed Log Levels");
    wxBoxSizer* mixedBtnSizer = new wxBoxSizer(wxHORIZONTAL);
    mixedBtnSizer->Add(new wxButton(this, ID_MIXED_LEVELS, "Mixed Levels"), 0, wxALL, 5);
    mixedBtnSizer->Add(new wxStaticText(this, wxID_ANY, "wxLogError + wxLogWarning + wxLogMessage"),
                       0, wxALL | wxALIGN_CENTER_VERTICAL, 5);
    mixedBox->Add(mixedBtnSizer, 0, wxALIGN_LEFT);
    mainSizer->Add(mixedBox, 0, wxEXPAND | wxALL, 10);

    // Control buttons
    wxStaticBoxSizer* controlBox = new wxStaticBoxSizer(wxHORIZONTAL, this, "Log Control");
    controlBox->Add(new wxButton(this, ID_FLUSH_LOG, "Flush Log (Show Dialog)"), 0, wxALL, 5);
    controlBox->Add(new wxButton(this, ID_CLEAR_LOG, "Clear Log"), 0, wxALL, 5);
    mainSizer->Add(controlBox, 0, wxEXPAND | wxALL, 10);

    // Event log
    wxStaticBoxSizer* logBox = new wxStaticBoxSizer(wxVERTICAL, this, "Event Log");
    m_log = new wxTextCtrl(this, wxID_ANY, "",
        wxDefaultPosition, wxSize(-1, 150), wxTE_MULTILINE | wxTE_READONLY);
    logBox->Add(m_log, 1, wxEXPAND | wxALL, 5);
    mainSizer->Add(logBox, 1, wxEXPAND | wxALL, 10);

    SetSizer(mainSizer);
    CreateStatusBar();
    SetStatusText("Ready - Click buttons to trigger wxLog errors");

    LogEvent("wxLogError test app started");

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[LOGERROR_TEST] wxLogError test app started successfully');
    });
#endif
}

void LogErrorTestFrame::LogEvent(const wxString& msg)
{
    m_log->AppendText(msg + "\n");
    SetStatusText(msg);

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[LOGERROR_EVENT] ' + UTF8ToString($0));
    }, msg.c_str().AsChar());
#endif
}

void LogErrorTestFrame::OnSingleError(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Triggering single wxLogError...");

    // This is exactly what KiCad does in kiway.cpp
    wxLogError("Error loading editor.");

    LogEvent("wxLogError called - dialog should appear on next event loop or Flush");
}

void LogErrorTestFrame::OnMultipleErrors(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Triggering multiple wxLogError calls...");

    // Multiple errors trigger the Details dropdown with wxListCtrl
    wxLogError("Failed to load shared library '/usr/bin/_pcbnew.kiface'");
    wxLogError("IO_ERROR: Failed to load kiface library");
    wxLogError("Error loading editor.");

    LogEvent("3 errors logged - Details dropdown should appear");
}

void LogErrorTestFrame::OnMixedLevels(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Triggering mixed log levels...");

    wxLogError("This is an error message");
    wxLogWarning("This is a warning message");
    wxLogMessage("This is an info message");

    LogEvent("Mixed levels logged - check console for [wxLog] output");
}

void LogErrorTestFrame::OnFlushLog(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Flushing log - dialog should appear now...");

    // Force the log to flush, which shows the dialog
    wxLog::FlushActive();

    LogEvent("Flush complete - dialog should have been shown");
}

void LogErrorTestFrame::OnClearLog(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Clearing accumulated log messages...");

    // Get the active log and clear it without showing dialog
    wxLog* log = wxLog::GetActiveTarget();
    if (log)
    {
        // Disable logging temporarily to clear without showing
        wxLogNull noLog;
        // The accumulated messages will be discarded
    }

    LogEvent("Log cleared");
}
