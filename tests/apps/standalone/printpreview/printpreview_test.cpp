// wxPrintPreview Test - Print preview system
// Tests wxPreviewFrame, wxPrintout, wxPrintData for KiCad's print functionality

#include "wx/wx.h"
#include "wx/print.h"
#include "wx/printdlg.h"
#include "wx/dcmemory.h"

// Custom Printout class - simulates KiCad schematic/PCB print
class SamplePrintout : public wxPrintout
{
public:
    SamplePrintout(const wxString& title = "Sample Printout") : wxPrintout(title) {}

    virtual bool OnPrintPage(int page) override
    {
        wxDC* dc = GetDC();
        if (!dc) return false;

        // Get page size
        int pageW, pageH;
        GetPageSizePixels(&pageW, &pageH);

        // Draw frame
        dc->SetPen(*wxBLACK_PEN);
        dc->SetBrush(*wxWHITE_BRUSH);
        dc->DrawRectangle(10, 10, pageW - 20, pageH - 20);

        // Draw title block (like KiCad)
        int titleBlockH = 80;
        dc->DrawRectangle(10, pageH - titleBlockH - 10, pageW - 20, titleBlockH);

        // Draw grid lines
        dc->SetPen(wxPen(*wxLIGHT_GREY, 1, wxPENSTYLE_DOT));
        int gridSize = 50;
        for (int x = gridSize; x < pageW - gridSize; x += gridSize)
        {
            dc->DrawLine(x, 10, x, pageH - titleBlockH - 10);
        }
        for (int y = gridSize; y < pageH - titleBlockH - gridSize; y += gridSize)
        {
            dc->DrawLine(10, y, pageW - 10, y);
        }

        // Draw some "components" (circles and rectangles)
        dc->SetPen(*wxBLACK_PEN);
        dc->SetBrush(*wxRED_BRUSH);
        dc->DrawCircle(pageW / 4, pageH / 3, 30);

        dc->SetBrush(*wxBLUE_BRUSH);
        dc->DrawRectangle(pageW / 2, pageH / 3 - 20, 60, 40);

        dc->SetBrush(*wxGREEN_BRUSH);
        dc->DrawCircle(3 * pageW / 4, pageH / 3, 25);

        // Draw "wires" connecting them
        dc->SetPen(wxPen(*wxBLACK, 2));
        dc->DrawLine(pageW / 4 + 30, pageH / 3, pageW / 2, pageH / 3);
        dc->DrawLine(pageW / 2 + 60, pageH / 3, 3 * pageW / 4 - 25, pageH / 3);

        // Title block text
        dc->SetFont(wxFont(10, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_BOLD));
        dc->DrawText("KiCad Print Preview Test", 20, pageH - titleBlockH);
        dc->SetFont(wxFont(8, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL));
        dc->DrawText(wxString::Format("Page %d of 1", page), 20, pageH - titleBlockH + 20);
        dc->DrawText("Date: 2025-12-03", 20, pageH - titleBlockH + 35);
        dc->DrawText("Rev: 1.0", 20, pageH - titleBlockH + 50);

        return true;
    }

    virtual bool HasPage(int pageNum) override
    {
        return pageNum == 1;
    }

    virtual void GetPageInfo(int* minPage, int* maxPage, int* selPageFrom, int* selPageTo) override
    {
        if (minPage) *minPage = 1;
        if (maxPage) *maxPage = 1;
        if (selPageFrom) *selPageFrom = 1;
        if (selPageTo) *selPageTo = 1;
    }
};

