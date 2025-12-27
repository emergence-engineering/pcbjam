// wxPrinting Test - Tests print functionality in WASM
// KiCad uses printing for schematic/PCB output
//
// Tests:
// - wxPrintout callbacks (OnPrintPage, OnBeginPrinting, etc.)
// - wxPrintPreview rendering
// - wxPrinter::Print() triggering
// - window.print() browser integration

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#if wxUSE_PRINTING_ARCHITECTURE

#include "wx/print.h"
#include "wx/printdlg.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

// Forward declarations
class PrintTestApp;
class PrintTestFrame;
class TestPrintout;

// Global print data
static wxPrintData* g_printData = nullptr;
static wxPageSetupDialogData* g_pageSetupData = nullptr;

// ============================================================
// TestPrintout - Simple printable document (2 pages)
// ============================================================
class TestPrintout : public wxPrintout
{
public:
    TestPrintout(const wxString& title = "Test Printout")
        : wxPrintout(title) {}

    bool OnPrintPage(int page) override;
    bool HasPage(int page) override { return page >= 1 && page <= 2; }
    void GetPageInfo(int* minPage, int* maxPage, int* selPageFrom, int* selPageTo) override;
    bool OnBeginDocument(int startPage, int endPage) override;
    void OnEndDocument() override;
    void OnBeginPrinting() override;
    void OnEndPrinting() override;

private:
    void DrawPageOne(wxDC* dc);
    void DrawPageTwo(wxDC* dc);
    void LogEvent(const wxString& msg);
};

// ============================================================
// PrintTestFrame - Main test window
// ============================================================
class PrintTestFrame : public wxFrame
{
public:
    PrintTestFrame();
    ~PrintTestFrame();

private:
    wxTextCtrl* m_log;
    wxPanel* m_previewPanel;

    void LogEvent(const wxString& msg);
    void DrawDocument(wxDC& dc);

    // Event handlers
    void OnPrintPreview(wxCommandEvent& evt);
    void OnPrint(wxCommandEvent& evt);
    void OnBrowserPrint(wxCommandEvent& evt);
    void OnPageSetup(wxCommandEvent& evt);
    void OnPreviewPanelPaint(wxPaintEvent& evt);

    wxDECLARE_EVENT_TABLE();
};

// ============================================================
// PrintTestApp
// ============================================================
class PrintTestApp : public wxApp
{
public:
    bool OnInit() override;
    int OnExit() override;
};

// IDs
enum {
    ID_PRINT_PREVIEW = wxID_HIGHEST + 1,
    ID_PRINT,
    ID_BROWSER_PRINT,
    ID_PAGE_SETUP,
    ID_PREVIEW_PANEL
};

wxBEGIN_EVENT_TABLE(PrintTestFrame, wxFrame)
    EVT_BUTTON(ID_PRINT_PREVIEW, PrintTestFrame::OnPrintPreview)
    EVT_BUTTON(ID_PRINT, PrintTestFrame::OnPrint)
    EVT_BUTTON(ID_BROWSER_PRINT, PrintTestFrame::OnBrowserPrint)
    EVT_BUTTON(ID_PAGE_SETUP, PrintTestFrame::OnPageSetup)
wxEND_EVENT_TABLE()

wxIMPLEMENT_APP(PrintTestApp);

// ============================================================
// App Implementation
// ============================================================

bool PrintTestApp::OnInit()
{
    if (!wxApp::OnInit())
        return false;

    // Initialize print data
    g_printData = new wxPrintData;
    g_pageSetupData = new wxPageSetupDialogData;
    (*g_pageSetupData) = *g_printData;
    g_pageSetupData->SetMarginTopLeft(wxPoint(15, 15));
    g_pageSetupData->SetMarginBottomRight(wxPoint(15, 15));

    PrintTestFrame* frame = new PrintTestFrame();
    frame->Show(true);
    return true;
}

int PrintTestApp::OnExit()
{
    delete g_printData;
    delete g_pageSetupData;
    g_printData = nullptr;
    g_pageSetupData = nullptr;
    return wxApp::OnExit();
}

