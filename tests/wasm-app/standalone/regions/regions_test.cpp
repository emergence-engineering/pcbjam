// Region Clipping Test - Tests non-rectangular clipping regions
// Tests: wxRegion, wxDC::SetDeviceClippingRegion(), Union/Subtract/Intersect

#include "wx/wx.h"
#include "wx/dcmemory.h"
#include "wx/region.h"

class RegionsFrame : public wxFrame
{
public:
    RegionsFrame() : wxFrame(nullptr, wxID_ANY, "Region Clipping Test",
                              wxDefaultPosition, wxSize(900, 700))
    {
        wxPanel* mainPanel = new wxPanel(this);
        wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

        // Description
        wxStaticText* desc = new wxStaticText(mainPanel, wxID_ANY,
            "Tests non-rectangular region clipping.\n"
            "Uses wxRegion with Union, Subtract, and Intersect operations.");
        mainSizer->Add(desc, 0, wxALL, 5);

        // Drawing panel
        m_drawPanel = new wxPanel(mainPanel, wxID_ANY, wxDefaultPosition, wxSize(-1, 550));
        m_drawPanel->SetBackgroundColour(*wxWHITE);
        m_drawPanel->Bind(wxEVT_PAINT, &RegionsFrame::OnPaint, this);
        mainSizer->Add(m_drawPanel, 1, wxEXPAND | wxALL, 5);

        // Event log
        mainSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Event Log"), 0, wxLEFT | wxTOP, 5);
        m_log = new wxTextCtrl(mainPanel, wxID_ANY, "", wxDefaultPosition, wxSize(-1, 80),
                               wxTE_MULTILINE | wxTE_READONLY);
        mainSizer->Add(m_log, 0, wxEXPAND | wxALL, 5);

        mainPanel->SetSizer(mainSizer);

        CreateStatusBar();
        SetStatusText("Region clipping test app started");
        Log("Region clipping test app started");
        Log("Testing non-rectangular region clipping");
    }

private:
    void DrawTestPattern(wxDC& dc, int x, int y, int w, int h)
    {
        // Draw a gradient-like pattern that makes clipping visible
        for (int i = 0; i < w; i += 5)
        {
            dc.SetPen(wxPen(wxColour(255 * i / w, 100, 255 - 255 * i / w)));
            dc.DrawLine(x + i, y, x + i, y + h);
        }

        // Draw some shapes
        dc.SetBrush(wxBrush(wxColour(255, 200, 0, 128)));
        dc.SetPen(wxPen(*wxBLACK, 2));
        dc.DrawCircle(x + w/2, y + h/2, w/3);

        dc.SetBrush(wxBrush(wxColour(0, 200, 255, 128)));
        dc.DrawRectangle(x + w/4, y + h/4, w/2, h/2);
    }

