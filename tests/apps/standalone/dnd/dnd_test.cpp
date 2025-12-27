// wxDragDrop Test - Tests HTML5 file drop in WASM
// KiCad uses drag and drop for loading projects, schematics, PCBs, etc.
//
// Tests:
// - External file drops via HTML5 drag and drop API
// - wxDropFilesEvent generation
// - Multiple file drops
// - Visual drop zone feedback

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/dnd.h"
#include "wx/listbox.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

// Forward declarations
class DndTestApp;
class DndTestFrame;

// ============================================================
// DndTestApp
// ============================================================
class DndTestApp : public wxApp
{
public:
    bool OnInit() override;
};

// ============================================================
// DndTestFrame - Main test window
// ============================================================
class DndTestFrame : public wxFrame
{
public:
    DndTestFrame();

private:
    wxPanel* m_dropZone;
    wxTextCtrl* m_log;
    wxListBox* m_fileList;
    bool m_dragOver;

    void LogEvent(const wxString& msg);
    void OnDropFiles(wxDropFilesEvent& evt);
    void OnDropZonePaint(wxPaintEvent& evt);
    void OnClearFiles(wxCommandEvent& evt);

    wxDECLARE_EVENT_TABLE();
};

// IDs
enum {
    ID_DROP_ZONE = wxID_HIGHEST + 1,
    ID_CLEAR_FILES
};

wxBEGIN_EVENT_TABLE(DndTestFrame, wxFrame)
    EVT_DROP_FILES(DndTestFrame::OnDropFiles)
    EVT_BUTTON(ID_CLEAR_FILES, DndTestFrame::OnClearFiles)
wxEND_EVENT_TABLE()

wxIMPLEMENT_APP(DndTestApp);

// ============================================================
// App Implementation
// ============================================================

bool DndTestApp::OnInit()
{
    if (!wxApp::OnInit())
        return false;

    DndTestFrame* frame = new DndTestFrame();
    frame->Show(true);
    return true;
}

// ============================================================
// Frame Implementation
// ============================================================

DndTestFrame::DndTestFrame()
    : wxFrame(nullptr, wxID_ANY, "wxDragDrop WASM Test",
              wxDefaultPosition, wxSize(800, 600)),
      m_dragOver(false)
{
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    // Description
    wxStaticText* desc = new wxStaticText(this, wxID_ANY,
        "wxDragDrop Test\n\n"
        "KiCad uses drag and drop for loading projects, schematics, and PCBs.\n"
        "Test by dragging files from your file manager onto the drop zone below.");
    mainSizer->Add(desc, 0, wxALL, 10);

    // Accepted file types info
    wxStaticText* fileTypes = new wxStaticText(this, wxID_ANY,
        "Accepted file types: .kicad_pcb, .kicad_sch, .kicad_pro, .dxf, .svg, .png, .jpg, .txt, *.*");
    fileTypes->SetForegroundColour(*wxBLUE);
    mainSizer->Add(fileTypes, 0, wxLEFT | wxRIGHT, 10);

    // Drop zone panel
    wxStaticBoxSizer* dropBox = new wxStaticBoxSizer(wxVERTICAL, this, "Drop Zone");
    m_dropZone = new wxPanel(this, ID_DROP_ZONE, wxDefaultPosition, wxSize(-1, 150));
    m_dropZone->SetBackgroundColour(wxColour(240, 240, 240));
    m_dropZone->Bind(wxEVT_PAINT, &DndTestFrame::OnDropZonePaint, this);
    dropBox->Add(m_dropZone, 1, wxEXPAND | wxALL, 5);
    mainSizer->Add(dropBox, 0, wxEXPAND | wxALL, 10);

    // Enable drop target on the frame (wxWidgets will handle EVT_DROP_FILES)
    DragAcceptFiles(true);

    // File list
    wxStaticBoxSizer* fileBox = new wxStaticBoxSizer(wxVERTICAL, this, "Dropped Files");
    m_fileList = new wxListBox(this, wxID_ANY, wxDefaultPosition, wxSize(-1, 100));
    fileBox->Add(m_fileList, 1, wxEXPAND | wxALL, 5);

    wxButton* clearBtn = new wxButton(this, ID_CLEAR_FILES, "Clear Files");
    fileBox->Add(clearBtn, 0, wxALIGN_RIGHT | wxALL, 5);

    mainSizer->Add(fileBox, 0, wxEXPAND | wxALL, 10);

    // Event log
    wxStaticBoxSizer* logBox = new wxStaticBoxSizer(wxVERTICAL, this, "Event Log");
    m_log = new wxTextCtrl(this, wxID_ANY, "",
        wxDefaultPosition, wxSize(-1, 150), wxTE_MULTILINE | wxTE_READONLY);
    logBox->Add(m_log, 1, wxEXPAND | wxALL, 5);
    mainSizer->Add(logBox, 1, wxEXPAND | wxALL, 10);

    SetSizer(mainSizer);
    CreateStatusBar();
    SetStatusText("Ready - Drag files here");

    LogEvent("DragDrop test app started");
    LogEvent("DragAcceptFiles enabled on frame");

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[DND_TEST] wxDragDrop test app started successfully');
    });