// ============================================================
// Frame Implementation
// ============================================================

PrintTestFrame::PrintTestFrame()
    : wxFrame(nullptr, wxID_ANY, "wxPrinting WASM Test",
              wxDefaultPosition, wxSize(800, 600))
{
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    // Description
    wxStaticText* desc = new wxStaticText(this, wxID_ANY,
        "wxPrinting Test\n\n"
        "KiCad uses wxPrinting for schematic and PCB printing.\n"
        "Test print preview, print dialog, and browser print integration.");
    mainSizer->Add(desc, 0, wxALL, 10);

    // Buttons
    wxBoxSizer* btnSizer = new wxBoxSizer(wxHORIZONTAL);
    btnSizer->Add(new wxButton(this, ID_PRINT_PREVIEW, "Print Preview"), 0, wxALL, 5);
    btnSizer->Add(new wxButton(this, ID_PRINT, "Print..."), 0, wxALL, 5);
    btnSizer->Add(new wxButton(this, ID_BROWSER_PRINT, "Browser Print"), 0, wxALL, 5);
    btnSizer->Add(new wxButton(this, ID_PAGE_SETUP, "Page Setup"), 0, wxALL, 5);
    mainSizer->Add(btnSizer, 0, wxALIGN_CENTER | wxALL, 5);

    // Preview panel - shows what will be printed
    wxStaticBoxSizer* previewBox = new wxStaticBoxSizer(wxVERTICAL, this, "Document Preview");
    m_previewPanel = new wxPanel(this, ID_PREVIEW_PANEL, wxDefaultPosition, wxSize(-1, 200));
    m_previewPanel->SetBackgroundColour(*wxWHITE);
    m_previewPanel->Bind(wxEVT_PAINT, &PrintTestFrame::OnPreviewPanelPaint, this);
    previewBox->Add(m_previewPanel, 1, wxEXPAND | wxALL, 5);
    mainSizer->Add(previewBox, 1, wxEXPAND | wxALL, 10);

    // Event log
    wxStaticBoxSizer* logBox = new wxStaticBoxSizer(wxVERTICAL, this, "Event Log");
    m_log = new wxTextCtrl(this, wxID_ANY, "",
        wxDefaultPosition, wxSize(-1, 150), wxTE_MULTILINE | wxTE_READONLY);
    logBox->Add(m_log, 1, wxEXPAND | wxALL, 5);
    mainSizer->Add(logBox, 0, wxEXPAND | wxALL, 10);

    SetSizer(mainSizer);
    CreateStatusBar();
    SetStatusText("Ready");

    LogEvent("Print test app started");

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[PRINT_TEST] wxPrinting test app started successfully');
    });
#endif
}

PrintTestFrame::~PrintTestFrame()
{
}

void PrintTestFrame::LogEvent(const wxString& msg)
{
    if (m_log)
        m_log->AppendText(msg + "\n");
    SetStatusText(msg);

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[PRINT_EVENT] ' + UTF8ToString($0));
    }, msg.c_str().AsChar());
#endif
}

void PrintTestFrame::DrawDocument(wxDC& dc)
{
    // Draw sample content that will be printed
    dc.SetBackground(*wxWHITE_BRUSH);
    dc.Clear();

    dc.SetFont(wxFont(12, wxFONTFAMILY_SWISS, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_BOLD));
    dc.DrawText("Print Test Document - Page 1", 20, 20);

    dc.SetFont(wxFont(10, wxFONTFAMILY_SWISS, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL));
    dc.DrawText("This is a test document for WASM printing.", 20, 50);

    // Draw shapes
    dc.SetPen(*wxBLACK_PEN);
    dc.SetBrush(*wxLIGHT_GREY_BRUSH);
    dc.DrawRectangle(20, 80, 150, 80);
    dc.DrawText("Rectangle", 60, 110);

    dc.SetBrush(*wxCYAN_BRUSH);
    dc.DrawCircle(280, 120, 40);
    dc.DrawText("Circle", 260, 115);

    dc.SetPen(wxPen(*wxRED, 2));
    dc.DrawLine(20, 180, 350, 180);
    dc.DrawText("Red Line", 160, 185);
}