    void OnPaint(wxPaintEvent& event)
    {
        wxPaintDC dc(m_drawPanel);
        dc.SetBackground(*wxWHITE_BRUSH);
        dc.Clear();

        int y = 10;
        const int boxWidth = 200;
        const int boxHeight = 150;
        const int spacing = 20;

        dc.SetFont(wxFont(10, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_BOLD));

        // Row 1: Basic region types

        // 1a: No clipping (reference)
        dc.DrawText("No Clipping (reference)", 20, y);
        y += 15;
        DrawTestPattern(dc, 20, y, boxWidth, boxHeight);

        // 1b: Single rectangle clipping
        dc.DrawText("Single Rectangle", 20 + boxWidth + spacing, y - 15);
        wxRegion singleRect(20 + boxWidth + spacing + 20, y + 20, boxWidth - 40, boxHeight - 40);
        dc.SetDeviceClippingRegion(singleRect);
        DrawTestPattern(dc, 20 + boxWidth + spacing, y, boxWidth, boxHeight);
        dc.DestroyClippingRegion();

        // 1c: Two rectangles (union)
        dc.DrawText("Two Rectangles (Union)", 20 + (boxWidth + spacing) * 2, y - 15);
        wxRegion twoRects;
        twoRects.Union(wxRect(20 + (boxWidth + spacing) * 2, y, boxWidth / 2, boxHeight / 2));
        twoRects.Union(wxRect(20 + (boxWidth + spacing) * 2 + boxWidth / 2, y + boxHeight / 2, boxWidth / 2, boxHeight / 2));
        dc.SetDeviceClippingRegion(twoRects);
        DrawTestPattern(dc, 20 + (boxWidth + spacing) * 2, y, boxWidth, boxHeight);
        dc.DestroyClippingRegion();

        // 1d: L-shaped region
        dc.DrawText("L-Shape (Union)", 20 + (boxWidth + spacing) * 3, y - 15);
        wxRegion lShape;
        int lx = 20 + (boxWidth + spacing) * 3;
        lShape.Union(wxRect(lx, y, boxWidth / 3, boxHeight));  // Vertical bar
        lShape.Union(wxRect(lx, y + boxHeight * 2 / 3, boxWidth, boxHeight / 3));  // Horizontal bar
        dc.SetDeviceClippingRegion(lShape);
        DrawTestPattern(dc, lx, y, boxWidth, boxHeight);
        dc.DestroyClippingRegion();

        y += boxHeight + 40;

        // Row 2: Complex regions

        // 2a: Cross shape
        dc.DrawText("Cross (Two Rects)", 20, y);
        y += 15;
        wxRegion cross;
        cross.Union(wxRect(20 + boxWidth / 3, y, boxWidth / 3, boxHeight));  // Vertical
        cross.Union(wxRect(20, y + boxHeight / 3, boxWidth, boxHeight / 3));  // Horizontal
        dc.SetDeviceClippingRegion(cross);
        DrawTestPattern(dc, 20, y, boxWidth, boxHeight);
        dc.DestroyClippingRegion();

        // 2b: Checkerboard pattern (4 squares)
        dc.DrawText("Checkerboard (4 Rects)", 20 + boxWidth + spacing, y - 15);
        wxRegion checkerboard;
        int cx = 20 + boxWidth + spacing;
        int halfW = boxWidth / 2;
        int halfH = boxHeight / 2;
        checkerboard.Union(wxRect(cx, y, halfW, halfH));
        checkerboard.Union(wxRect(cx + halfW, y + halfH, halfW, halfH));
        dc.SetDeviceClippingRegion(checkerboard);
        DrawTestPattern(dc, cx, y, boxWidth, boxHeight);
        dc.DestroyClippingRegion();

        // 2c: Diagonal stripes (multiple rectangles)
        dc.DrawText("Stripes (Multiple)", 20 + (boxWidth + spacing) * 2, y - 15);
        wxRegion stripes;
        int sx = 20 + (boxWidth + spacing) * 2;
        int stripeW = boxWidth / 5;
        for (int i = 0; i < 3; i++)
        {
            stripes.Union(wxRect(sx + i * stripeW * 2, y, stripeW, boxHeight));
        }
        dc.SetDeviceClippingRegion(stripes);
        DrawTestPattern(dc, sx, y, boxWidth, boxHeight);
        dc.DestroyClippingRegion();

        // 2d: Frame (subtract inner rect)
        dc.DrawText("Frame (Subtract)", 20 + (boxWidth + spacing) * 3, y - 15);
        wxRegion frame(20 + (boxWidth + spacing) * 3, y, boxWidth, boxHeight);
        int fx = 20 + (boxWidth + spacing) * 3;
        frame.Subtract(wxRect(fx + 30, y + 30, boxWidth - 60, boxHeight - 60));
        dc.SetDeviceClippingRegion(frame);
        DrawTestPattern(dc, fx, y, boxWidth, boxHeight);
        dc.DestroyClippingRegion();

        y += boxHeight + 40;

        // Row 3: More complex patterns

        // 3a: Grid pattern
        dc.DrawText("Grid (9 Rects)", 20, y);
        y += 15;
        wxRegion grid;
        int cellW = boxWidth / 5;
        int cellH = boxHeight / 5;
        for (int row = 0; row < 3; row++)
        {
            for (int col = 0; col < 3; col++)
            {
                grid.Union(wxRect(20 + col * cellW * 2, y + row * cellH * 2, cellW, cellH));
            }
        }
        dc.SetDeviceClippingRegion(grid);
        DrawTestPattern(dc, 20, y, boxWidth, boxHeight);
        dc.DestroyClippingRegion();

        // 3b: T-shape
        dc.DrawText("T-Shape", 20 + boxWidth + spacing, y - 15);
        wxRegion tShape;
        int tx = 20 + boxWidth + spacing;
        tShape.Union(wxRect(tx, y, boxWidth, boxHeight / 3));  // Top bar
        tShape.Union(wxRect(tx + boxWidth / 3, y, boxWidth / 3, boxHeight));  // Vertical stem
        dc.SetDeviceClippingRegion(tShape);
        DrawTestPattern(dc, tx, y, boxWidth, boxHeight);
        dc.DestroyClippingRegion();

        // 3c: Corner rectangles
        dc.DrawText("4 Corners", 20 + (boxWidth + spacing) * 2, y - 15);
        wxRegion corners;
        int cornx = 20 + (boxWidth + spacing) * 2;
        int cornSize = boxWidth / 4;
        corners.Union(wxRect(cornx, y, cornSize, cornSize));  // Top-left
        corners.Union(wxRect(cornx + boxWidth - cornSize, y, cornSize, cornSize));  // Top-right
        corners.Union(wxRect(cornx, y + boxHeight - cornSize, cornSize, cornSize));  // Bottom-left
        corners.Union(wxRect(cornx + boxWidth - cornSize, y + boxHeight - cornSize, cornSize, cornSize));  // Bottom-right
        dc.SetDeviceClippingRegion(corners);
        DrawTestPattern(dc, cornx, y, boxWidth, boxHeight);
        dc.DestroyClippingRegion();

        // 3d: Staircase
        dc.DrawText("Staircase", 20 + (boxWidth + spacing) * 3, y - 15);
        wxRegion stairs;
        int stx = 20 + (boxWidth + spacing) * 3;
        int stepW = boxWidth / 4;
        int stepH = boxHeight / 4;
        for (int i = 0; i < 4; i++)
        {
            stairs.Union(wxRect(stx + i * stepW, y + i * stepH, boxWidth - i * stepW, stepH));
        }
        dc.SetDeviceClippingRegion(stairs);
        DrawTestPattern(dc, stx, y, boxWidth, boxHeight);
        dc.DestroyClippingRegion();
    }

    void Log(const wxString& msg)
    {
        m_log->AppendText(msg + "\n");
    }

    wxPanel* m_drawPanel;
    wxTextCtrl* m_log;
};

class RegionsApp : public wxApp
{
public:
    virtual bool OnInit() override
    {
        RegionsFrame* frame = new RegionsFrame();
        frame->Show();
        return true;
    }
};

wxIMPLEMENT_APP(RegionsApp);
