// Minimal wxGrid Test - Tests if wxGrid works in WASM
// This is a SEPARATE test app because wxGrid may crash the app at startup
// If this page loads successfully, wxGrid is working!

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/grid.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

class GridTestApp : public wxApp
{
public:
    virtual bool OnInit() override;
};

class GridTestFrame : public wxFrame
{
public:
    GridTestFrame();

private:
    wxGrid* m_grid;
    wxTextCtrl* m_log;

    void LogEvent(const wxString& msg);

    // Grid event handlers
    void OnGridCellSelect(wxGridEvent& evt);
    void OnGridCellChange(wxGridEvent& evt);
    void OnGridLabelClick(wxGridEvent& evt);

    wxDECLARE_EVENT_TABLE();
};

enum {
    ID_GRID = wxID_HIGHEST + 1,
    ID_LOG
};

wxBEGIN_EVENT_TABLE(GridTestFrame, wxFrame)
    EVT_GRID_SELECT_CELL(GridTestFrame::OnGridCellSelect)
    EVT_GRID_CELL_CHANGED(GridTestFrame::OnGridCellChange)
    EVT_GRID_LABEL_LEFT_CLICK(GridTestFrame::OnGridLabelClick)
wxEND_EVENT_TABLE()

wxIMPLEMENT_APP(GridTestApp);

bool GridTestApp::OnInit()
{
    if (!wxApp::OnInit())
        return false;

    GridTestFrame* frame = new GridTestFrame();
    frame->Show(true);
    return true;
}

