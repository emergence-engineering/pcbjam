// wxMenuBar Test - Tests menu functionality in WASM
// KiCad uses extensive menus for File, Edit, View, Place, Route, etc.

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

class MenuTestApp : public wxApp
{
public:
    virtual bool OnInit() override;
};

class MenuTestFrame : public wxFrame
{
public:
    MenuTestFrame();

private:
    wxTextCtrl* m_log;

    void LogEvent(const wxString& msg);

    // Menu event handlers
    void OnMenuNew(wxCommandEvent& evt);
    void OnMenuOpen(wxCommandEvent& evt);
    void OnMenuSave(wxCommandEvent& evt);
    void OnMenuSaveAs(wxCommandEvent& evt);
    void OnMenuExit(wxCommandEvent& evt);

    void OnMenuUndo(wxCommandEvent& evt);
    void OnMenuRedo(wxCommandEvent& evt);
    void OnMenuCut(wxCommandEvent& evt);
    void OnMenuCopy(wxCommandEvent& evt);
    void OnMenuPaste(wxCommandEvent& evt);
    void OnMenuSelectAll(wxCommandEvent& evt);

    void OnMenuZoomIn(wxCommandEvent& evt);
    void OnMenuZoomOut(wxCommandEvent& evt);
    void OnMenuZoomFit(wxCommandEvent& evt);
    void OnMenuFullScreen(wxCommandEvent& evt);

    void OnMenuPreferences(wxCommandEvent& evt);
    void OnMenuAbout(wxCommandEvent& evt);
    void OnMenuHelp(wxCommandEvent& evt);

    wxDECLARE_EVENT_TABLE();
};

enum {
    ID_NEW = wxID_HIGHEST + 1,
    ID_OPEN,
    ID_SAVE,
    ID_SAVE_AS,
    ID_UNDO,
    ID_REDO,
    ID_CUT,
    ID_COPY,
    ID_PASTE,
    ID_SELECT_ALL,
    ID_ZOOM_IN,
    ID_ZOOM_OUT,
    ID_ZOOM_FIT,
    ID_FULLSCREEN,
    ID_PREFERENCES,
    ID_HELP_CONTENTS
};

wxBEGIN_EVENT_TABLE(MenuTestFrame, wxFrame)
    EVT_MENU(ID_NEW, MenuTestFrame::OnMenuNew)
    EVT_MENU(ID_OPEN, MenuTestFrame::OnMenuOpen)
    EVT_MENU(ID_SAVE, MenuTestFrame::OnMenuSave)
    EVT_MENU(ID_SAVE_AS, MenuTestFrame::OnMenuSaveAs)
    EVT_MENU(wxID_EXIT, MenuTestFrame::OnMenuExit)
    EVT_MENU(ID_UNDO, MenuTestFrame::OnMenuUndo)
    EVT_MENU(ID_REDO, MenuTestFrame::OnMenuRedo)
    EVT_MENU(ID_CUT, MenuTestFrame::OnMenuCut)
    EVT_MENU(ID_COPY, MenuTestFrame::OnMenuCopy)
    EVT_MENU(ID_PASTE, MenuTestFrame::OnMenuPaste)
    EVT_MENU(ID_SELECT_ALL, MenuTestFrame::OnMenuSelectAll)
    EVT_MENU(ID_ZOOM_IN, MenuTestFrame::OnMenuZoomIn)
    EVT_MENU(ID_ZOOM_OUT, MenuTestFrame::OnMenuZoomOut)
    EVT_MENU(ID_ZOOM_FIT, MenuTestFrame::OnMenuZoomFit)
    EVT_MENU(ID_FULLSCREEN, MenuTestFrame::OnMenuFullScreen)
    EVT_MENU(ID_PREFERENCES, MenuTestFrame::OnMenuPreferences)
    EVT_MENU(wxID_ABOUT, MenuTestFrame::OnMenuAbout)
    EVT_MENU(ID_HELP_CONTENTS, MenuTestFrame::OnMenuHelp)
wxEND_EVENT_TABLE()

wxIMPLEMENT_APP(MenuTestApp);

bool MenuTestApp::OnInit()
{
    if (!wxApp::OnInit())
        return false;

    MenuTestFrame* frame = new MenuTestFrame();
    frame->Show(true);
    return true;
}