class PrintPreviewFrame : public wxFrame
{
public:
    PrintPreviewFrame() : wxFrame(nullptr, wxID_ANY, "wxPrintPreview Test",
                                   wxDefaultPosition, wxSize(800, 600))
    {
        wxPanel* mainPanel = new wxPanel(this);
        wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

        // Description
        wxStaticText* desc = new wxStaticText(mainPanel, wxID_ANY,
            "KiCad uses wxPrintout and wxPreviewFrame for print preview.\n"
            "Tests: Print preview, page setup dialog, print data persistence.");
        mainSizer->Add(desc, 0, wxALL, 5);

        // Buttons
        wxBoxSizer* btnSizer = new wxBoxSizer(wxHORIZONTAL);

        wxButton* btnPreview = new wxButton(mainPanel, wxID_ANY, "Print Preview");
        wxButton* btnPageSetup = new wxButton(mainPanel, wxID_ANY, "Page Setup");
        wxButton* btnPrint = new wxButton(mainPanel, wxID_ANY, "Print...");

        btnPreview->Bind(wxEVT_BUTTON, &PrintPreviewFrame::OnPrintPreview, this);
        btnPageSetup->Bind(wxEVT_BUTTON, &PrintPreviewFrame::OnPageSetup, this);
        btnPrint->Bind(wxEVT_BUTTON, &PrintPreviewFrame::OnPrint, this);

        btnSizer->Add(btnPreview, 0, wxRIGHT, 5);
        btnSizer->Add(btnPageSetup, 0, wxRIGHT, 5);
        btnSizer->Add(btnPrint, 0);

        mainSizer->Add(btnSizer, 0, wxALL, 5);

        // Preview area (draws same content as printout)
        m_previewPanel = new wxPanel(mainPanel, wxID_ANY, wxDefaultPosition,
                                      wxDefaultSize, wxBORDER_SUNKEN);
        m_previewPanel->SetBackgroundColour(*wxWHITE);
        m_previewPanel->Bind(wxEVT_PAINT, &PrintPreviewFrame::OnPaintPreview, this);

        mainSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Preview Area:"), 0, wxLEFT | wxTOP, 5);
        mainSizer->Add(m_previewPanel, 1, wxEXPAND | wxALL, 5);

        // Settings display
        wxStaticBoxSizer* settingsSizer = new wxStaticBoxSizer(wxVERTICAL, mainPanel, "Print Settings");
        m_settingsText = new wxTextCtrl(mainPanel, wxID_ANY, "", wxDefaultPosition,
                                         wxSize(-1, 80), wxTE_MULTILINE | wxTE_READONLY);
        settingsSizer->Add(m_settingsText, 1, wxEXPAND | wxALL, 5);
        mainSizer->Add(settingsSizer, 0, wxEXPAND | wxALL, 5);

        // Event log
        mainSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Event Log"), 0, wxLEFT | wxTOP, 5);
        m_log = new wxTextCtrl(mainPanel, wxID_ANY, "", wxDefaultPosition, wxSize(-1, 80),
                               wxTE_MULTILINE | wxTE_READONLY);
        mainSizer->Add(m_log, 0, wxEXPAND | wxALL, 5);

        mainPanel->SetSizer(mainSizer);

        // Initialize print data
        m_printData = new wxPrintData();
        m_pageSetupData = new wxPageSetupDialogData(*m_printData);

        UpdateSettingsDisplay();

        CreateStatusBar();
        SetStatusText("Print preview test app started");
        Log("Print preview test app started");
    }

    ~PrintPreviewFrame()
    {
        delete m_printData;
        delete m_pageSetupData;
    }

private:
    void OnPrintPreview(wxCommandEvent& event)
    {
        Log("Opening print preview...");

        // Create two printouts - one for preview, one for printing
        SamplePrintout* printoutPreview = new SamplePrintout("Preview");
        SamplePrintout* printoutPrint = new SamplePrintout("Print");

        wxPrintPreview* preview = new wxPrintPreview(printoutPreview, printoutPrint, m_printData);

        if (!preview->IsOk())
        {
            delete preview;
            Log("ERROR: Failed to create print preview");
            wxMessageBox("Failed to create print preview", "Error", wxOK | wxICON_ERROR);
            return;
        }

        wxPreviewFrame* frame = new wxPreviewFrame(preview, this, "Print Preview",
                                                    wxDefaultPosition, wxSize(700, 500));
        frame->Centre();
        frame->Initialize();
        frame->Show();

        Log("Print preview opened successfully");
    }

    void OnPageSetup(wxCommandEvent& event)
    {
        Log("Opening page setup dialog...");

        *m_pageSetupData = *m_printData;

        wxPageSetupDialog pageSetupDialog(this, m_pageSetupData);

        if (pageSetupDialog.ShowModal() == wxID_OK)
        {
            *m_pageSetupData = pageSetupDialog.GetPageSetupDialogData();
            *m_printData = m_pageSetupData->GetPrintData();

            Log("Page setup changed");
            UpdateSettingsDisplay();
        }
        else
        {
            Log("Page setup cancelled");
        }
    }

