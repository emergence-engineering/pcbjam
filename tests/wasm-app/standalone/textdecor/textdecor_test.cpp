// Text Decorations Test - Tests underline and strikethrough rendering
// Tests: wxFont::SetUnderlined(), wxFont::SetStrikethrough(), wxDC::DrawText()

#include "wx/wx.h"

class TextDecorFrame : public wxFrame
{
public:
    TextDecorFrame() : wxFrame(nullptr, wxID_ANY, "Text Decorations Test",
                                wxDefaultPosition, wxSize(800, 600))
    {
        wxPanel* mainPanel = new wxPanel(this);
        wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

        // Description
        wxStaticText* desc = new wxStaticText(mainPanel, wxID_ANY,
            "Tests underline and strikethrough text rendering.\n"
            "Uses wxFont::SetUnderlined() and wxFont::SetStrikethrough().");
        mainSizer->Add(desc, 0, wxALL, 5);

        // Drawing panel
        m_drawPanel = new wxPanel(mainPanel, wxID_ANY, wxDefaultPosition, wxSize(-1, 400));
        m_drawPanel->SetBackgroundColour(*wxWHITE);
        m_drawPanel->Bind(wxEVT_PAINT, &TextDecorFrame::OnPaint, this);
        mainSizer->Add(m_drawPanel, 1, wxEXPAND | wxALL, 5);

        // Event log
        mainSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Event Log"), 0, wxLEFT | wxTOP, 5);
        m_log = new wxTextCtrl(mainPanel, wxID_ANY, "", wxDefaultPosition, wxSize(-1, 100),
                               wxTE_MULTILINE | wxTE_READONLY);
        mainSizer->Add(m_log, 0, wxEXPAND | wxALL, 5);

        mainPanel->SetSizer(mainSizer);

        CreateStatusBar();
        SetStatusText("Text decoration test app started");
        Log("Text decoration test app started");
        Log("Testing underline, strikethrough, and combined decorations");
    }

private:
    void OnPaint(wxPaintEvent& event)
    {
        wxPaintDC dc(m_drawPanel);
        dc.SetBackground(*wxWHITE_BRUSH);
        dc.Clear();

        int y = 20;
        const int lineHeight = 40;
        const int x = 20;

        // Section 1: Normal text (no decorations)
        dc.SetFont(wxFont(16, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL));
        dc.SetTextForeground(*wxBLACK);
        dc.DrawText("Normal text (no decorations)", x, y);
        y += lineHeight;

        // Section 2: Underlined text
        wxFont underlineFont(16, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL);
        underlineFont.SetUnderlined(true);
        dc.SetFont(underlineFont);
        dc.DrawText("Underlined text", x, y);
        y += lineHeight;

        // Section 3: Strikethrough text
        wxFont strikeFont(16, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL);
        strikeFont.SetStrikethrough(true);
        dc.SetFont(strikeFont);
        dc.DrawText("Strikethrough text", x, y);
        y += lineHeight;

        // Section 4: Both underline and strikethrough
        wxFont bothFont(16, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL);
        bothFont.SetUnderlined(true);
        bothFont.SetStrikethrough(true);
        dc.SetFont(bothFont);
        dc.DrawText("Both underline and strikethrough", x, y);
        y += lineHeight + 10;

        // Section 5: Different font sizes with underline
        dc.SetTextForeground(wxColour(0, 0, 128));  // Dark blue
        int sizes[] = {10, 14, 18, 24, 32};
        for (int size : sizes)
        {
            wxFont sizedFont(size, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL);
            sizedFont.SetUnderlined(true);
            dc.SetFont(sizedFont);
            dc.DrawText(wxString::Format("%dpt underlined", size), x, y);
            y += size + 12;
        }

        y += 10;

        // Section 6: Different colors with strikethrough
        wxColour colors[] = {*wxRED, *wxGREEN, *wxBLUE, wxColour(128, 0, 128)};
        const char* colorNames[] = {"Red", "Green", "Blue", "Purple"};
        wxFont colorFont(16, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL);
        colorFont.SetStrikethrough(true);
        dc.SetFont(colorFont);

        int xPos = x;
        for (int i = 0; i < 4; i++)
        {
            dc.SetTextForeground(colors[i]);
            dc.DrawText(wxString::Format("%s strikethrough", colorNames[i]), xPos, y);
            xPos += 180;
        }
        y += lineHeight;

        // Section 7: Bold and italic with decorations
        y += 10;
        dc.SetTextForeground(*wxBLACK);

        wxFont boldUnderline(16, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_BOLD);
        boldUnderline.SetUnderlined(true);
        dc.SetFont(boldUnderline);
        dc.DrawText("Bold + Underlined", x, y);

        wxFont italicStrike(16, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_ITALIC, wxFONTWEIGHT_NORMAL);
        italicStrike.SetStrikethrough(true);
        dc.SetFont(italicStrike);
        dc.DrawText("Italic + Strikethrough", x + 250, y);

        wxFont boldItalicBoth(16, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_ITALIC, wxFONTWEIGHT_BOLD);
        boldItalicBoth.SetUnderlined(true);
        boldItalicBoth.SetStrikethrough(true);
        dc.SetFont(boldItalicBoth);
        dc.DrawText("Bold + Italic + Both", x + 500, y);
    }

    void Log(const wxString& msg)
    {
        m_log->AppendText(msg + "\n");
    }

    wxPanel* m_drawPanel;
    wxTextCtrl* m_log;
};

class TextDecorApp : public wxApp
{
public:
    virtual bool OnInit() override
    {
        TextDecorFrame* frame = new TextDecorFrame();
        frame->Show();
        return true;
    }
};

wxIMPLEMENT_APP(TextDecorApp);
