// Bitmap Masking Test - Tests wxBitmap with wxMask for transparency
// Tests: wxMask, wxBitmap::SetMask(), wxDC::DrawBitmap() with useMask=true

#include "wx/wx.h"
#include "wx/dcmemory.h"

class BitmaskFrame : public wxFrame
{
public:
    BitmaskFrame() : wxFrame(nullptr, wxID_ANY, "Bitmap Masking Test",
                              wxDefaultPosition, wxSize(800, 600))
    {
        wxPanel* mainPanel = new wxPanel(this);
        wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

        // Description
        wxStaticText* desc = new wxStaticText(mainPanel, wxID_ANY,
            "Tests bitmap masking for transparency.\n"
            "Uses wxMask with color-keyed transparency.");
        mainSizer->Add(desc, 0, wxALL, 5);

        // Drawing panel
        m_drawPanel = new wxPanel(mainPanel, wxID_ANY, wxDefaultPosition, wxSize(-1, 450));
        m_drawPanel->SetBackgroundColour(*wxWHITE);
        m_drawPanel->Bind(wxEVT_PAINT, &BitmaskFrame::OnPaint, this);
        mainSizer->Add(m_drawPanel, 1, wxEXPAND | wxALL, 5);

        // Event log
        mainSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Event Log"), 0, wxLEFT | wxTOP, 5);
        m_log = new wxTextCtrl(mainPanel, wxID_ANY, "", wxDefaultPosition, wxSize(-1, 80),
                               wxTE_MULTILINE | wxTE_READONLY);
        mainSizer->Add(m_log, 0, wxEXPAND | wxALL, 5);

        mainPanel->SetSizer(mainSizer);

        // Create test bitmaps
        CreateTestBitmaps();

        CreateStatusBar();
        SetStatusText("Bitmap masking test app started");
        Log("Bitmap masking test app started");
        Log("Testing wxMask with color-keyed transparency");
    }

private:
    void CreateTestBitmaps()
    {
        // Create a bitmap with magenta (255,0,255) as transparent color
        m_bitmapWithMask.Create(80, 80, 32);
        wxMemoryDC dc(m_bitmapWithMask);

        // Fill with magenta (will become transparent)
        dc.SetBackground(wxBrush(wxColour(255, 0, 255)));
        dc.Clear();

        // Draw a blue circle in the center
        dc.SetBrush(wxBrush(wxColour(0, 0, 255)));
        dc.SetPen(wxPen(wxColour(0, 0, 128), 2));
        dc.DrawCircle(40, 40, 30);

        dc.SelectObject(wxNullBitmap);

        // Set the mask using magenta as transparent color
        m_bitmapWithMask.SetMask(new wxMask(m_bitmapWithMask, wxColour(255, 0, 255)));
        Log("Created 80x80 bitmap with magenta mask");

        // Create a bitmap with green as transparent color
        m_bitmapGreenMask.Create(80, 80, 32);
        wxMemoryDC dc2(m_bitmapGreenMask);

        // Fill with green (will become transparent)
        dc2.SetBackground(wxBrush(wxColour(0, 255, 0)));
        dc2.Clear();

        // Draw a red rectangle
        dc2.SetBrush(wxBrush(wxColour(255, 0, 0)));
        dc2.SetPen(wxPen(wxColour(128, 0, 0), 2));
        dc2.DrawRectangle(15, 15, 50, 50);

        dc2.SelectObject(wxNullBitmap);

        m_bitmapGreenMask.SetMask(new wxMask(m_bitmapGreenMask, wxColour(0, 255, 0)));
        Log("Created 80x80 bitmap with green mask");

        // Create a bitmap without mask for comparison
        m_bitmapNoMask.Create(80, 80, 32);
        wxMemoryDC dc3(m_bitmapNoMask);

        dc3.SetBackground(wxBrush(wxColour(255, 0, 255)));
        dc3.Clear();

        dc3.SetBrush(wxBrush(wxColour(0, 0, 255)));
        dc3.SetPen(wxPen(wxColour(0, 0, 128), 2));
        dc3.DrawCircle(40, 40, 30);

        dc3.SelectObject(wxNullBitmap);
        Log("Created 80x80 bitmap without mask");

        // Create a checkerboard pattern bitmap with mask
        m_bitmapCheckerboard.Create(80, 80, 32);
        wxMemoryDC dc4(m_bitmapCheckerboard);

        dc4.SetBackground(wxBrush(wxColour(255, 0, 255)));
        dc4.Clear();

        // Draw checkerboard
        for (int y = 0; y < 80; y += 20)
        {
            for (int x = 0; x < 80; x += 20)
            {
                if ((x / 20 + y / 20) % 2 == 0)
                {
                    dc4.SetBrush(wxBrush(wxColour(50, 50, 50)));
                    dc4.SetPen(*wxTRANSPARENT_PEN);
                    dc4.DrawRectangle(x, y, 20, 20);
                }
            }
        }

        dc4.SelectObject(wxNullBitmap);
        m_bitmapCheckerboard.SetMask(new wxMask(m_bitmapCheckerboard, wxColour(255, 0, 255)));
        Log("Created 80x80 checkerboard bitmap with mask");
    }