    void OnPrint(wxCommandEvent& event)
    {
        Log("Opening print dialog...");

        wxPrintDialogData printDialogData(*m_printData);

        wxPrintDialog printDialog(this, &printDialogData);

        if (printDialog.ShowModal() == wxID_OK)
        {
            *m_printData = printDialog.GetPrintDialogData().GetPrintData();
            Log("Print initiated (simulated in browser)");
            UpdateSettingsDisplay();
        }
        else
        {
            Log("Print cancelled");
        }
    }

    void OnPaintPreview(wxPaintEvent& event)
    {
        wxPaintDC dc(m_previewPanel);

        wxSize size = m_previewPanel->GetClientSize();

        // Draw frame
        dc.SetPen(*wxBLACK_PEN);
        dc.SetBrush(*wxWHITE_BRUSH);
        dc.DrawRectangle(5, 5, size.x - 10, size.y - 10);

        // Draw title block
        int titleBlockH = 40;
        dc.DrawRectangle(5, size.y - titleBlockH - 5, size.x - 10, titleBlockH);

        // Draw grid
        dc.SetPen(wxPen(*wxLIGHT_GREY, 1, wxPENSTYLE_DOT));
        int gridSize = 30;
        for (int x = gridSize; x < size.x - gridSize; x += gridSize)
        {
            dc.DrawLine(x, 5, x, size.y - titleBlockH - 5);
        }
        for (int y = gridSize; y < size.y - titleBlockH - gridSize; y += gridSize)
        {
            dc.DrawLine(5, y, size.x - 5, y);
        }

        // Draw components
        dc.SetPen(*wxBLACK_PEN);
        dc.SetBrush(*wxRED_BRUSH);
        dc.DrawCircle(size.x / 4, size.y / 3, 15);

        dc.SetBrush(*wxBLUE_BRUSH);
        dc.DrawRectangle(size.x / 2, size.y / 3 - 10, 30, 20);

        dc.SetBrush(*wxGREEN_BRUSH);
        dc.DrawCircle(3 * size.x / 4, size.y / 3, 12);

        // Wires
        dc.SetPen(wxPen(*wxBLACK, 2));
        dc.DrawLine(size.x / 4 + 15, size.y / 3, size.x / 2, size.y / 3);
        dc.DrawLine(size.x / 2 + 30, size.y / 3, 3 * size.x / 4 - 12, size.y / 3);

        // Title block text
        dc.SetFont(wxFont(8, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_BOLD));
        dc.DrawText("Sample Schematic", 10, size.y - titleBlockH + 5);
    }

    void UpdateSettingsDisplay()
    {
        wxString settings;
        settings += wxString::Format("Orientation: %s\n",
            m_printData->GetOrientation() == wxLANDSCAPE ? "Landscape" : "Portrait");
        settings += wxString::Format("Paper Size: %s\n", GetPaperSizeName(m_printData->GetPaperId()));
        settings += wxString::Format("Quality: %d dpi\n", m_printData->GetQuality());
        settings += wxString::Format("Colour: %s", m_printData->GetColour() ? "Yes" : "No");

        m_settingsText->SetValue(settings);
    }

    wxString GetPaperSizeName(wxPaperSize paperId)
    {
        switch (paperId)
        {
            case wxPAPER_LETTER: return "Letter";
            case wxPAPER_A4: return "A4";
            case wxPAPER_A3: return "A3";
            case wxPAPER_LEGAL: return "Legal";
            default: return "Default";
        }
    }

    void Log(const wxString& msg)
    {
        m_log->AppendText(msg + "\n");
    }

    wxPanel* m_previewPanel;
    wxTextCtrl* m_settingsText;
    wxTextCtrl* m_log;
    wxPrintData* m_printData;
    wxPageSetupDialogData* m_pageSetupData;
};

class PrintPreviewApp : public wxApp
{
public:
    virtual bool OnInit() override
    {
        PrintPreviewFrame* frame = new PrintPreviewFrame();
        frame->Show();
        return true;
    }
};

wxIMPLEMENT_APP(PrintPreviewApp);