#endif
}

void DndTestFrame::LogEvent(const wxString& msg)
{
    if (m_log)
        m_log->AppendText(msg + "\n");
    SetStatusText(msg);

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[DND_EVENT] ' + UTF8ToString($0));
    }, msg.c_str().AsChar());
#endif
}

void DndTestFrame::OnDropZonePaint(wxPaintEvent& WXUNUSED(evt))
{
    wxPaintDC dc(m_dropZone);

    // Draw background based on drag state
    if (m_dragOver) {
        dc.SetBrush(wxBrush(wxColour(200, 230, 255)));
        dc.SetPen(wxPen(wxColour(0, 120, 200), 2, wxPENSTYLE_DOT));
    } else {
        dc.SetBrush(wxBrush(wxColour(240, 240, 240)));
        dc.SetPen(wxPen(wxColour(180, 180, 180), 2, wxPENSTYLE_DOT));
    }

    wxSize sz = m_dropZone->GetClientSize();
    dc.DrawRectangle(0, 0, sz.GetWidth(), sz.GetHeight());

    // Draw text
    dc.SetFont(wxFont(14, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL));
    dc.SetTextForeground(m_dragOver ? wxColour(0, 100, 180) : wxColour(100, 100, 100));

    wxString text = m_dragOver ? "Release to drop files" : "Drag files here";
    wxSize textSize = dc.GetTextExtent(text);
    dc.DrawText(text, (sz.GetWidth() - textSize.GetWidth()) / 2,
                      (sz.GetHeight() - textSize.GetHeight()) / 2);
}

void DndTestFrame::OnDropFiles(wxDropFilesEvent& evt)
{
    LogEvent("=== wxDropFilesEvent received! ===");

    int numFiles = evt.GetNumberOfFiles();
    wxString* files = evt.GetFiles();

    LogEvent(wxString::Format("Number of files: %d", numFiles));

    for (int i = 0; i < numFiles; i++) {
        wxString filePath = files[i];
        LogEvent(wxString::Format("File %d: %s", i + 1, filePath));

        // Add to file list
        m_fileList->Append(filePath);

        // Try to read file info
        if (wxFileExists(filePath)) {
            wxFile file(filePath);
            if (file.IsOpened()) {
                wxFileOffset size = file.Length();
                LogEvent(wxString::Format("  Size: %lld bytes", (long long)size));
                file.Close();
            }
        } else {
            LogEvent(wxString::Format("  (File not found in WASM filesystem)"));
        }
    }

    LogEvent("=== Drop complete ===");

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[DND_EVENT] Drop complete: ' + $0 + ' files');
    }, numFiles);
#endif
}

void DndTestFrame::OnClearFiles(wxCommandEvent& WXUNUSED(evt))
{
    m_fileList->Clear();
    LogEvent("File list cleared");
}