void PrintTestFrame::OnPreviewPanelPaint(wxPaintEvent& WXUNUSED(evt))
{
    wxPaintDC dc(m_previewPanel);
    DrawDocument(dc);
}

void PrintTestFrame::OnPrintPreview(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Opening Print Preview...");

    wxPrintDialogData printDialogData(*g_printData);

    // Create two printouts: one for preview, one for printing from preview
    wxPrintPreview* preview = new wxPrintPreview(
        new TestPrintout("Preview"),
        new TestPrintout("Print"),
        &printDialogData
    );

    if (!preview->IsOk())
    {
        delete preview;
        LogEvent("ERROR: Print preview initialization failed");
        wxMessageBox("Print preview failed to initialize.",
                     "Print Preview Error", wxOK | wxICON_ERROR, this);
        return;
    }

    wxPreviewFrame* frame = new wxPreviewFrame(
        preview, this, "Print Preview"
    );
    frame->InitializeWithModality(wxPreviewFrame_NonModal);
    frame->Centre(wxBOTH);
    frame->Show();

    LogEvent("Print Preview frame shown");
}

void PrintTestFrame::OnPrint(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Opening Print dialog...");

    wxPrintDialogData printDialogData(*g_printData);
    wxPrinter printer(&printDialogData);
    TestPrintout printout("Test Print");

    if (!printer.Print(this, &printout, true))
    {
        if (wxPrinter::GetLastError() == wxPRINTER_ERROR)
        {
            LogEvent("ERROR: Printing failed - printer error");
            wxMessageBox("Printing failed. Printer may not be configured correctly.",
                         "Print Error", wxOK | wxICON_ERROR, this);
        }
        else
        {
            LogEvent("Print cancelled by user");
        }
    }
    else
    {
        (*g_printData) = printer.GetPrintDialogData().GetPrintData();
        LogEvent("Print completed successfully");
    }
}

void PrintTestFrame::OnBrowserPrint(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Triggering browser print dialog...");

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[PRINT_EVENT] Calling window.print() for browser printing');
        // In WASM, this triggers the browser's native print dialog
        // Users can "Save as PDF" from there
        window.print();
    });
    LogEvent("Browser print dialog triggered (window.print called)");
#else
    LogEvent("Browser print only available in WASM build");
    wxMessageBox("Browser print is only available in WASM builds.",
                 "Not Available", wxOK | wxICON_INFORMATION, this);
#endif
}

void PrintTestFrame::OnPageSetup(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Opening Page Setup dialog...");

    (*g_pageSetupData) = *g_printData;

    wxPageSetupDialog pageSetupDialog(this, g_pageSetupData);
    if (pageSetupDialog.ShowModal() == wxID_OK)
    {
        (*g_printData) = pageSetupDialog.GetPageSetupDialogData().GetPrintData();
        (*g_pageSetupData) = pageSetupDialog.GetPageSetupDialogData();
        LogEvent("Page setup completed");
    }
    else
    {
        LogEvent("Page setup cancelled");
    }
}

// ============================================================
// TestPrintout Implementation
// ============================================================

void TestPrintout::LogEvent(const wxString& msg)
{
#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[PRINTOUT_CALLBACK] ' + UTF8ToString($0));
    }, msg.c_str().AsChar());
#endif
}

void TestPrintout::OnBeginPrinting()
{
    LogEvent("OnBeginPrinting called");
    wxPrintout::OnBeginPrinting();
}

void TestPrintout::OnEndPrinting()
{
    LogEvent("OnEndPrinting called");
    wxPrintout::OnEndPrinting();
}

bool TestPrintout::OnBeginDocument(int startPage, int endPage)
{
    LogEvent(wxString::Format("OnBeginDocument: pages %d to %d", startPage, endPage));
    return wxPrintout::OnBeginDocument(startPage, endPage);
}

void TestPrintout::OnEndDocument()
{
    LogEvent("OnEndDocument called");
    wxPrintout::OnEndDocument();
}