GridTestFrame::GridTestFrame()
    : wxFrame(nullptr, wxID_ANY, "wxGrid WASM Test",
              wxDefaultPosition, wxSize(600, 500))
{
#ifdef __EMSCRIPTEN__
    EM_ASM({ console.log('[GRID_DEBUG] 1. GridTestFrame constructor start'); });
#endif

    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

#ifdef __EMSCRIPTEN__
    EM_ASM({ console.log('[GRID_DEBUG] 2. BoxSizer created'); });
#endif

    // Status message
    wxStaticText* status = new wxStaticText(this, wxID_ANY,
        "SUCCESS: wxGrid initialized! If you see this, wxGrid is working in WASM.");
    status->SetForegroundColour(*wxGREEN);
    mainSizer->Add(status, 0, wxALL, 10);

#ifdef __EMSCRIPTEN__
    EM_ASM({ console.log('[GRID_DEBUG] 3. StaticText created'); });
#endif

    // Create wxGrid - THIS IS THE CRITICAL TEST
    // If wxGrid doesn't work in WASM, the app will crash HERE
#ifdef __EMSCRIPTEN__
    EM_ASM({ console.log('[GRID_DEBUG] 4. About to create wxGrid...'); });
#endif
    m_grid = new wxGrid(this, ID_GRID, wxDefaultPosition, wxSize(500, 200));

#ifdef __EMSCRIPTEN__
    EM_ASM({ console.log('[GRID_DEBUG] 5. wxGrid created successfully!'); });
#endif

    // Setup grid with sample data (like KiCad's property grids)
#ifdef __EMSCRIPTEN__
    EM_ASM({ console.log('[GRID_DEBUG] 6. About to call CreateGrid(5, 4)...'); });
#endif
    m_grid->CreateGrid(5, 4);

#ifdef __EMSCRIPTEN__
    EM_ASM({ console.log('[GRID_DEBUG] 7. CreateGrid completed!'); });
#endif

    // Set column labels (similar to KiCad's property dialogs)
    m_grid->SetColLabelValue(0, "Property");
    m_grid->SetColLabelValue(1, "Value");
    m_grid->SetColLabelValue(2, "Units");
    m_grid->SetColLabelValue(3, "Description");

    // Set column widths
    m_grid->SetColSize(0, 100);
    m_grid->SetColSize(1, 80);
    m_grid->SetColSize(2, 50);
    m_grid->SetColSize(3, 150);

    // Fill with sample data (like KiCad track/via properties)
    m_grid->SetCellValue(0, 0, "Track Width");
    m_grid->SetCellValue(0, 1, "0.25");
    m_grid->SetCellValue(0, 2, "mm");
    m_grid->SetCellValue(0, 3, "Default track width");

    m_grid->SetCellValue(1, 0, "Via Size");
    m_grid->SetCellValue(1, 1, "0.80");
    m_grid->SetCellValue(1, 2, "mm");
    m_grid->SetCellValue(1, 3, "Via outer diameter");

    m_grid->SetCellValue(2, 0, "Via Drill");
    m_grid->SetCellValue(2, 1, "0.40");
    m_grid->SetCellValue(2, 2, "mm");
    m_grid->SetCellValue(2, 3, "Via drill diameter");

    m_grid->SetCellValue(3, 0, "Clearance");
    m_grid->SetCellValue(3, 1, "0.20");
    m_grid->SetCellValue(3, 2, "mm");
    m_grid->SetCellValue(3, 3, "Min clearance");

    m_grid->SetCellValue(4, 0, "Net Class");
    m_grid->SetCellValue(4, 1, "Default");
    m_grid->SetCellValue(4, 2, "-");
    m_grid->SetCellValue(4, 3, "Net class name");

    // Make first column read-only (like property names in KiCad)
    for (int row = 0; row < 5; row++) {
        m_grid->SetReadOnly(row, 0);
        m_grid->SetReadOnly(row, 2);
        m_grid->SetReadOnly(row, 3);
    }

    mainSizer->Add(m_grid, 1, wxEXPAND | wxALL, 10);

    // Event log
    wxStaticBox* logBox = new wxStaticBox(this, wxID_ANY, "Event Log");
    wxStaticBoxSizer* logSizer = new wxStaticBoxSizer(logBox, wxVERTICAL);

    m_log = new wxTextCtrl(this, ID_LOG, "", wxDefaultPosition, wxSize(-1, 100),
        wxTE_MULTILINE | wxTE_READONLY);
    logSizer->Add(m_log, 1, wxEXPAND | wxALL, 5);

    mainSizer->Add(logSizer, 0, wxEXPAND | wxALL, 10);

    SetSizer(mainSizer);

    LogEvent("wxGrid initialized successfully!");
    LogEvent("Try clicking cells, editing values, etc.");

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[GRID_TEST] wxGrid test app started successfully!');
        console.log('[GRID_TEST] If you see this message, wxGrid is working in WASM!');
    });
#endif
}

void GridTestFrame::LogEvent(const wxString& msg)
{
    // Guard against events firing before m_log is initialized
    if (!m_log)
        return;
    m_log->AppendText(msg + "\n");

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[GRID_EVENT] ' + UTF8ToString($0));
    }, msg.c_str().AsChar());
#endif
}

void GridTestFrame::OnGridCellSelect(wxGridEvent& evt)
{
    LogEvent(wxString::Format("Cell selected: row=%d, col=%d, value='%s'",
        evt.GetRow(), evt.GetCol(),
        m_grid->GetCellValue(evt.GetRow(), evt.GetCol())));
    evt.Skip();
}

void GridTestFrame::OnGridCellChange(wxGridEvent& evt)
{
    LogEvent(wxString::Format("Cell changed: row=%d, col=%d, new value='%s'",
        evt.GetRow(), evt.GetCol(),
        m_grid->GetCellValue(evt.GetRow(), evt.GetCol())));
    evt.Skip();
}

void GridTestFrame::OnGridLabelClick(wxGridEvent& evt)
{
    if (evt.GetRow() >= 0) {
        LogEvent(wxString::Format("Row label clicked: row=%d", evt.GetRow()));
    } else if (evt.GetCol() >= 0) {
        LogEvent(wxString::Format("Column label clicked: col=%d ('%s')",
            evt.GetCol(), m_grid->GetColLabelValue(evt.GetCol())));
    }
    evt.Skip();
}