MenuTestFrame::MenuTestFrame()
    : wxFrame(nullptr, wxID_ANY, "wxMenuBar WASM Test",
              wxDefaultPosition, wxSize(600, 400))
{
    // Create File menu
    wxMenu* menuFile = new wxMenu;
    menuFile->Append(ID_NEW, "&New\tCtrl+N", "Create a new file");
    menuFile->Append(ID_OPEN, "&Open...\tCtrl+O", "Open an existing file");
    menuFile->AppendSeparator();
    menuFile->Append(ID_SAVE, "&Save\tCtrl+S", "Save the current file");
    menuFile->Append(ID_SAVE_AS, "Save &As...\tCtrl+Shift+S", "Save with a new name");
    menuFile->AppendSeparator();
    menuFile->Append(wxID_EXIT, "E&xit\tAlt+F4", "Exit the application");

    // Create Edit menu
    wxMenu* menuEdit = new wxMenu;
    menuEdit->Append(ID_UNDO, "&Undo\tCtrl+Z", "Undo the last action");
    menuEdit->Append(ID_REDO, "&Redo\tCtrl+Y", "Redo the last undone action");
    menuEdit->AppendSeparator();
    menuEdit->Append(ID_CUT, "Cu&t\tCtrl+X", "Cut selection to clipboard");
    menuEdit->Append(ID_COPY, "&Copy\tCtrl+C", "Copy selection to clipboard");
    menuEdit->Append(ID_PASTE, "&Paste\tCtrl+V", "Paste from clipboard");
    menuEdit->AppendSeparator();
    menuEdit->Append(ID_SELECT_ALL, "Select &All\tCtrl+A", "Select all");

    // Create View menu
    wxMenu* menuView = new wxMenu;
    menuView->Append(ID_ZOOM_IN, "Zoom &In\tCtrl++", "Zoom in");
    menuView->Append(ID_ZOOM_OUT, "Zoom &Out\tCtrl+-", "Zoom out");
    menuView->Append(ID_ZOOM_FIT, "Zoom to &Fit\tCtrl+0", "Fit view to window");
    menuView->AppendSeparator();
    menuView->AppendCheckItem(ID_FULLSCREEN, "&Full Screen\tF11", "Toggle full screen mode");

    // Create Tools menu (like KiCad's preferences)
    wxMenu* menuTools = new wxMenu;
    menuTools->Append(ID_PREFERENCES, "&Preferences...", "Open preferences dialog");

    // Create Help menu
    wxMenu* menuHelp = new wxMenu;
    menuHelp->Append(ID_HELP_CONTENTS, "&Help Contents\tF1", "Show help");
    menuHelp->AppendSeparator();
    menuHelp->Append(wxID_ABOUT, "&About...", "About this application");

    // Create menu bar
    wxMenuBar* menuBar = new wxMenuBar;
    menuBar->Append(menuFile, "&File");
    menuBar->Append(menuEdit, "&Edit");
    menuBar->Append(menuView, "&View");
    menuBar->Append(menuTools, "&Tools");
    menuBar->Append(menuHelp, "&Help");

    SetMenuBar(menuBar);

    // Create main content - NO GL canvas
    wxBoxSizer* sizer = new wxBoxSizer(wxVERTICAL);

    wxStaticText* desc = new wxStaticText(this, wxID_ANY,
        "wxMenuBar Test\n\n"
        "This tests the menu system which KiCad uses extensively.\n"
        "Click menu items to see events logged below.");
    sizer->Add(desc, 0, wxALL, 10);

    m_log = new wxTextCtrl(this, wxID_ANY, "", wxDefaultPosition, wxSize(-1, 200),
        wxTE_MULTILINE | wxTE_READONLY);
    sizer->Add(m_log, 1, wxEXPAND | wxALL, 10);

    SetSizer(sizer);

    // Create status bar
    CreateStatusBar(2);
    SetStatusText("Ready");
    SetStatusText("Menu test", 1);

    LogEvent("Menu test app started");
    LogEvent("Menu bar created with File, Edit, View, Tools, Help menus");

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[MENU_TEST] wxMenuBar test app started successfully');
    });
#endif
}

void MenuTestFrame::LogEvent(const wxString& msg)
{
    m_log->AppendText(msg + "\n");
    SetStatusText(msg);

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[MENU_EVENT] ' + UTF8ToString($0));
    }, msg.c_str().AsChar());
#endif
}

// File menu handlers
void MenuTestFrame::OnMenuNew(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("File > New clicked");
}

void MenuTestFrame::OnMenuOpen(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("File > Open clicked");
}

void MenuTestFrame::OnMenuSave(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("File > Save clicked");
}

void MenuTestFrame::OnMenuSaveAs(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("File > Save As clicked");
}

void MenuTestFrame::OnMenuExit(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("File > Exit clicked");
    Close(true);
}

// Edit menu handlers
void MenuTestFrame::OnMenuUndo(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Edit > Undo clicked");
}

void MenuTestFrame::OnMenuRedo(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Edit > Redo clicked");
}

void MenuTestFrame::OnMenuCut(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Edit > Cut clicked");
}

void MenuTestFrame::OnMenuCopy(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Edit > Copy clicked");
}

void MenuTestFrame::OnMenuPaste(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Edit > Paste clicked");
}

void MenuTestFrame::OnMenuSelectAll(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Edit > Select All clicked");
}

// View menu handlers
void MenuTestFrame::OnMenuZoomIn(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("View > Zoom In clicked");
}

void MenuTestFrame::OnMenuZoomOut(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("View > Zoom Out clicked");
}

void MenuTestFrame::OnMenuZoomFit(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("View > Zoom to Fit clicked");
}

void MenuTestFrame::OnMenuFullScreen(wxCommandEvent& evt)
{
    bool isFullScreen = evt.IsChecked();
    LogEvent(wxString::Format("View > Full Screen toggled: %s",
        isFullScreen ? "ON" : "OFF"));
    ShowFullScreen(isFullScreen);
}

// Tools menu handlers
void MenuTestFrame::OnMenuPreferences(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Tools > Preferences clicked");
}

// Help menu handlers
void MenuTestFrame::OnMenuAbout(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Help > About clicked");
}

void MenuTestFrame::OnMenuHelp(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Help > Help Contents clicked");
}
