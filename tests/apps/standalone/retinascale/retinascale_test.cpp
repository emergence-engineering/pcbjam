// Retina/HiDPI Scaling Test
// Verifies that bitmaps render at correct logical pixel sizes regardless of
// display scale factor. Icons should appear the same size on 1x and 2x displays.

#include "wx/wx.h"
#include "wx/dcmemory.h"

// Create a colored icon bitmap at the given size with scaleFactor=1.0
// (matching how KiCad creates toolbar icons via KiScaledBitmap)
wxBitmap CreateTestIcon(const wxColour& color, int size)
{
    wxBitmap bmp(size, size);
    wxMemoryDC dc(bmp);

    dc.SetBackground(wxBrush(wxColour(240, 240, 240)));
    dc.Clear();

    dc.SetPen(wxPen(*wxBLACK, 1));
    dc.SetBrush(wxBrush(color));
    dc.DrawRectangle(1, 1, size - 2, size - 2);

    // Draw a diagonal cross to make scaling visible
    dc.SetPen(wxPen(color, 2));
    dc.DrawLine(2, 2, size - 2, size - 2);
    dc.DrawLine(size - 2, 2, 2, size - 2);

    return bmp;
}

class RetinaScaleFrame : public wxFrame
{
public:
    RetinaScaleFrame() : wxFrame(nullptr, wxID_ANY, "Retina Scale Test",
                                  wxDefaultPosition, wxSize(800, 600))
    {
        // Log scale factor info
        double contentSF = GetContentScaleFactor();
        double dpiSF = GetDPIScaleFactor();
        wxLogMessage("ContentScaleFactor: %.1f, DPIScaleFactor: %.1f", contentSF, dpiSF);

        wxPanel* panel = new wxPanel(this);
        wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

        // Create a toolbar with icons at different sizes
        wxToolBar* toolbar = CreateToolBar();
        toolbar->SetName("toolbar");

        wxBitmap icon16 = CreateTestIcon(*wxRED, 16);
        wxBitmap icon24 = CreateTestIcon(*wxBLUE, 24);
        wxBitmap icon32 = CreateTestIcon(*wxGREEN, 32);

        toolbar->AddTool(1001, "Icon16", icon16, "16px icon");
        toolbar->AddTool(1002, "Icon24", icon24, "24px icon");
        toolbar->AddTool(1003, "Icon32", icon32, "32px icon");
        toolbar->Realize();

        // Info label
        wxString info = wxString::Format(
            "Scale: content=%.1f dpi=%.1f\n"
            "Icons should be 16, 24, 32 logical pixels wide respectively.\n"
            "Below: bitmap buttons with the same icons for comparison.",
            contentSF, dpiSF);

        wxStaticText* label = new wxStaticText(panel, wxID_ANY, info);
        label->SetName("info");
        mainSizer->Add(label, 0, wxALL, 10);

        // Bitmap buttons row for comparison
        wxBoxSizer* btnSizer = new wxBoxSizer(wxHORIZONTAL);

        wxBitmapButton* btn16 = new wxBitmapButton(panel, wxID_ANY, icon16);
        btn16->SetName("btn16");
        btnSizer->Add(btn16, 0, wxALL, 5);

        wxBitmapButton* btn24 = new wxBitmapButton(panel, wxID_ANY, icon24);
        btn24->SetName("btn24");
        btnSizer->Add(btn24, 0, wxALL, 5);

        wxBitmapButton* btn32 = new wxBitmapButton(panel, wxID_ANY, icon32);
        btn32->SetName("btn32");
        btnSizer->Add(btn32, 0, wxALL, 5);

        mainSizer->Add(btnSizer, 0, wxLEFT, 5);

        // Reference line: a static text showing expected sizes
        wxStaticText* refLabel = new wxStaticText(panel, wxID_ANY,
            "If scaling is correct, the red icon above should be ~16px, "
            "blue ~24px, green ~32px (logical pixels).");
        refLabel->SetName("reference");
        mainSizer->Add(refLabel, 0, wxALL, 10);

        panel->SetSizer(mainSizer);

        wxLogMessage("RetinaScaleFrame created successfully");
    }
};

class RetinaScaleApp : public wxApp
{
public:
    bool OnInit() override
    {
        RetinaScaleFrame* frame = new RetinaScaleFrame();
        frame->Show(true);
        return true;
    }
};

wxIMPLEMENT_APP(RetinaScaleApp);