void TestPrintout::GetPageInfo(int* minPage, int* maxPage, int* selPageFrom, int* selPageTo)
{
    *minPage = 1;
    *maxPage = 2;
    *selPageFrom = 1;
    *selPageTo = 2;
    LogEvent("GetPageInfo: 2 pages available");
}

bool TestPrintout::OnPrintPage(int page)
{
    LogEvent(wxString::Format("OnPrintPage: printing page %d", page));

    wxDC* dc = GetDC();
    if (!dc)
    {
        LogEvent("ERROR: No DC available for printing");
        return false;
    }

    if (page == 1)
        DrawPageOne(dc);
    else if (page == 2)
        DrawPageTwo(dc);
    else
        return false;

    // Draw page number
    MapScreenSizeToPage();
    dc->SetFont(wxFont(8, wxFONTFAMILY_SWISS, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL));
    dc->DrawText(wxString::Format("Page %d of 2", page), 10, 10);

    LogEvent(wxString::Format("Page %d drawn successfully", page));
    return true;
}

void TestPrintout::DrawPageOne(wxDC* dc)
{
    LogEvent("DrawPageOne: drawing content");

    // Scale to fit page
    FitThisSizeToPage(wxSize(400, 300));

    dc->SetBackground(*wxWHITE_BRUSH);

    dc->SetFont(wxFont(14, wxFONTFAMILY_SWISS, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_BOLD));
    dc->DrawText("WASM Print Test - Page 1", 50, 50);

    dc->SetFont(wxFont(10, wxFONTFAMILY_SWISS, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL));
    dc->DrawText("This tests wxPrinting in WebAssembly.", 50, 80);
    dc->DrawText("KiCad uses this for schematic/PCB printing.", 50, 100);

    // Shapes
    dc->SetPen(*wxBLACK_PEN);
    dc->SetBrush(*wxLIGHT_GREY_BRUSH);
    dc->DrawRectangle(50, 130, 150, 80);
    dc->DrawText("Rectangle 150x80", 70, 160);

    dc->SetBrush(*wxCYAN_BRUSH);
    dc->DrawCircle(300, 170, 40);
    dc->DrawText("r=40", 285, 165);

    dc->SetPen(wxPen(*wxRED, 2));
    dc->DrawLine(50, 230, 350, 230);
}

void TestPrintout::DrawPageTwo(wxDC* dc)
{
    LogEvent("DrawPageTwo: drawing content");

    // Scale to fit page
    FitThisSizeToPage(wxSize(400, 300));

    dc->SetBackground(*wxWHITE_BRUSH);

    dc->SetFont(wxFont(14, wxFONTFAMILY_SWISS, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_BOLD));
    dc->DrawText("WASM Print Test - Page 2", 50, 50);

    dc->SetFont(wxFont(10, wxFONTFAMILY_SWISS, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL));
    dc->DrawText("Second page demonstrates multi-page printing.", 50, 80);

    // Draw grid pattern
    dc->SetPen(*wxBLACK_PEN);
    for (int x = 50; x <= 350; x += 30)
    {
        dc->DrawLine(x, 120, x, 220);
    }
    for (int y = 120; y <= 220; y += 20)
    {
        dc->DrawLine(50, y, 350, y);
    }
    dc->DrawText("Grid Pattern", 170, 230);

    // Draw some text
    dc->SetFont(wxFont(8, wxFONTFAMILY_TELETYPE, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL));
    dc->DrawText("Monospace font test: 0123456789", 50, 260);
}

#else // !wxUSE_PRINTING_ARCHITECTURE

// Fallback if printing is not enabled
#include "wx/wx.h"

class PrintTestApp : public wxApp
{
public:
    bool OnInit() override
    {
        wxMessageBox("wxUSE_PRINTING_ARCHITECTURE is not enabled.\n"
                     "Printing support is not available.",
                     "Print Test Error", wxOK | wxICON_ERROR);
        return false;
    }
};

wxIMPLEMENT_APP(PrintTestApp);

#endif // wxUSE_PRINTING_ARCHITECTURE