    void OnPaint(wxPaintEvent& event)
    {
        wxPaintDC dc(m_drawPanel);
        dc.SetBackground(*wxWHITE_BRUSH);
        dc.Clear();

        int y = 20;

        // Section 1: Show bitmap without mask
        dc.SetFont(wxFont(12, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_BOLD));
        dc.DrawText("No Mask (magenta visible):", 20, y);
        dc.DrawBitmap(m_bitmapNoMask, 300, y - 10, false);
        y += 100;

        // Section 2: Show bitmap with mask
        dc.DrawText("With Mask (magenta transparent):", 20, y);
        dc.DrawBitmap(m_bitmapWithMask, 300, y - 10, true);
        y += 100;

        // Section 3: Show green mask bitmap
        dc.DrawText("Green Mask (green transparent):", 20, y);
        dc.DrawBitmap(m_bitmapGreenMask, 300, y - 10, true);
        y += 100;

        // Section 4: Show on colored background to verify transparency
        dc.SetFont(wxFont(12, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL));
        dc.DrawText("Masked bitmaps on colored backgrounds:", 20, y);
        y += 25;

        // Yellow background
        dc.SetBrush(wxBrush(wxColour(255, 255, 0)));
        dc.SetPen(*wxBLACK_PEN);
        dc.DrawRectangle(100, y, 100, 100);
        dc.DrawBitmap(m_bitmapWithMask, 110, y + 10, true);

        // Cyan background
        dc.SetBrush(wxBrush(wxColour(0, 255, 255)));
        dc.DrawRectangle(220, y, 100, 100);
        dc.DrawBitmap(m_bitmapGreenMask, 230, y + 10, true);

        // Gray background with checkerboard
        dc.SetBrush(wxBrush(wxColour(200, 200, 200)));
        dc.DrawRectangle(340, y, 100, 100);
        dc.DrawBitmap(m_bitmapCheckerboard, 350, y + 10, true);

        // Gradient-like striped background
        for (int i = 0; i < 100; i += 10)
        {
            dc.SetBrush(wxBrush(wxColour(100 + i, 50, 150 - i)));
            dc.SetPen(*wxTRANSPARENT_PEN);
            dc.DrawRectangle(460 + i, y, 10, 100);
        }
        dc.SetPen(*wxBLACK_PEN);
        dc.DrawRectangle(460, y, 100, 100);
        dc.DrawBitmap(m_bitmapWithMask, 470, y + 10, true);
    }

    void Log(const wxString& msg)
    {
        m_log->AppendText(msg + "\n");
    }

    wxPanel* m_drawPanel;
    wxTextCtrl* m_log;
    wxBitmap m_bitmapWithMask;
    wxBitmap m_bitmapNoMask;
    wxBitmap m_bitmapGreenMask;
    wxBitmap m_bitmapCheckerboard;
};

class BitmaskApp : public wxApp
{
public:
    virtual bool OnInit() override
    {
        BitmaskFrame* frame = new BitmaskFrame();
        frame->Show();
        return true;
    }
};

wxIMPLEMENT_APP(BitmaskApp);
